begin;

-- Readiness -------------------------------------------------------------------

create function public.mark_group_ready(target_group_id uuid)
returns table(
  outcome text,
  error_code text,
  group_id uuid,
  class_id uuid,
  status text,
  member_count integer,
  minimum_size integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  current_member_count integer;
  denial_code text;
begin
  actor_profile := private.require_active_verified_actor();

  select *
  into group_row
  from public.groups as candidate_group
  where candidate_group.id = target_group_id
  for update;

  if group_row.id is null or group_row.deleted_at is not null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform private.require_group_manager(actor_profile.id, group_row.class_id, group_row.id);

  -- Readiness is the leader telling the teacher; a teacher approves instead.
  if not exists (
    select 1
    from public.group_members as member
    where member.group_id = group_row.id
      and member.user_id = actor_profile.id
      and member.role = 'leader'
      and member.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'NOT_GROUP_LEADER';
  end if;

  class_row := private.require_active_class(group_row.class_id);
  current_member_count := private.group_active_member_count(group_row.id);

  if group_row.status = 'ready' then
    return query
    select 'ready'::text, null::text, group_row.id, class_row.id, group_row.status,
      current_member_count, class_row.min_group_size;
    return;
  end if;

  denial_code := case
    when group_row.status in ('locked', 'archived') then 'GROUP_LOCKED'
    when group_row.status <> 'forming' then 'INVALID_STATUS_TRANSITION'
    when class_row.group_formation_status <> 'open' then 'GROUP_FORMATION_CLOSED'
    when current_member_count < class_row.min_group_size then 'INVALID_STATUS_TRANSITION'
    else null
  end;

  if denial_code is not null then
    return query
    select 'denied'::text, denial_code, group_row.id, class_row.id, group_row.status,
      current_member_count, class_row.min_group_size;
    return;
  end if;

  update public.groups as candidate_group
  set status = 'ready'
  where candidate_group.id = group_row.id;

  insert into public.notifications (
    recipient_id, type, title, message, entity_type, entity_id, payload,
    class_id, group_id, actor_id
  )
  select
    teacher_member.user_id,
    'group_approval_requested',
    'กลุ่มขอให้ครูตรวจ',
    'กลุ่ม ' || group_row.name || ' ขอให้ครูตรวจและอนุมัติ',
    'group',
    group_row.id,
    jsonb_build_object(
      'classId', class_row.id,
      'groupId', group_row.id,
      'groupName', group_row.name,
      'memberCount', current_member_count
    ),
    class_row.id,
    group_row.id,
    actor_profile.id
  from public.class_members as teacher_member
  where teacher_member.class_id = class_row.id
    and teacher_member.role = 'teacher'
    and teacher_member.status = 'active';

  perform private.insert_audit_log(
    actor_profile.id,
    'group_marked_ready',
    'group',
    group_row.id,
    class_row.school_id,
    class_row.id,
    'succeeded',
    jsonb_build_object('member_count', current_member_count)
  );

  return query
  select 'ready'::text, null::text, group_row.id, class_row.id, 'ready'::text,
    current_member_count, class_row.min_group_size;
end;
$$;

-- Leadership transfer ---------------------------------------------------------

create function public.transfer_group_leadership(
  target_group_id uuid,
  target_new_leader_id uuid
)
returns table(
  outcome text,
  error_code text,
  group_id uuid,
  class_id uuid,
  leader_id uuid,
  previous_leader_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  actor_is_teacher boolean;
  current_leader_id uuid;
  denial_code text;
begin
  actor_profile := private.require_active_verified_actor();

  -- The group row lock serializes transfers; the leader check runs after it,
  -- so a stale concurrent transfer by the former leader is refused.
  select *
  into group_row
  from public.groups as candidate_group
  where candidate_group.id = target_group_id
  for update;

  if group_row.id is null or group_row.deleted_at is not null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  actor_is_teacher := private.require_group_manager(actor_profile.id, group_row.class_id, group_row.id);
  class_row := private.require_active_class(group_row.class_id);
  current_leader_id := private.group_active_leader_id(group_row.id);

  if current_leader_id = target_new_leader_id then
    return query
    select 'transferred'::text, null::text, group_row.id, class_row.id, current_leader_id, current_leader_id;
    return;
  end if;

  denial_code := case
    when group_row.status in ('locked', 'archived') then 'GROUP_LOCKED'
    when current_leader_id is null then 'INVALID_STATUS_TRANSITION'
    when not exists (
      select 1
      from public.group_members as member
      where member.group_id = group_row.id
        and member.user_id = target_new_leader_id
        and member.role = 'member'
        and member.status = 'active'
    ) then 'INVALID_STATUS_TRANSITION'
    else null
  end;

  if denial_code is not null then
    return query
    select 'denied'::text, denial_code, group_row.id, class_row.id, current_leader_id, current_leader_id;
    return;
  end if;

  -- Demote before promoting: the partial unique index allows at most one
  -- active leader, and the deferred trigger rejects zero at commit.
  update public.group_members as member
  set role = 'member'
  where member.group_id = group_row.id
    and member.user_id = current_leader_id
    and member.status = 'active';

  update public.group_members as member
  set role = 'leader'
  where member.group_id = group_row.id
    and member.user_id = target_new_leader_id
    and member.status = 'active';

  insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, payload)
  values
    (
      class_row.id, group_row.id, current_leader_id, 'leadership_transferred', actor_profile.id,
      jsonb_build_object('to_user_id', target_new_leader_id, 'source', case when actor_is_teacher then 'teacher' else 'leader' end)
    ),
    (
      class_row.id, group_row.id, target_new_leader_id, 'became_leader', actor_profile.id,
      jsonb_build_object('from_user_id', current_leader_id, 'source', case when actor_is_teacher then 'teacher' else 'leader' end)
    );

  insert into public.notifications (
    recipient_id, type, title, message, entity_type, entity_id, payload,
    class_id, group_id, actor_id
  )
  values (
    target_new_leader_id,
    'leadership_assigned',
    'คุณเป็นหัวหน้ากลุ่มแล้ว',
    'คุณได้รับมอบหมายเป็นหัวหน้ากลุ่ม ' || group_row.name,
    'group',
    group_row.id,
    jsonb_build_object('classId', class_row.id, 'groupId', group_row.id, 'groupName', group_row.name),
    class_row.id,
    group_row.id,
    actor_profile.id
  );

  insert into public.notifications (
    recipient_id, type, title, message, entity_type, entity_id, payload,
    class_id, group_id, actor_id
  )
  select
    member.user_id,
    'leadership_transferred',
    'หัวหน้ากลุ่มเปลี่ยนแล้ว',
    'หัวหน้ากลุ่ม ' || group_row.name || ' มีการเปลี่ยนแปลง',
    'group',
    group_row.id,
    jsonb_build_object('classId', class_row.id, 'groupId', group_row.id, 'groupName', group_row.name),
    class_row.id,
    group_row.id,
    actor_profile.id
  from public.group_members as member
  where member.group_id = group_row.id
    and member.status = 'active'
    and member.user_id <> target_new_leader_id;

  perform private.insert_audit_log(
    actor_profile.id,
    'group_leader_changed',
    'group',
    group_row.id,
    class_row.school_id,
    class_row.id,
    'succeeded',
    jsonb_build_object('previous_leader_id', current_leader_id, 'leader_id', target_new_leader_id)
  );

  perform private.insert_group_research_event(
    'group_leader_changed',
    actor_profile.id,
    class_row.school_id,
    class_row.id,
    group_row.id,
    jsonb_build_object('reason_category', case when actor_is_teacher then 'teacher_change' else 'leader_transfer' end)
  );

  return query
  select 'transferred'::text, null::text, group_row.id, class_row.id, target_new_leader_id, current_leader_id;
end;
$$;

-- Leader member removal -------------------------------------------------------

create function public.remove_group_member(
  target_group_id uuid,
  target_student_id uuid
)
returns table(
  outcome text,
  error_code text,
  group_id uuid,
  class_id uuid,
  member_count integer,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  actor_is_teacher boolean;
  member_row public.group_members%rowtype;
  current_member_count integer;
  resulting_status text;
  denial_code text;
begin
  actor_profile := private.require_active_verified_actor();

  select *
  into group_row
  from public.groups as candidate_group
  where candidate_group.id = target_group_id
  for update;

  if group_row.id is null or group_row.deleted_at is not null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  actor_is_teacher := private.require_group_manager(actor_profile.id, group_row.class_id, group_row.id);
  class_row := private.require_active_class(group_row.class_id);

  select *
  into member_row
  from public.group_members as member
  where member.group_id = group_row.id
    and member.user_id = target_student_id
  for update;

  if member_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  current_member_count := private.group_active_member_count(group_row.id);

  if member_row.status <> 'active' then
    return query
    select 'removed'::text, null::text, group_row.id, class_row.id, current_member_count, group_row.status;
    return;
  end if;

  denial_code := case
    when member_row.role = 'leader' then 'LEADER_SUCCESSOR_REQUIRED'
    when group_row.status in ('locked', 'archived') then 'GROUP_LOCKED'
    when not actor_is_teacher and class_row.group_formation_status <> 'open' then 'GROUP_FORMATION_CLOSED'
    else null
  end;

  if denial_code is not null then
    return query
    select 'denied'::text, denial_code, group_row.id, class_row.id, current_member_count, group_row.status;
    return;
  end if;

  update public.group_members as member
  set status = 'removed',
      left_at = now()
  where member.id = member_row.id;

  insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, payload)
  values (
    class_row.id, group_row.id, target_student_id, 'removed', actor_profile.id,
    jsonb_build_object('source', case when actor_is_teacher then 'teacher' else 'leader' end)
  );

  current_member_count := current_member_count - 1;
  resulting_status := group_row.status;

  if group_row.status = 'ready' and current_member_count < class_row.min_group_size then
    update public.groups as candidate_group
    set status = 'forming'
    where candidate_group.id = group_row.id;
    resulting_status := 'forming';
  end if;

  perform private.insert_audit_log(
    actor_profile.id,
    'group_member_removed',
    'group',
    group_row.id,
    class_row.school_id,
    class_row.id,
    'succeeded',
    jsonb_build_object('student_id', target_student_id, 'member_count', current_member_count)
  );

  return query
  select 'removed'::text, null::text, group_row.id, class_row.id, current_member_count, resulting_status;
end;
$$;

revoke execute on function public.mark_group_ready(uuid) from public, anon, authenticated;
revoke execute on function public.transfer_group_leadership(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.remove_group_member(uuid, uuid) from public, anon, authenticated;

grant execute on function public.mark_group_ready(uuid) to authenticated;
grant execute on function public.transfer_group_leadership(uuid, uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

comment on function public.mark_group_ready(uuid) is
  'P4-04 leader readiness: a forming group at or above minimum size becomes ready and class teachers are asked to approve.';
comment on function public.transfer_group_leadership(uuid, uuid) is
  'P4-04 atomic leadership transfer by the current leader or a class teacher. Locks the group, rechecks leadership after the lock, demotes then promotes, and never commits zero or two leaders.';
comment on function public.remove_group_member(uuid, uuid) is
  'P4-04 leader or teacher removal of a non-leader member before lock; a ready group below minimum returns to forming.';

commit;
