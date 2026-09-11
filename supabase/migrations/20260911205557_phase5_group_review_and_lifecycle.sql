begin;

-- Shared notification helper for teacher lifecycle changes ---------------------

create function private.notify_active_group_members(
  target_group_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_row public.groups%rowtype;
  affected integer;
begin
  select * into group_row from public.groups as candidate_group where candidate_group.id = target_group_id;

  insert into public.notifications (
    recipient_id, type, title, message, entity_type, entity_id, payload, class_id, group_id, actor_id
  )
  select
    member.user_id,
    notification_type,
    notification_title,
    notification_message,
    'group',
    group_row.id,
    jsonb_build_object('classId', group_row.class_id, 'groupId', group_row.id, 'groupName', group_row.name),
    group_row.class_id,
    group_row.id,
    actor_user_id
  from public.group_members as member
  where member.group_id = group_row.id
    and member.status = 'active';

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function private.cancel_group_pending_invitations(
  target_group_id uuid,
  actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_row public.groups%rowtype;
  affected integer;
begin
  select * into group_row from public.groups as candidate_group where candidate_group.id = target_group_id;

  with cancelled as (
    update public.group_invitations as invitation
    set status = 'cancelled',
        responded_at = now(),
        cancelled_by = actor_user_id
    where invitation.group_id = target_group_id
      and invitation.status = 'pending'
    returning invitation.id, invitation.invitee_id
  )
  insert into public.notifications (
    recipient_id, type, title, message, entity_type, entity_id, payload,
    class_id, group_id, group_invitation_id, actor_id
  )
  select
    cancelled.invitee_id,
    'group_invitation_cancelled',
    'คำเชิญถูกยกเลิก',
    'คำเชิญเข้ากลุ่ม ' || group_row.name || ' ถูกยกเลิก',
    'group_invitation',
    cancelled.id,
    jsonb_build_object(
      'classId', group_row.class_id,
      'groupId', group_row.id,
      'invitationId', cancelled.id,
      'groupName', group_row.name
    ),
    group_row.class_id,
    group_row.id,
    cancelled.id,
    actor_user_id
  from cancelled;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Load a group for a class-teacher operation and lock it.
create function private.require_teacher_group(target_group_id uuid)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_row public.groups%rowtype;
begin
  select * into group_row from public.groups as candidate_group where candidate_group.id = target_group_id;

  if group_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform private.require_class_teacher(group_row.class_id, false);

  select * into group_row from public.groups as candidate_group where candidate_group.id = target_group_id for update;
  return group_row;
end;
$$;

-- Approve, lock, unlock (MGT-006) ----------------------------------------------

create function public.approve_group(target_group_id uuid)
returns table(outcome text, error_code text, group_id uuid, class_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  denial_code text;
begin
  actor_profile := private.require_active_verified_actor();
  group_row := private.require_teacher_group(target_group_id);
  select * into class_row from public.classes as class where class.id = group_row.class_id;

  if group_row.status = 'approved' then
    return query select 'approved'::text, null::text, group_row.id, group_row.class_id, group_row.status;
    return;
  end if;

  denial_code := case
    when group_row.deleted_at is not null or group_row.status = 'archived' then 'DESTINATION_GROUP_INVALID'
    when group_row.status = 'locked' then 'GROUP_LOCKED'
    when private.group_active_member_count(group_row.id) < class_row.min_group_size then 'INVALID_STATUS_TRANSITION'
    else null
  end;

  if denial_code is not null then
    return query select 'denied'::text, denial_code, group_row.id, group_row.class_id, group_row.status;
    return;
  end if;

  update public.groups as candidate_group
  set status = 'approved',
      approved_by = actor_profile.id,
      approved_at = now()
  where candidate_group.id = group_row.id;

  perform private.notify_active_group_members(
    group_row.id, 'group_approved', 'ครูอนุมัติกลุ่มแล้ว',
    'ครูอนุมัติกลุ่ม ' || group_row.name || ' แล้ว', actor_profile.id
  );

  perform private.insert_audit_log(
    actor_profile.id, 'group_approved', 'group', group_row.id, class_row.school_id, class_row.id,
    'succeeded', jsonb_build_object('member_count', private.group_active_member_count(group_row.id))
  );

  return query select 'approved'::text, null::text, group_row.id, group_row.class_id, 'approved'::text;
end;
$$;

create function public.lock_group(target_group_id uuid)
returns table(outcome text, error_code text, group_id uuid, class_id uuid, status text, cancelled_invitations integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  cancelled_count integer;
  member_count integer;
begin
  actor_profile := private.require_active_verified_actor();
  group_row := private.require_teacher_group(target_group_id);
  select * into class_row from public.classes as class where class.id = group_row.class_id;

  if group_row.status = 'locked' then
    return query select 'locked'::text, null::text, group_row.id, group_row.class_id, group_row.status, 0;
    return;
  end if;

  if group_row.deleted_at is not null or group_row.status = 'archived' then
    return query select 'denied'::text, 'DESTINATION_GROUP_INVALID'::text, group_row.id, group_row.class_id, group_row.status, 0;
    return;
  end if;

  update public.groups as candidate_group
  set status = 'locked',
      locked_at = now()
  where candidate_group.id = group_row.id;

  cancelled_count := private.cancel_group_pending_invitations(group_row.id, actor_profile.id);
  member_count := private.group_active_member_count(group_row.id);

  perform private.notify_active_group_members(
    group_row.id, 'group_locked', 'กลุ่มถูกล็อกแล้ว',
    'กลุ่ม ' || group_row.name || ' ถูกล็อกแล้ว', actor_profile.id
  );

  perform private.insert_audit_log(
    actor_profile.id, 'group_locked', 'group', group_row.id, class_row.school_id, class_row.id,
    'succeeded', jsonb_build_object('member_count', member_count, 'cancelled_invitations', cancelled_count)
  );

  perform private.insert_group_research_event(
    'group_locked', actor_profile.id, class_row.school_id, class_row.id, group_row.id,
    jsonb_build_object('member_count', member_count)
  );

  return query select 'locked'::text, null::text, group_row.id, group_row.class_id, 'locked'::text, cancelled_count;
end;
$$;

create function public.unlock_group(target_group_id uuid)
returns table(outcome text, error_code text, group_id uuid, class_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  next_status text;
begin
  actor_profile := private.require_active_verified_actor();
  group_row := private.require_teacher_group(target_group_id);
  select * into class_row from public.classes as class where class.id = group_row.class_id;

  if group_row.deleted_at is not null or group_row.status = 'archived' then
    return query select 'denied'::text, 'DESTINATION_GROUP_INVALID'::text, group_row.id, group_row.class_id, group_row.status;
    return;
  end if;

  if group_row.status <> 'locked' then
    return query select 'unlocked'::text, null::text, group_row.id, group_row.class_id, group_row.status;
    return;
  end if;

  if private.group_in_active_session(group_row.id) then
    return query select 'denied'::text, 'GROUP_IN_ACTIVE_SESSION'::text, group_row.id, group_row.class_id, group_row.status;
    return;
  end if;

  next_status := case when group_row.approved_at is not null then 'approved' else 'forming' end;

  update public.groups as candidate_group
  set status = next_status
  where candidate_group.id = group_row.id;

  perform private.notify_active_group_members(
    group_row.id, 'group_unlocked', 'ครูปลดล็อกกลุ่มแล้ว',
    'ครูปลดล็อกกลุ่ม ' || group_row.name || ' แล้ว', actor_profile.id
  );

  perform private.insert_audit_log(
    actor_profile.id, 'group_unlocked', 'group', group_row.id, class_row.school_id, class_row.id,
    'succeeded', jsonb_build_object('status', next_status)
  );

  return query select 'unlocked'::text, null::text, group_row.id, group_row.class_id, next_status;
end;
$$;

-- Creation claims (MGT-006, UI_CONTRACTS §6) -----------------------------------

create function public.list_class_creation_claims(target_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims_json jsonb;
begin
  perform private.require_active_verified_actor();
  perform private.require_class_teacher(target_class_id, false);

  select coalesce(jsonb_agg(entry.payload order by entry.display_name, entry.claim_id), '[]'::jsonb)
  into claims_json
  from (
    select
      claim.id as claim_id,
      student_profile.display_name,
      jsonb_build_object(
        'claimId', claim.id,
        'student', jsonb_build_object('id', student_profile.id, 'displayName', student_profile.display_name),
        'groupId', claimed_group.id,
        'groupName', claimed_group.name,
        'groupState', case
          when claimed_group.id is null then null
          when claimed_group.deleted_at is not null then 'deleted'
          when claimed_group.status = 'archived' then 'archived'
          else 'current'
        end,
        'studentInGroup', student_membership.id is not null,
        'canReset', reset_reason.code is null,
        'cannotResetReason', reset_reason.code,
        'claimedAt', claim.created_at
      ) as payload
    from public.student_group_creation_claims as claim
    join public.profiles as student_profile on student_profile.id = claim.student_id
    left join public.groups as claimed_group on claimed_group.id = claim.group_id
    left join public.group_members as student_membership
      on student_membership.group_id = claim.group_id
     and student_membership.user_id = claim.student_id
     and student_membership.status = 'active'
    cross join lateral (
      select case
        when claimed_group.id is not null
          and claimed_group.deleted_at is null
          and claimed_group.status <> 'archived'
          and student_membership.id is not null then 'INVALID_STATUS_TRANSITION'
        when claimed_group.id is not null and private.group_in_active_session(claimed_group.id)
          then 'GROUP_IN_ACTIVE_SESSION'
        else null
      end as code
    ) as reset_reason
    where claim.class_id = target_class_id
      and claim.status = 'claimed'
  ) as entry;

  return jsonb_build_object('classId', target_class_id, 'claims', claims_json, 'refreshedAt', now());
end;
$$;

create function public.reset_group_creation_claim(
  target_class_id uuid,
  target_student_id uuid,
  reset_reason_text text
)
returns table(outcome text, error_code text, claim_id uuid, audit_log_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  claim_row public.student_group_creation_claims%rowtype;
  claimed_group public.groups%rowtype;
  trimmed_reason text := btrim(coalesce(reset_reason_text, ''));
  denial_code text;
  audit_id uuid;
begin
  actor_profile := private.require_active_verified_actor();
  class_row := private.require_class_teacher(target_class_id, false);

  if char_length(trimmed_reason) not between 1 and 1000 then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  select *
  into claim_row
  from public.student_group_creation_claims as claim
  where claim.class_id = class_row.id
    and claim.student_id = target_student_id
    and claim.status = 'claimed'
  for update;

  if claim_row.id is null then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, null::uuid, null::uuid;
    return;
  end if;

  select * into claimed_group from public.groups as candidate_group where candidate_group.id = claim_row.group_id;

  denial_code := case
    when claimed_group.id is not null
      and claimed_group.deleted_at is null
      and claimed_group.status <> 'archived'
      and exists (
        select 1 from public.group_members as member
        where member.group_id = claimed_group.id
          and member.user_id = target_student_id
          and member.status = 'active'
      ) then 'INVALID_STATUS_TRANSITION'
    when claimed_group.id is not null and private.group_in_active_session(claimed_group.id)
      then 'GROUP_IN_ACTIVE_SESSION'
    else null
  end;

  if denial_code is not null then
    return query select 'denied'::text, denial_code, claim_row.id, null::uuid;
    return;
  end if;

  update public.student_group_creation_claims as claim
  set status = 'reset_by_teacher',
      reset_by = actor_profile.id,
      reset_at = now(),
      reset_reason = trimmed_reason
  where claim.id = claim_row.id;

  insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, payload)
  values (
    class_row.id, claim_row.group_id, target_student_id, 'claim_reset', actor_profile.id,
    jsonb_build_object('claim_id', claim_row.id)
  );

  perform private.insert_audit_log(
    actor_profile.id, 'group_creation_claim_reset', 'student_group_creation_claim', claim_row.id,
    class_row.school_id, class_row.id, 'succeeded',
    jsonb_build_object('student_id', target_student_id, 'group_id', claim_row.group_id)
  );

  select audit.id
  into audit_id
  from public.audit_logs as audit
  where audit.resource_id = claim_row.id
    and audit.action = 'group_creation_claim_reset'
  order by audit.created_at desc, audit.id desc
  limit 1;

  return query select 'reset'::text, null::text, claim_row.id, audit_id;
end;
$$;

-- Delete unused or archive historical groups (MGT-007, MGT-008) ---------------

create function public.delete_or_archive_group(target_group_id uuid)
returns table(
  outcome text,
  error_code text,
  group_id uuid,
  class_id uuid,
  released_members integer,
  remaining_group_slots integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  archive boolean;
  member_ids uuid[];
  cancelled_count integer;
  member_id uuid;
begin
  actor_profile := private.require_active_verified_actor();
  group_row := private.require_teacher_group(target_group_id);
  select * into class_row from public.classes as class where class.id = group_row.class_id;

  if group_row.deleted_at is not null or group_row.status = 'archived' then
    return query
    select
      case when group_row.deleted_at is not null then 'deleted' else 'archived' end,
      null::text, group_row.id, group_row.class_id, 0,
      greatest(class_row.maximum_groups - private.count_current_class_groups(class_row.id), 0);
    return;
  end if;

  if private.group_in_active_session(group_row.id) then
    return query
    select 'denied'::text, 'GROUP_IN_ACTIVE_SESSION'::text, group_row.id, group_row.class_id, 0,
      greatest(class_row.maximum_groups - private.count_current_class_groups(class_row.id), 0);
    return;
  end if;

  archive := private.group_has_session_history(group_row.id);

  select coalesce(array_agg(member.user_id), '{}')
  into member_ids
  from public.group_members as member
  where member.group_id = group_row.id
    and member.status = 'active';

  -- Notify before memberships end so the helper reaches current members.
  perform private.notify_active_group_members(
    group_row.id,
    case when archive then 'group_archived' else 'group_deleted' end,
    case when archive then 'กลุ่มถูกเก็บถาวร' else 'กลุ่มถูกลบ' end,
    'กลุ่ม ' || group_row.name || case when archive then ' ถูกเก็บถาวร' else ' ถูกลบ' end,
    actor_profile.id
  );

  cancelled_count := private.cancel_group_pending_invitations(group_row.id, actor_profile.id);

  if archive then
    update public.groups as candidate_group
    set status = 'archived',
        archived_at = now()
    where candidate_group.id = group_row.id;
  else
    update public.groups as candidate_group
    set deleted_at = now()
    where candidate_group.id = group_row.id;
  end if;

  update public.group_members as member
  set status = 'removed',
      left_at = now()
  where member.group_id = group_row.id
    and member.status = 'active';

  foreach member_id in array member_ids loop
    insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, payload)
    values (
      class_row.id, group_row.id, member_id, 'removed', actor_profile.id,
      jsonb_build_object('source', case when archive then 'teacher_archive' else 'teacher_delete' end)
    );
  end loop;

  perform private.insert_audit_log(
    actor_profile.id,
    case when archive then 'group_archived' else 'group_deleted' end,
    'group', group_row.id, class_row.school_id, class_row.id, 'succeeded',
    jsonb_build_object('member_count', cardinality(member_ids), 'cancelled_invitations', cancelled_count)
  );

  if archive then
    perform private.insert_group_research_event(
      'group_archived', actor_profile.id, class_row.school_id, class_row.id, group_row.id,
      jsonb_build_object('session_count', 0)
    );
  else
    perform private.insert_group_research_event(
      'group_deleted', actor_profile.id, class_row.school_id, class_row.id, group_row.id,
      jsonb_build_object('member_count', cardinality(member_ids), 'had_pending_invites', cancelled_count > 0)
    );
  end if;

  return query
  select
    case when archive then 'archived' else 'deleted' end,
    null::text, group_row.id, group_row.class_id, cardinality(member_ids),
    greatest(class_row.maximum_groups - private.count_current_class_groups(class_row.id), 0);
end;
$$;

revoke execute on function private.notify_active_group_members(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function private.cancel_group_pending_invitations(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.require_teacher_group(uuid) from public, anon, authenticated;
revoke execute on function public.approve_group(uuid) from public, anon, authenticated;
revoke execute on function public.lock_group(uuid) from public, anon, authenticated;
revoke execute on function public.unlock_group(uuid) from public, anon, authenticated;
revoke execute on function public.list_class_creation_claims(uuid) from public, anon, authenticated;
revoke execute on function public.reset_group_creation_claim(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.delete_or_archive_group(uuid) from public, anon, authenticated;

grant execute on function public.approve_group(uuid) to authenticated;
grant execute on function public.lock_group(uuid) to authenticated;
grant execute on function public.unlock_group(uuid) to authenticated;
grant execute on function public.list_class_creation_claims(uuid) to authenticated;
grant execute on function public.reset_group_creation_claim(uuid, uuid, text) to authenticated;
grant execute on function public.delete_or_archive_group(uuid) to authenticated;

comment on function public.approve_group(uuid) is
  'P5-03 teacher approval of a forming or ready group at or above minimum size; members are notified.';
comment on function public.lock_group(uuid) is
  'P5-03 teacher lock: blocks membership changes, cancels pending invitations with invitee notifications, and notifies members.';
comment on function public.unlock_group(uuid) is
  'P5-03 teacher unlock back to approved (if previously approved) or forming; blocked during an active session.';
comment on function public.list_class_creation_claims(uuid) is
  'P5-03 teacher read model of unreset student creation claims with the prior group state and reset eligibility.';
comment on function public.reset_group_creation_claim(uuid, uuid, text) is
  'P5-03 audited teacher reset of a student creation claim, allowed only after the prior group is deleted, archived, or no longer includes the student.';
comment on function public.delete_or_archive_group(uuid) is
  'P5-04 teacher delete of an unused group (soft delete, members unassigned, invitations cancelled, slot restored) or archive when the group has session history; creation claims are never released.';

commit;
