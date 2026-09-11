begin;

create function public.get_class_group_board(target_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_status text;
  actor_role text;
  class_row public.classes%rowtype;
  school_status text;
  group_count integer;
  viewer_group_id uuid;
  viewer_is_leader boolean := false;
  viewer_has_claim boolean := false;
  cannot_create_reason text;
  groups_json jsonb;
  unassigned_json jsonb;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select profile.status
  into actor_status
  from public.profiles as profile
  where profile.id = actor_user_id;

  if actor_status is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if actor_status <> 'active' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DISABLED';
  end if;

  select *
  into class_row
  from public.classes as class
  where class.id = target_class_id;

  if class_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select membership.role
  into actor_role
  from public.class_members as membership
  where membership.class_id = target_class_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';

  if actor_role is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select school.status
  into school_status
  from public.schools as school
  where school.id = class_row.school_id;

  if class_row.status <> 'active' or school_status is distinct from 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  if (actor_role = 'student'
      and not (select private.is_active_class_student(actor_user_id, target_class_id)))
    or (actor_role = 'teacher'
      and not (select private.is_active_class_teacher(actor_user_id, target_class_id))) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  group_count := private.count_current_class_groups(target_class_id);

  if actor_role = 'student' then
    -- Mirrors the eligibility order in create_student_group; the RPC remains the
    -- authority and revalidates under the class row lock.
    select member.group_id, member.role = 'leader'
    into viewer_group_id, viewer_is_leader
    from public.group_members as member
    where member.class_id = target_class_id
      and member.user_id = actor_user_id
      and member.status = 'active';

    select exists (
      select 1
      from public.student_group_creation_claims as claim
      where claim.class_id = target_class_id
        and claim.student_id = actor_user_id
        and claim.status = 'claimed'
    )
    into viewer_has_claim;

    cannot_create_reason := case
      when not class_row.allow_student_groups then 'STUDENT_GROUP_CREATION_DISABLED'
      when class_row.group_formation_status <> 'open' then 'GROUP_FORMATION_CLOSED'
      when viewer_group_id is not null then 'STUDENT_ALREADY_IN_GROUP'
      when viewer_has_claim then 'STUDENT_GROUP_ALREADY_CREATED'
      when group_count >= class_row.maximum_groups then 'GROUP_LIMIT_REACHED'
      else null
    end;
  else
    cannot_create_reason := 'FORBIDDEN';
  end if;

  select coalesce(
    jsonb_agg(group_entry.payload order by group_entry.created_at, group_entry.id),
    '[]'::jsonb
  )
  into groups_json
  from (
    select
      group_row.id,
      group_row.created_at,
      jsonb_build_object(
        'id', group_row.id,
        'name', group_row.name,
        'description', group_row.description,
        'status', group_row.status,
        'creatorType', group_row.creator_type,
        'leader', (
          select jsonb_build_object('id', leader_profile.id, 'displayName', leader_profile.display_name)
          from public.group_members as leader_member
          join public.profiles as leader_profile on leader_profile.id = leader_member.user_id
          where leader_member.group_id = group_row.id
            and leader_member.role = 'leader'
            and leader_member.status = 'active'
        ),
        'memberCount', member_stats.member_count,
        'maximumSize', class_row.max_group_size,
        'availableSeats', greatest(class_row.max_group_size - member_stats.member_count, 0),
        'meetsMinimumSize', member_stats.member_count >= class_row.min_group_size,
        'isAcceptingMembers',
          group_row.status in ('forming', 'ready', 'approved')
          and member_stats.member_count < class_row.max_group_size,
        'members', member_stats.members,
        'createdAt', group_row.created_at
      ) as payload
    from public.groups as group_row
    cross join lateral (
      select
        count(*)::integer as member_count,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', member_profile.id,
              'displayName', member_profile.display_name,
              'role', group_member.role
            )
            order by (group_member.role = 'leader') desc, member_profile.display_name, member_profile.id
          ),
          '[]'::jsonb
        ) as members
      from public.group_members as group_member
      join public.profiles as member_profile on member_profile.id = group_member.user_id
      where group_member.group_id = group_row.id
        and group_member.status = 'active'
    ) as member_stats
    where group_row.class_id = target_class_id
      and group_row.deleted_at is null
      and group_row.status <> 'archived'
  ) as group_entry;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', student_profile.id, 'displayName', student_profile.display_name)
      order by student_profile.display_name, student_profile.id
    ),
    '[]'::jsonb
  )
  into unassigned_json
  from public.class_members as class_member
  join public.profiles as student_profile on student_profile.id = class_member.user_id
  where class_member.class_id = target_class_id
    and class_member.role = 'student'
    and class_member.status = 'active'
    and not exists (
      select 1
      from public.group_members as group_member
      where group_member.class_id = target_class_id
        and group_member.user_id = class_member.user_id
        and group_member.status = 'active'
    );

  return jsonb_build_object(
    'classId', class_row.id,
    'className', class_row.name,
    'formationStatus', class_row.group_formation_status,
    'allowStudentGroups', class_row.allow_student_groups,
    'maximumGroups', class_row.maximum_groups,
    'currentGroupCount', group_count,
    'remainingGroupSlots', greatest(class_row.maximum_groups - group_count, 0),
    'minimumGroupSize', class_row.min_group_size,
    'maximumGroupSize', class_row.max_group_size,
    'viewer', jsonb_build_object(
      'userId', actor_user_id,
      'role', actor_role,
      'currentGroupId', viewer_group_id,
      'isLeader', coalesce(viewer_is_leader, false),
      'hasCreatedStudentGroup', viewer_has_claim,
      'canCreateGroup', cannot_create_reason is null,
      'cannotCreateReason', cannot_create_reason
    ),
    'groups', groups_json,
    'unassignedStudents', unassigned_json,
    'refreshedAt', now()
  );
