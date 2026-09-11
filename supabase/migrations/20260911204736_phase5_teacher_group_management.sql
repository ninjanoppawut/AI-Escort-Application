begin;

-- Session stubs ---------------------------------------------------------------
-- Sessions arrive in Phase 6 and 7. These helpers keep teacher group operations
-- honest about history and active participation today; Phase 6/7 migrations
-- must replace them with checks against session participant snapshots.

create function private.group_has_session_history(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_group_id is null and false;
$$;

create function private.group_in_active_session(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_group_id is null and false;
$$;

create function private.require_class_teacher(target_class_id uuid, lock_class boolean)
returns public.classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  class_row public.classes%rowtype;
begin
  if lock_class then
    select * into class_row from public.classes as class where class.id = target_class_id for update;
  else
    select * into class_row from public.classes as class where class.id = target_class_id;
  end if;

  if class_row.id is null or not exists (
    select 1
    from public.class_members as membership
    where membership.class_id = target_class_id
      and membership.user_id = actor_user_id
      and membership.role = 'teacher'
      and membership.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform private.require_active_class(target_class_id);

  if not (select private.is_active_class_teacher(actor_user_id, target_class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return class_row;
end;
$$;

-- Teacher-created group (MGT-002) ----------------------------------------------

create function public.create_teacher_group(
  target_class_id uuid,
  group_name text,
  group_description text default null,
  leader_student_id uuid default null,
  member_student_ids uuid[] default '{}'
)
returns table(
  outcome text,
  error_code text,
  group_id uuid,
  class_id uuid,
  member_count integer,
  current_group_count integer,
  maximum_groups integer,
  remaining_group_slots integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  trimmed_name text := btrim(coalesce(group_name, ''));
  trimmed_description text := nullif(btrim(coalesce(group_description, '')), '');
  member_ids uuid[];
  placed_ids uuid[];
  existing_group_count integer;
  denial_code text;
  inserted_group public.groups%rowtype;
  member_id uuid;
begin
  actor_profile := private.require_active_verified_actor();
  -- Same class-row lock as create_student_group: the maximum is absolute (D-047).
  class_row := private.require_class_teacher(target_class_id, true);

  if char_length(trimmed_name) not between 1 and 120
    or (trimmed_description is not null and char_length(trimmed_description) > 1000) then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  select coalesce(array_agg(distinct candidate), '{}')
  into member_ids
  from unnest(coalesce(member_student_ids, '{}')) as candidate
  where candidate is distinct from leader_student_id;

  placed_ids := case
    when leader_student_id is null then member_ids
    else array_prepend(leader_student_id, member_ids)
  end;

  if exists (
    select 1
    from unnest(placed_ids) as candidate
    where not (select private.is_active_class_student(candidate, class_row.id))
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  existing_group_count := private.count_current_class_groups(class_row.id);

  denial_code := case
    when existing_group_count >= class_row.maximum_groups then 'GROUP_LIMIT_REACHED'
    when leader_student_id is null and cardinality(member_ids) > 0 then 'LEADER_SUCCESSOR_REQUIRED'
    when cardinality(placed_ids) > class_row.max_group_size then 'GROUP_FULL'
    when exists (
      select 1
      from public.group_members as member
      where member.class_id = class_row.id
        and member.user_id = any(placed_ids)
        and member.status = 'active'
    ) then 'STUDENT_ALREADY_IN_GROUP'
    else null
  end;

  if denial_code is not null then
    perform private.insert_group_research_event(
      'group_creation_failed', actor_profile.id, class_row.school_id, class_row.id, null,
      jsonb_build_object('error_code', denial_code)
    );

    return query
    select 'denied'::text, denial_code, null::uuid, class_row.id, 0, existing_group_count,
      class_row.maximum_groups, greatest(class_row.maximum_groups - existing_group_count, 0);
    return;
  end if;

  insert into public.groups (class_id, name, description, created_by, creator_type, status)
  values (class_row.id, trimmed_name, trimmed_description, actor_profile.id, 'teacher', 'forming')
  returning * into inserted_group;

  if leader_student_id is not null then
    insert into public.group_members (class_id, group_id, user_id, role, status, joined_at, invited_by)
    values (class_row.id, inserted_group.id, leader_student_id, 'leader', 'active', now(), actor_profile.id);

    insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, payload)
    values
      (class_row.id, inserted_group.id, leader_student_id, 'joined', actor_profile.id,
        jsonb_build_object('role', 'leader', 'source', 'teacher_group_creation')),
      (class_row.id, inserted_group.id, leader_student_id, 'became_leader', actor_profile.id,
        jsonb_build_object('source', 'teacher_group_creation'));

    insert into public.notifications (
      recipient_id, type, title, message, entity_type, entity_id, payload, class_id, group_id, actor_id
    )
    values (
      leader_student_id, 'leadership_assigned', 'คุณเป็นหัวหน้ากลุ่มแล้ว',
      'คุณได้รับมอบหมายเป็นหัวหน้ากลุ่ม ' || inserted_group.name, 'group', inserted_group.id,
      jsonb_build_object('classId', class_row.id, 'groupId', inserted_group.id, 'groupName', inserted_group.name),
      class_row.id, inserted_group.id, actor_profile.id
    );
  end if;

  foreach member_id in array member_ids loop
    insert into public.group_members (class_id, group_id, user_id, role, status, joined_at, invited_by)
    values (class_row.id, inserted_group.id, member_id, 'member', 'active', now(), actor_profile.id);

    insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, payload)
    values (class_row.id, inserted_group.id, member_id, 'joined', actor_profile.id,
      jsonb_build_object('role', 'member', 'source', 'teacher_group_creation'));

    insert into public.notifications (
      recipient_id, type, title, message, entity_type, entity_id, payload, class_id, group_id, actor_id
    )
    values (
      member_id, 'student_moved_group', 'ครูจัดคุณเข้ากลุ่ม',
      'ครูย้ายคุณไปกลุ่ม ' || inserted_group.name, 'group', inserted_group.id,
      jsonb_build_object('classId', class_row.id, 'groupId', inserted_group.id, 'groupName', inserted_group.name),
      class_row.id, inserted_group.id, actor_profile.id
    );
  end loop;

  update public.group_invitations as invitation
  set status = 'cancelled',
      responded_at = now(),
      cancelled_by = actor_profile.id
  where invitation.class_id = class_row.id
    and invitation.invitee_id = any(placed_ids)
    and invitation.status = 'pending';

  perform private.insert_audit_log(
    actor_profile.id, 'group_created', 'group', inserted_group.id, class_row.school_id, class_row.id,
    'succeeded',
    jsonb_build_object('creator_type', 'teacher', 'member_count', cardinality(placed_ids))
  );

  perform private.insert_group_research_event(
    'group_created', actor_profile.id, class_row.school_id, class_row.id, inserted_group.id,
    jsonb_build_object(
      'creator_type', 'teacher',
      'remaining_slots', greatest(class_row.maximum_groups - existing_group_count - 1, 0)
    )
  );

  return query
  select 'created'::text, null::text, inserted_group.id, class_row.id, cardinality(placed_ids),
    existing_group_count + 1, class_row.maximum_groups,
    greatest(class_row.maximum_groups - existing_group_count - 1, 0);
end;
$$;

-- Teacher move or return to unassigned (MGT-003, MGT-004) ----------------------

create function public.move_student_between_groups(
  target_class_id uuid,
  target_student_id uuid,
  target_destination_group_id uuid default null,
  target_successor_leader_id uuid default null
)
returns table(
  outcome text,
  error_code text,
  source_group_id uuid,
  destination_group_id uuid,
  student_id uuid,
  leader_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  source_member public.group_members%rowtype;
  source_group public.groups%rowtype;
  destination_group public.groups%rowtype;
  source_other_members integer := 0;
  destination_count integer := 0;
  denial_code text;
  changed_leader boolean := false;
  remaining integer;
begin
  actor_profile := private.require_active_verified_actor();
  class_row := private.require_class_teacher(target_class_id, false);

  if not (select private.is_active_class_student(target_student_id, class_row.id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  -- Lock order: student class membership, then groups by id.
  perform 1
  from public.class_members as membership
  where membership.class_id = class_row.id
    and membership.user_id = target_student_id
  for update;

  select *
  into source_member
  from public.group_members as member
  where member.class_id = class_row.id
    and member.user_id = target_student_id
    and member.status = 'active';

  if source_member.group_id is not distinct from target_destination_group_id then
    return query
    select 'unchanged'::text, null::text, source_member.group_id, target_destination_group_id,
      target_student_id, false;
    return;
  end if;

  perform 1
  from public.groups as candidate_group
  where candidate_group.id in (source_member.group_id, target_destination_group_id)
  order by candidate_group.id
  for update;

  if source_member.id is not null then
    select * into source_group from public.groups as candidate_group where candidate_group.id = source_member.group_id;
    select count(*)::integer
    into source_other_members
    from public.group_members as member
    where member.group_id = source_group.id
      and member.status = 'active'
      and member.user_id <> target_student_id;
  end if;

  if target_destination_group_id is not null then
    select * into destination_group from public.groups as candidate_group where candidate_group.id = target_destination_group_id;
    destination_count := private.group_active_member_count(target_destination_group_id);
  end if;

  denial_code := case
    when target_destination_group_id is not null and (
      destination_group.id is null
      or destination_group.class_id <> class_row.id
      or destination_group.deleted_at is not null
      or destination_group.status = 'archived'
    ) then 'DESTINATION_GROUP_INVALID'
    when source_group.status = 'locked' or destination_group.status = 'locked' then 'GROUP_LOCKED'
    when (source_group.id is not null and private.group_in_active_session(source_group.id))
      or (destination_group.id is not null and private.group_in_active_session(destination_group.id))
      then 'GROUP_IN_ACTIVE_SESSION'
    when destination_group.id is not null and destination_count >= class_row.max_group_size then 'GROUP_FULL'
    when source_member.role = 'leader' and source_other_members > 0 and target_successor_leader_id is null
      then 'LEADER_SUCCESSOR_REQUIRED'
    when target_successor_leader_id is not null and (
      source_member.role is distinct from 'leader'
      or target_successor_leader_id = target_student_id
      or not exists (
        select 1
        from public.group_members as member
        where member.group_id = source_member.group_id
          and member.user_id = target_successor_leader_id
          and member.status = 'active'
      )
    ) then 'INVALID_STATUS_TRANSITION'
    else null
  end;

  if denial_code is not null then
    return query
    select 'denied'::text, denial_code, source_member.group_id, target_destination_group_id,
      target_student_id, false;
    return;
  end if;

  if source_member.id is not null then
    update public.group_members as member
    set status = 'left',
        left_at = now()
    where member.id = source_member.id;

    insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, related_group_id, payload)
    values (
      class_row.id, source_group.id, target_student_id,
      case when target_destination_group_id is null then 'removed' else 'moved_out' end,
      actor_profile.id, target_destination_group_id,
      jsonb_build_object('source', 'teacher')
    );

    if source_member.role = 'leader' and target_successor_leader_id is not null then
      update public.group_members as member
      set role = 'leader'
      where member.group_id = source_group.id
        and member.user_id = target_successor_leader_id
        and member.status = 'active';

      insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, payload)
      values
        (class_row.id, source_group.id, target_student_id, 'leadership_transferred', actor_profile.id,
          jsonb_build_object('to_user_id', target_successor_leader_id, 'source', 'teacher_move')),
        (class_row.id, source_group.id, target_successor_leader_id, 'became_leader', actor_profile.id,
          jsonb_build_object('from_user_id', target_student_id, 'source', 'teacher_move'));

      insert into public.notifications (
        recipient_id, type, title, message, entity_type, entity_id, payload, class_id, group_id, actor_id
      )
      values (
        target_successor_leader_id, 'leadership_assigned', 'คุณเป็นหัวหน้ากลุ่มแล้ว',
        'คุณได้รับมอบหมายเป็นหัวหน้ากลุ่ม ' || source_group.name, 'group', source_group.id,
        jsonb_build_object('classId', class_row.id, 'groupId', source_group.id, 'groupName', source_group.name),
        class_row.id, source_group.id, actor_profile.id
      );

      insert into public.notifications (
        recipient_id, type, title, message, entity_type, entity_id, payload, class_id, group_id, actor_id
      )
      select
        member.user_id, 'leadership_transferred', 'หัวหน้ากลุ่มเปลี่ยนแล้ว',
        'หัวหน้ากลุ่ม ' || source_group.name || ' มีการเปลี่ยนแปลง', 'group', source_group.id,
        jsonb_build_object('classId', class_row.id, 'groupId', source_group.id, 'groupName', source_group.name),
        class_row.id, source_group.id, actor_profile.id
      from public.group_members as member
      where member.group_id = source_group.id
        and member.status = 'active'
        and member.user_id <> target_successor_leader_id;

      changed_leader := true;
    end if;

    remaining := private.group_active_member_count(source_group.id);
    if source_group.status = 'ready' and remaining < class_row.min_group_size then
      update public.groups as candidate_group
      set status = 'forming'
      where candidate_group.id = source_group.id;
    end if;
  end if;

  if destination_group.id is not null then
    insert into public.group_members (class_id, group_id, user_id, role, status, joined_at, left_at, invited_by)
    values (
      class_row.id, destination_group.id, target_student_id,
      case when destination_count = 0 then 'leader' else 'member' end,
      'active', now(), null, actor_profile.id
    )
    on conflict on constraint group_members_group_user_unique do update
    set role = excluded.role,
        status = 'active',
        left_at = null,
        joined_at = excluded.joined_at,
        invited_by = excluded.invited_by;

    insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, related_group_id, payload)
    values (
      class_row.id, destination_group.id, target_student_id, 'moved_in', actor_profile.id,
      source_member.group_id, jsonb_build_object('source', 'teacher')
    );

    insert into public.notifications (
      recipient_id, type, title, message, entity_type, entity_id, payload, class_id, group_id, actor_id
    )
    values (
      target_student_id, 'student_moved_group', 'ครูย้ายกลุ่มของคุณ',
      'ครูย้ายคุณไปกลุ่ม ' || destination_group.name, 'group', destination_group.id,
      jsonb_build_object('classId', class_row.id, 'groupId', destination_group.id, 'groupName', destination_group.name),
      class_row.id, destination_group.id, actor_profile.id
    );

    if destination_count = 0 then
      insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, payload)
      values (class_row.id, destination_group.id, target_student_id, 'became_leader', actor_profile.id,
        jsonb_build_object('source', 'teacher_move_into_empty_group'));

      insert into public.notifications (
        recipient_id, type, title, message, entity_type, entity_id, payload, class_id, group_id, actor_id
      )
      values (
        target_student_id, 'leadership_assigned', 'คุณเป็นหัวหน้ากลุ่มแล้ว',
        'คุณได้รับมอบหมายเป็นหัวหน้ากลุ่ม ' || destination_group.name, 'group', destination_group.id,
        jsonb_build_object('classId', class_row.id, 'groupId', destination_group.id, 'groupName', destination_group.name),
        class_row.id, destination_group.id, actor_profile.id
      );

      changed_leader := true;
    end if;
  end if;

  update public.group_invitations as invitation
  set status = 'cancelled',
      responded_at = now(),
      cancelled_by = actor_profile.id
  where invitation.class_id = class_row.id
    and invitation.invitee_id = target_student_id
    and invitation.status = 'pending';

  perform private.insert_audit_log(
    actor_profile.id, 'student_moved_between_groups', 'group_member', source_member.id,
    class_row.school_id, class_row.id, 'succeeded',
    jsonb_build_object(
      'student_id', target_student_id,
      'source_group_id', source_member.group_id,
      'destination_group_id', target_destination_group_id,
      'leader_changed', changed_leader
    )
  );

  perform private.insert_group_research_event(
    'student_moved_between_groups', actor_profile.id, class_row.school_id, class_row.id,
    coalesce(target_destination_group_id, source_member.group_id),
    jsonb_build_object(
      'leader_changed', changed_leader,
      'reason_category', case when target_destination_group_id is null then 'teacher_remove' else 'teacher_move' end
    )
  );

  return query
  select 'moved'::text, null::text, source_member.group_id, target_destination_group_id,
    target_student_id, changed_leader;
end;
$$;

revoke execute on function private.group_has_session_history(uuid) from public, anon, authenticated;
revoke execute on function private.group_in_active_session(uuid) from public, anon, authenticated;
revoke execute on function private.require_class_teacher(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.create_teacher_group(uuid, text, text, uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.move_student_between_groups(uuid, uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_teacher_group(uuid, text, text, uuid, uuid[]) to authenticated;
grant execute on function public.move_student_between_groups(uuid, uuid, uuid, uuid) to authenticated;

comment on function private.group_has_session_history(uuid) is
  'P5 stub returning false until Phase 6 adds session participant snapshots; Phase 6 must replace it.';
comment on function private.group_in_active_session(uuid) is
  'P5 stub returning false until Phase 7 adds active session groups; Phase 7 must replace it.';
comment on function public.create_teacher_group(uuid, text, text, uuid, uuid[]) is
  'P5-01 teacher-created group within the absolute class maximum. Locks the class row like student creation, places an optional leader and members from unassigned students, cancels their pending invitations, and notifies them.';
comment on function public.move_student_between_groups(uuid, uuid, uuid, uuid) is
  'P5-02 teacher move between groups or back to unassigned (null destination). Locks the student class membership and both groups by id; requires a successor when moving a leader out of a populated group; a student moved into an empty group becomes its leader.';

commit;
