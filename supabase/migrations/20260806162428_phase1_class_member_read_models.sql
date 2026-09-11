begin;

create index profiles_display_name_id_idx
  on public.profiles (display_name, id);

create index class_members_member_list_idx
  on public.class_members (class_id, status, role, id);

create function public.list_authorized_classes()
returns table (
  class_id uuid,
  school_id uuid,
  school_name text,
  name text,
  subject text,
  academic_year text,
  semester text,
  description text,
  min_group_size integer,
  max_group_size integer,
  maximum_groups integer,
  allow_student_groups boolean,
  group_formation_status text,
  status text,
  caller_role text,
  active_member_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.current_profile_is_active()) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return query
  select
    class_row.id,
    class_row.school_id,
    school.name,
    class_row.name,
    class_row.subject,
    class_row.academic_year,
    class_row.semester,
    class_row.description,
    class_row.min_group_size,
    class_row.max_group_size,
    class_row.maximum_groups,
    class_row.allow_student_groups,
    class_row.group_formation_status,
    class_row.status,
    caller_membership.role,
    (
      select count(*)
      from public.class_members as counted_member
      where counted_member.class_id = class_row.id
        and counted_member.status = 'active'
    ) as active_member_count,
    class_row.created_at
  from public.class_members as caller_membership
  join public.classes as class_row on class_row.id = caller_membership.class_id
  join public.schools as school on school.id = class_row.school_id
  where caller_membership.user_id = (select auth.uid())
    and caller_membership.status = 'active'
    and (
      caller_membership.role = 'teacher'
      or (class_row.status = 'active' and school.status = 'active')
    )
  order by class_row.created_at desc, class_row.id desc;
end;
$$;

create function public.list_class_members(
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
    null::uuid as current_group_id,
    null::text as current_group_name
  from public.class_members as member
  join public.profiles as profile on profile.id = member.user_id
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

revoke execute on function public.list_authorized_classes()
  from public, anon;
revoke execute on function public.list_class_members(uuid, text, text, integer, text, uuid)
  from public, anon;

grant execute on function public.list_authorized_classes()
  to authenticated;
grant execute on function public.list_class_members(uuid, text, text, integer, text, uuid)
  to authenticated;

comment on function public.list_authorized_classes() is
  'P1-05 class-list read model scoped by active class membership; students receive active classes only.';
comment on function public.list_class_members(uuid, text, text, integer, text, uuid) is
  'P1-05 cursor-paginated class-member read model; teacher rows include email, student rows omit classmate emails.';

commit;