end;
$$;

create or replace function public.list_class_members(
  target_class_id uuid,
  role_filter text default null,
  status_filter text default 'active',
  page_limit integer default 50,
  cursor_display_name text default null,
  cursor_member_id uuid default null
)
returns table (
  member_id uuid,
  class_id uuid,
  user_id uuid,
  display_name text,
  email text,
  role text,
  status text,
  joined_at timestamptz,
  left_at timestamptz,
  current_group_id uuid,
  current_group_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_is_teacher boolean;
  caller_is_member boolean;
  bounded_limit integer := least(greatest(coalesce(page_limit, 50), 1), 101);
  target_class_status text;
begin
  if role_filter is not null and role_filter not in ('student', 'teacher') then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  if status_filter is not null and status_filter not in ('active', 'left') then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  select class_row.status
  into target_class_status
  from public.classes as class_row
  where class_row.id = target_class_id;

  if target_class_status is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if target_class_status <> 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  select exists (
    select 1
    from public.class_members as membership
    where membership.class_id = target_class_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
  into caller_is_member;

  if not (select private.current_profile_is_active()) or not caller_is_member then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select (select private.current_user_is_class_teacher(target_class_id))
  into caller_is_teacher;

  return query
  select
    member.id,
    member.class_id,
    member.user_id,
    profile.display_name,
    case when caller_is_teacher then profile.email else null end as email,
    member.role,
    member.status,
    member.joined_at,
    member.left_at,
    current_group.id as current_group_id,
    current_group.name as current_group_name
  from public.class_members as member
  join public.profiles as profile on profile.id = member.user_id
  left join lateral (
    select group_row.id, group_row.name
    from public.group_members as group_member
    join public.groups as group_row on group_row.id = group_member.group_id
    where group_member.class_id = member.class_id
      and group_member.user_id = member.user_id
      and group_member.status = 'active'
      and group_row.deleted_at is null
      and group_row.status <> 'archived'
    limit 1
  ) as current_group on true
  where member.class_id = target_class_id
    and (
      caller_is_teacher
      or (member.role = 'student' and member.status = 'active')
    )
    and (role_filter is null or member.role = role_filter)
    and (status_filter is null or member.status = status_filter)
    and (
      cursor_display_name is null
      or cursor_member_id is null
      or (profile.display_name, member.id) > (cursor_display_name, cursor_member_id)
    )
  order by profile.display_name asc, member.id asc
  limit bounded_limit;
end;
$$;

revoke execute on function public.get_class_group_board(uuid)
  from public, anon, authenticated;
grant execute on function public.get_class_group_board(uuid)
  to authenticated;

comment on function public.get_class_group_board(uuid) is
  'P3-03 authoritative group-board read model for active class members: slot counts, formation settings, current groups with leader/members/capacity, unassigned students, and the viewer create-group eligibility reason. No emails are returned.';
comment on function public.list_class_members(uuid, text, text, integer, text, uuid) is
  'P1-05 cursor-paginated class-member read model; P3-03 fills the current non-deleted, non-archived group. Teacher rows include email, student rows omit classmate emails.';

commit;
