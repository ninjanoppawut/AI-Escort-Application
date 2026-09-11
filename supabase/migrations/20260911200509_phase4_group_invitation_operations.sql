begin;

-- Shared helpers ------------------------------------------------------------

create function private.group_active_member_count(target_group_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.group_members as member
  where member.group_id = target_group_id
    and member.status = 'active';
$$;

create function private.group_pending_invitation_count(target_group_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.group_invitations as invitation
  where invitation.group_id = target_group_id
    and invitation.status = 'pending'
    and invitation.expires_at > now();
$$;

create function private.group_active_leader_id(target_group_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.user_id
  from public.group_members as member
  where member.group_id = target_group_id
    and member.role = 'leader'
    and member.status = 'active'
  limit 1;
$$;

create function private.expire_stale_group_invitations(
  target_group_id uuid,
  target_invitee_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.group_invitations as invitation
  set status = 'expired'
  where invitation.status = 'pending'
    and invitation.expires_at <= now()
    and (target_group_id is null or invitation.group_id = target_group_id)
    and (target_invitee_id is null or invitation.invitee_id = target_invitee_id);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function private.require_active_verified_actor()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into actor_profile
  from public.profiles as profile
  where profile.id = (select auth.uid());

  if actor_profile.id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if actor_profile.status <> 'active' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DISABLED';
  end if;

  if actor_profile.email_verified_at is null then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_CONFIRMED';
  end if;

  return actor_profile;
end;
$$;

-- Leader or class teacher authority over a group, raising stable codes.
create function private.require_group_manager(
  actor_user_id uuid,
  target_class_id uuid,
  target_group_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_is_teacher boolean;
begin
  actor_is_teacher := (select private.is_active_class_teacher(actor_user_id, target_class_id));
  if actor_is_teacher then
    return true;
  end if;

  if exists (
    select 1
    from public.group_members as member
    where member.group_id = target_group_id
      and member.user_id = actor_user_id
      and member.role = 'leader'
      and member.status = 'active'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.class_members as membership
    where membership.class_id = target_class_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'NOT_GROUP_LEADER';
  end if;

  raise exception using errcode = '42501', message = 'FORBIDDEN';
end;
$$;

create function private.require_active_class(target_class_id uuid)
returns public.classes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  class_row public.classes%rowtype;
  school_status text;
begin
  select *
  into class_row
  from public.classes as class
  where class.id = target_class_id;

  if class_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select school.status
  into school_status
  from public.schools as school
  where school.id = class_row.school_id;

  if class_row.status <> 'active' or school_status is distinct from 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  return class_row;
end;
$$;

-- Send ------------------------------------------------------------------------

create function public.send_group_invitation(
  target_group_id uuid,
  target_invitee_id uuid
)
returns table(
  outcome text,
  error_code text,
  invitation_id uuid,
  group_id uuid,
  class_id uuid,
  invitee_id uuid,
  expires_at timestamptz,
  available_seats integer
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
  existing_invitation public.group_invitations%rowtype;
  member_count integer;
  pending_count integer;
  denial_code text;
  inserted_invitation public.group_invitations%rowtype;
  leader_name text;
begin
  actor_profile := private.require_active_verified_actor();

  -- Lock order: group row, then invitation rows.
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

  if group_row.status = 'archived' then
    raise exception using errcode = '42501', message = 'DESTINATION_GROUP_INVALID';
  end if;

  if target_invitee_id = actor_profile.id
    or not (select private.is_active_class_student(target_invitee_id, class_row.id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform private.expire_stale_group_invitations(group_row.id, target_invitee_id);
  member_count := private.group_active_member_count(group_row.id);
  pending_count := private.group_pending_invitation_count(group_row.id);

  select *
  into existing_invitation
  from public.group_invitations as invitation
  where invitation.group_id = group_row.id
    and invitation.invitee_id = target_invitee_id
    and invitation.status = 'pending';

  if existing_invitation.id is not null then
    return query
    select
      'already_pending'::text,
      null::text,
      existing_invitation.id,
      group_row.id,
      class_row.id,
      target_invitee_id,
      existing_invitation.expires_at,
      greatest(class_row.max_group_size - member_count - pending_count, 0);
    return;
  end if;

  denial_code := case
    when group_row.status = 'locked' then 'GROUP_LOCKED'
    when not actor_is_teacher and class_row.group_formation_status <> 'open'
      then 'GROUP_FORMATION_CLOSED'
    when exists (
      select 1
      from public.group_members as member
      where member.class_id = class_row.id
        and member.user_id = target_invitee_id
        and member.status = 'active'
    ) then 'STUDENT_ALREADY_IN_GROUP'
    when member_count + pending_count >= class_row.max_group_size then 'GROUP_FULL'
    else null
  end;

  if denial_code is not null then
    return query
    select
      'denied'::text,
      denial_code,
      null::uuid,
      group_row.id,
      class_row.id,
      target_invitee_id,
      null::timestamptz,
      greatest(class_row.max_group_size - member_count - pending_count, 0);
    return;
  end if;

  insert into public.group_invitations (class_id, group_id, invitee_id, invited_by)
  values (class_row.id, group_row.id, target_invitee_id, actor_profile.id)
  returning * into inserted_invitation;

  select profile.display_name
  into leader_name
  from public.profiles as profile
  where profile.id = private.group_active_leader_id(group_row.id);

  insert into public.notifications (
    recipient_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    payload,
    class_id,
    group_id,
    group_invitation_id,
    actor_id
  )
  values (
    target_invitee_id,
    'group_invitation_received',
    'คำเชิญเข้ากลุ่ม',
    coalesce(leader_name, actor_profile.display_name) || ' เชิญคุณเข้ากลุ่ม ' || group_row.name,
    'group_invitation',
    inserted_invitation.id,
    jsonb_build_object(
      'classId', class_row.id,
      'groupId', group_row.id,
      'invitationId', inserted_invitation.id,
      'groupName', group_row.name,
      'leaderDisplayName', coalesce(leader_name, actor_profile.display_name),
      'memberCount', member_count,
      'maximumSize', class_row.max_group_size
    ),
    class_row.id,
    group_row.id,
    inserted_invitation.id,
    actor_profile.id
  );

  perform private.insert_audit_log(
    actor_profile.id,
    'group_invitation_sent',
    'group_invitation',
    inserted_invitation.id,
    class_row.school_id,
    class_row.id,
    'succeeded',
    jsonb_build_object('group_id', group_row.id, 'group_member_count', member_count)
  );

  perform private.insert_group_research_event(
    'group_invitation_sent',
    actor_profile.id,
    class_row.school_id,
    class_row.id,
    group_row.id,
    jsonb_build_object('group_member_count', member_count)
  );

  return query
  select
    'sent'::text,
    null::text,
    inserted_invitation.id,
    group_row.id,
    class_row.id,
    target_invitee_id,
    inserted_invitation.expires_at,
    greatest(class_row.max_group_size - member_count - pending_count - 1, 0);
end;
$$;

-- Cancel ----------------------------------------------------------------------

create function public.cancel_group_invitation(target_invitation_id uuid)
returns table(
  outcome text,
  error_code text,
  invitation_id uuid,
  group_id uuid,
  class_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  invitation_row public.group_invitations%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  actor_is_teacher boolean;
begin
  actor_profile := private.require_active_verified_actor();

  select *
  into invitation_row
  from public.group_invitations as invitation
  where invitation.id = target_invitation_id
  for update;

  if invitation_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select *
  into group_row
  from public.groups as candidate_group
  where candidate_group.id = invitation_row.group_id;

  actor_is_teacher := private.require_group_manager(actor_profile.id, invitation_row.class_id, invitation_row.group_id);
  class_row := private.require_active_class(invitation_row.class_id);

  if invitation_row.status = 'cancelled' then
    return query
    select 'cancelled'::text, null::text, invitation_row.id, invitation_row.group_id, invitation_row.class_id, invitation_row.status;
    return;
  end if;

  if invitation_row.status <> 'pending' then
    return query
    select 'denied'::text, 'INVITATION_NOT_PENDING'::text, invitation_row.id, invitation_row.group_id, invitation_row.class_id, invitation_row.status;
    return;
  end if;

  if invitation_row.expires_at <= now() then
    update public.group_invitations as invitation
    set status = 'expired'
    where invitation.id = invitation_row.id;

    return query
    select 'denied'::text, 'INVITATION_EXPIRED'::text, invitation_row.id, invitation_row.group_id, invitation_row.class_id, 'expired'::text;
    return;
  end if;

  if not actor_is_teacher and group_row.status not in ('forming', 'ready', 'approved') then
    return query
    select 'denied'::text, 'GROUP_LOCKED'::text, invitation_row.id, invitation_row.group_id, invitation_row.class_id, invitation_row.status;
    return;
  end if;

  update public.group_invitations as invitation
  set status = 'cancelled',
      responded_at = now(),
      cancelled_by = actor_profile.id
  where invitation.id = invitation_row.id;

  insert into public.notifications (
    recipient_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    payload,
    class_id,
    group_id,
    group_invitation_id,
    actor_id
  )
  values (
    invitation_row.invitee_id,
    'group_invitation_cancelled',
    'คำเชิญถูกยกเลิก',
    'คำเชิญเข้ากลุ่ม ' || group_row.name || ' ถูกยกเลิก',
    'group_invitation',
    invitation_row.id,
    jsonb_build_object(
      'classId', class_row.id,
      'groupId', group_row.id,
      'invitationId', invitation_row.id,
      'groupName', group_row.name
    ),
    class_row.id,
    group_row.id,
    invitation_row.id,
    actor_profile.id
  );

  perform private.insert_audit_log(
    actor_profile.id,
    'group_invitation_cancelled',
    'group_invitation',
    invitation_row.id,
    class_row.school_id,
    class_row.id,
    'succeeded',
    jsonb_build_object('group_id', group_row.id)
  );

  return query
  select 'cancelled'::text, null::text, invitation_row.id, invitation_row.group_id, invitation_row.class_id, 'cancelled'::text;
end;
$$;

-- Accept ----------------------------------------------------------------------

create function public.accept_group_invitation(target_invitation_id uuid)
returns table(
  outcome text,
  error_code text,
  invitation_id uuid,
  group_id uuid,
  class_id uuid,
  membership_id uuid,
  member_count integer,
  maximum_size integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  invitation_snapshot public.group_invitations%rowtype;
  invitation_row public.group_invitations%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  current_member_count integer;
  denial_code text;
  new_membership_id uuid;
  inviter_still_valid boolean;
  leader_id uuid;
begin
  actor_profile := private.require_active_verified_actor();

  select *
  into invitation_snapshot
  from public.group_invitations as invitation
  where invitation.id = target_invitation_id;

  if invitation_snapshot.id is null or invitation_snapshot.invitee_id <> actor_profile.id then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  -- Lock order: invitee class membership (serializes one student's accepts),
  -- then the destination group (serializes capacity), then the invitation.
  perform 1
  from public.class_members as membership
  where membership.class_id = invitation_snapshot.class_id
    and membership.user_id = actor_profile.id
  for update;

  select *
  into group_row
  from public.groups as candidate_group
  where candidate_group.id = invitation_snapshot.group_id
  for update;

  select *
  into invitation_row
  from public.group_invitations as invitation
  where invitation.id = target_invitation_id
  for update;

  class_row := private.require_active_class(invitation_row.class_id);

  if not (select private.is_active_class_student(actor_profile.id, class_row.id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  current_member_count := private.group_active_member_count(group_row.id);

  if invitation_row.status = 'accepted' then
    return query
    select
      'accepted'::text,
      null::text,
      invitation_row.id,
      group_row.id,
      class_row.id,
      (
        select member.id
        from public.group_members as member
        where member.group_id = group_row.id
          and member.user_id = actor_profile.id
          and member.status = 'active'
      ),
      current_member_count,
      class_row.max_group_size;
    return;
  end if;

  if invitation_row.status <> 'pending' then
    denial_code := 'INVITATION_NOT_PENDING';
  elsif invitation_row.expires_at <= now() then
    update public.group_invitations as invitation
    set status = 'expired'
    where invitation.id = invitation_row.id;
    denial_code := 'INVITATION_EXPIRED';
  elsif group_row.deleted_at is not null or group_row.status = 'archived' then
    denial_code := 'DESTINATION_GROUP_INVALID';
  elsif group_row.status = 'locked' then
    denial_code := 'GROUP_LOCKED';
  elsif class_row.group_formation_status <> 'open' then
    denial_code := 'GROUP_FORMATION_CLOSED';
  elsif exists (
    select 1
    from public.group_members as member
    where member.class_id = class_row.id
      and member.user_id = actor_profile.id
      and member.status = 'active'
  ) then
    denial_code := 'STUDENT_ALREADY_IN_GROUP';
  elsif current_member_count >= class_row.max_group_size then
    denial_code := 'GROUP_FULL';
  end if;

  if denial_code is not null then
    return query
    select
      'denied'::text,
      denial_code,
      invitation_row.id,
      group_row.id,
      class_row.id,
      null::uuid,
      current_member_count,
      class_row.max_group_size;
    return;
  end if;

  inviter_still_valid :=
    (select private.is_active_group_leader(invitation_row.invited_by, group_row.id))
    or (select private.is_active_class_teacher(invitation_row.invited_by, class_row.id));

  insert into public.group_members (class_id, group_id, user_id, role, status, joined_at, left_at, invited_by)
  values (
    class_row.id,
    group_row.id,
    actor_profile.id,
    'member',
    'active',
    now(),
    null,
    case when inviter_still_valid then invitation_row.invited_by else null end
  )
  on conflict on constraint group_members_group_user_unique do update
  set role = 'member',
      status = 'active',
      left_at = null,
      joined_at = excluded.joined_at,
      invited_by = excluded.invited_by
  returning id into new_membership_id;

  update public.group_invitations as invitation
  set status = 'accepted',
      responded_at = now()
  where invitation.id = invitation_row.id;

  -- A student can hold one current group, so other pending invitations lapse.
  update public.group_invitations as invitation
  set status = 'cancelled',
      responded_at = now()
  where invitation.class_id = class_row.id
    and invitation.invitee_id = actor_profile.id
    and invitation.status = 'pending'
    and invitation.id <> invitation_row.id;

  insert into public.group_membership_history (class_id, group_id, user_id, event_type, actor_id, payload)
  values (
    class_row.id,
    group_row.id,
    actor_profile.id,
    'joined',
    actor_profile.id,
    jsonb_build_object('role', 'member', 'source', 'invitation', 'invitation_id', invitation_row.id)
  );

  current_member_count := current_member_count + 1;
  leader_id := private.group_active_leader_id(group_row.id);

  if leader_id is not null and leader_id <> actor_profile.id then
    insert into public.notifications (
      recipient_id, type, title, message, entity_type, entity_id, payload,
      class_id, group_id, group_invitation_id, actor_id
    )
    values (
      leader_id,
      'group_invitation_accepted',
      'มีสมาชิกตอบรับคำเชิญ',
      actor_profile.display_name || ' ตอบรับเข้ากลุ่ม ' || group_row.name,
      'group',
      group_row.id,
      jsonb_build_object(
        'classId', class_row.id,
        'groupId', group_row.id,
        'invitationId', invitation_row.id,
        'studentName', actor_profile.display_name,
        'groupName', group_row.name,
        'memberCount', current_member_count,
        'maximumSize', class_row.max_group_size
      ),
      class_row.id,
      group_row.id,
      invitation_row.id,
      actor_profile.id
    );
  end if;

  if current_member_count = class_row.min_group_size then
    insert into public.notifications (
      recipient_id, type, title, message, entity_type, entity_id, payload,
      class_id, group_id, actor_id
    )
    select
      teacher_member.user_id,
      'group_minimum_reached',
      'กลุ่มมีสมาชิกครบขั้นต่ำ',
      'กลุ่ม ' || group_row.name || ' มีสมาชิกครบขั้นต่ำแล้ว',
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
  end if;

  perform private.insert_audit_log(
    actor_profile.id,
    'group_invitation_accepted',
    'group_invitation',
    invitation_row.id,
    class_row.school_id,
    class_row.id,
    'succeeded',
    jsonb_build_object('group_id', group_row.id, 'group_member_count', current_member_count)
  );

  perform private.insert_group_research_event(
    'group_invitation_accepted',
    actor_profile.id,
    class_row.school_id,
    class_row.id,
    group_row.id,
    jsonb_build_object(
      'invite_age_s', greatest(0, floor(extract(epoch from now() - invitation_row.created_at))::integer),
      'group_member_count', current_member_count
    )
  );

  return query
  select
    'accepted'::text,
    null::text,
    invitation_row.id,
    group_row.id,
    class_row.id,
    new_membership_id,
    current_member_count,
    class_row.max_group_size;
end;
$$;

-- Decline ---------------------------------------------------------------------

create function public.decline_group_invitation(target_invitation_id uuid)
returns table(
  outcome text,
  error_code text,
  invitation_id uuid,
  group_id uuid,
  class_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  invitation_row public.group_invitations%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  leader_id uuid;
begin
  actor_profile := private.require_active_verified_actor();

  select *
  into invitation_row
  from public.group_invitations as invitation
  where invitation.id = target_invitation_id
  for update;

  if invitation_row.id is null or invitation_row.invitee_id <> actor_profile.id then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  class_row := private.require_active_class(invitation_row.class_id);

  if not (select private.is_active_class_student(actor_profile.id, class_row.id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if invitation_row.status = 'declined' then
    return query
    select 'declined'::text, null::text, invitation_row.id, invitation_row.group_id, invitation_row.class_id, invitation_row.status;
    return;
  end if;

  if invitation_row.status <> 'pending' then
    return query
    select 'denied'::text, 'INVITATION_NOT_PENDING'::text, invitation_row.id, invitation_row.group_id, invitation_row.class_id, invitation_row.status;
    return;
  end if;

  if invitation_row.expires_at <= now() then
    update public.group_invitations as invitation
    set status = 'expired'
    where invitation.id = invitation_row.id;

    return query
    select 'denied'::text, 'INVITATION_EXPIRED'::text, invitation_row.id, invitation_row.group_id, invitation_row.class_id, 'expired'::text;
    return;
  end if;

  update public.group_invitations as invitation
  set status = 'declined',
      responded_at = now()
  where invitation.id = invitation_row.id;

  select *
  into group_row
  from public.groups as candidate_group
  where candidate_group.id = invitation_row.group_id;

  leader_id := private.group_active_leader_id(group_row.id);

  if leader_id is not null then
    insert into public.notifications (
      recipient_id, type, title, message, entity_type, entity_id, payload,
      class_id, group_id, group_invitation_id, actor_id
    )
    values (
      leader_id,
      'group_invitation_declined',
      'มีการปฏิเสธคำเชิญ',
      actor_profile.display_name || ' ปฏิเสธคำเชิญเข้ากลุ่ม',
      'group',
      group_row.id,
      jsonb_build_object(
        'classId', class_row.id,
        'groupId', group_row.id,
        'invitationId', invitation_row.id,
        'studentName', actor_profile.display_name,
        'groupName', group_row.name
      ),
      class_row.id,
      group_row.id,
      invitation_row.id,
      actor_profile.id
    );
  end if;

  perform private.insert_audit_log(
    actor_profile.id,
    'group_invitation_declined',
    'group_invitation',
    invitation_row.id,
    class_row.school_id,
    class_row.id,
    'succeeded',
    jsonb_build_object('group_id', group_row.id)
  );

  perform private.insert_group_research_event(
    'group_invitation_declined',
    actor_profile.id,
    class_row.school_id,
    class_row.id,
    group_row.id,
    jsonb_build_object(
      'invite_age_s', greatest(0, floor(extract(epoch from now() - invitation_row.created_at))::integer)
    )
  );

  return query
  select 'declined'::text, null::text, invitation_row.id, invitation_row.group_id, invitation_row.class_id, 'declined'::text;
end;
$$;

-- Read models -----------------------------------------------------------------

create function public.list_group_eligible_classmates(target_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  actor_is_teacher boolean;
  member_count integer;
  pending_count integer;
  seats integer;
  cannot_invite_reason text;
  classmates_json jsonb;
begin
  actor_profile := private.require_active_verified_actor();

  select *
  into group_row
  from public.groups as candidate_group
  where candidate_group.id = target_group_id;

  if group_row.id is null or group_row.deleted_at is not null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  actor_is_teacher := private.require_group_manager(actor_profile.id, group_row.class_id, group_row.id);
  class_row := private.require_active_class(group_row.class_id);

  member_count := private.group_active_member_count(group_row.id);
  pending_count := private.group_pending_invitation_count(group_row.id);
  seats := greatest(class_row.max_group_size - member_count - pending_count, 0);

  cannot_invite_reason := case
    when group_row.status = 'archived' then 'DESTINATION_GROUP_INVALID'
    when group_row.status = 'locked' then 'GROUP_LOCKED'
    when not actor_is_teacher and class_row.group_formation_status <> 'open' then 'GROUP_FORMATION_CLOSED'
    when seats = 0 then 'GROUP_FULL'
    else null
  end;

  select coalesce(
    jsonb_agg(candidate.payload order by candidate.state_rank, candidate.display_name, candidate.user_id),
    '[]'::jsonb
  )
  into classmates_json
  from (
    select
      student_profile.id as user_id,
      student_profile.display_name,
      case
        when pending_invitation.id is not null then 2
        when other_group.id is not null then 3
        else 1
      end as state_rank,
      jsonb_build_object(
        'id', student_profile.id,
        'displayName', student_profile.display_name,
        'state', case
          when pending_invitation.id is not null then 'pending'
          when other_group.id is not null then 'in_group'
          else 'eligible'
        end,
        'groupName', other_group.name,
        'invitationId', pending_invitation.id,
        'expiresAt', pending_invitation.expires_at
      ) as payload
    from public.class_members as class_member
    join public.profiles as student_profile on student_profile.id = class_member.user_id
    left join lateral (
      select candidate_group.id, candidate_group.name
      from public.group_members as member
      join public.groups as candidate_group on candidate_group.id = member.group_id
      where member.class_id = class_row.id
        and member.user_id = class_member.user_id
        and member.status = 'active'
      limit 1
    ) as other_group on true
    left join lateral (
      select invitation.id, invitation.expires_at
      from public.group_invitations as invitation
      where invitation.group_id = group_row.id
        and invitation.invitee_id = class_member.user_id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
      limit 1
    ) as pending_invitation on true
    where class_member.class_id = class_row.id
      and class_member.role = 'student'
      and class_member.status = 'active'
      and class_member.user_id <> actor_profile.id
      and (other_group.id is null or other_group.id <> group_row.id)
  ) as candidate;

  return jsonb_build_object(
    'groupId', group_row.id,
    'classId', class_row.id,
    'groupName', group_row.name,
    'groupStatus', group_row.status,
    'maximumSize', class_row.max_group_size,
    'memberCount', member_count,
    'pendingCount', pending_count,
    'availableSeats', seats,
    'canInvite', cannot_invite_reason is null,
    'cannotInviteReason', cannot_invite_reason,
    'classmates', classmates_json,
    'refreshedAt', now()
  );
end;
$$;

create function public.get_group_detail(target_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  actor_role text;
  actor_is_member boolean;
  actor_is_leader boolean;
  member_count integer;
  pending_count integer;
  members_json jsonb;
  invitations_json jsonb := '[]'::jsonb;
begin
  actor_profile := private.require_active_verified_actor();

  select *
  into group_row
  from public.groups as candidate_group
  where candidate_group.id = target_group_id;

  if group_row.id is null or group_row.deleted_at is not null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select membership.role
  into actor_role
  from public.class_members as membership
  where membership.class_id = group_row.class_id
    and membership.user_id = actor_profile.id
    and membership.status = 'active';

  if actor_role is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  class_row := private.require_active_class(group_row.class_id);

  if (actor_role = 'student' and not (select private.is_active_class_student(actor_profile.id, class_row.id)))
    or (actor_role = 'teacher' and not (select private.is_active_class_teacher(actor_profile.id, class_row.id))) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if actor_role = 'student' and group_row.status = 'archived' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select
    exists (
      select 1 from public.group_members as member
      where member.group_id = group_row.id and member.user_id = actor_profile.id and member.status = 'active'
    ),
    exists (
      select 1 from public.group_members as member
      where member.group_id = group_row.id and member.user_id = actor_profile.id
        and member.status = 'active' and member.role = 'leader'
    )
  into actor_is_member, actor_is_leader;

  member_count := private.group_active_member_count(group_row.id);
  pending_count := private.group_pending_invitation_count(group_row.id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', member_profile.id,
        'displayName', member_profile.display_name,
        'role', member.role,
        'joinedAt', member.joined_at
      )
      order by (member.role = 'leader') desc, member_profile.display_name, member_profile.id
    ),
    '[]'::jsonb
  )
  into members_json
  from public.group_members as member
  join public.profiles as member_profile on member_profile.id = member.user_id
  where member.group_id = group_row.id
    and member.status = 'active';

  if actor_is_leader or actor_role = 'teacher' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', invitation.id,
          'invitee', jsonb_build_object('id', invitee_profile.id, 'displayName', invitee_profile.display_name),
          'createdAt', invitation.created_at,
          'expiresAt', invitation.expires_at
        )
        order by invitation.created_at, invitation.id
      ),
      '[]'::jsonb
    )
    into invitations_json
    from public.group_invitations as invitation
    join public.profiles as invitee_profile on invitee_profile.id = invitation.invitee_id
    where invitation.group_id = group_row.id
      and invitation.status = 'pending'
      and invitation.expires_at > now();
  end if;

  return jsonb_build_object(
    'id', group_row.id,
    'classId', class_row.id,
    'className', class_row.name,
    'name', group_row.name,
    'description', group_row.description,
    'status', group_row.status,
    'creatorType', group_row.creator_type,
    'createdAt', group_row.created_at,
    'formationStatus', class_row.group_formation_status,
    'minimumSize', class_row.min_group_size,
    'maximumSize', class_row.max_group_size,
    'memberCount', member_count,
    'pendingCount', pending_count,
    'availableSeats', greatest(class_row.max_group_size - member_count - pending_count, 0),
    'meetsMinimumSize', member_count >= class_row.min_group_size,
    'members', members_json,
    'pendingInvitations', invitations_json,
    'viewer', jsonb_build_object(
      'userId', actor_profile.id,
      'role', actor_role,
      'isMember', actor_is_member,
      'isLeader', actor_is_leader
    ),
    'refreshedAt', now()
  );
end;
$$;

create function public.get_group_invitation(target_invitation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  invitation_row public.group_invitations%rowtype;
  group_row public.groups%rowtype;
  class_row public.classes%rowtype;
  actor_is_invitee boolean;
  member_count integer;
  effective_status text;
  cannot_respond_reason text;
  members_json jsonb;
  leader_json jsonb;
  inviter_json jsonb;
begin
  actor_profile := private.require_active_verified_actor();

  select *
  into invitation_row
  from public.group_invitations as invitation
  where invitation.id = target_invitation_id;

  if invitation_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  actor_is_invitee := invitation_row.invitee_id = actor_profile.id;

  if not (
    (actor_is_invitee and (select private.is_active_class_student(actor_profile.id, invitation_row.class_id)))
    or exists (
      select 1 from public.group_members as member
      where member.group_id = invitation_row.group_id and member.user_id = actor_profile.id
        and member.role = 'leader' and member.status = 'active'
    )
    or (select private.is_active_class_teacher(actor_profile.id, invitation_row.class_id))
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  class_row := private.require_active_class(invitation_row.class_id);

  select *
  into group_row
  from public.groups as candidate_group
  where candidate_group.id = invitation_row.group_id;

  member_count := private.group_active_member_count(group_row.id);
  effective_status := case
    when invitation_row.status = 'pending' and invitation_row.expires_at <= now() then 'expired'
    else invitation_row.status
  end;

  cannot_respond_reason := case
    when not actor_is_invitee then 'FORBIDDEN'
    when effective_status = 'expired' then 'INVITATION_EXPIRED'
    when effective_status <> 'pending' then 'INVITATION_NOT_PENDING'
    when group_row.deleted_at is not null or group_row.status = 'archived' then 'DESTINATION_GROUP_INVALID'
    when group_row.status = 'locked' then 'GROUP_LOCKED'
    when class_row.group_formation_status <> 'open' then 'GROUP_FORMATION_CLOSED'
    when exists (
      select 1 from public.group_members as member
      where member.class_id = class_row.id and member.user_id = actor_profile.id and member.status = 'active'
    ) then 'STUDENT_ALREADY_IN_GROUP'
    when member_count >= class_row.max_group_size then 'GROUP_FULL'
    else null
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', member_profile.id, 'displayName', member_profile.display_name, 'role', member.role)
      order by (member.role = 'leader') desc, member_profile.display_name, member_profile.id
    ),
    '[]'::jsonb
  )
  into members_json
  from public.group_members as member
  join public.profiles as member_profile on member_profile.id = member.user_id
  where member.group_id = group_row.id
    and member.status = 'active';

  select jsonb_build_object('id', leader_profile.id, 'displayName', leader_profile.display_name)
  into leader_json
  from public.profiles as leader_profile
  where leader_profile.id = private.group_active_leader_id(group_row.id);

  select jsonb_build_object('id', inviter_profile.id, 'displayName', inviter_profile.display_name)
  into inviter_json
  from public.profiles as inviter_profile
  where inviter_profile.id = invitation_row.invited_by;

  return jsonb_build_object(
    'id', invitation_row.id,
    'status', effective_status,
    'createdAt', invitation_row.created_at,
    'expiresAt', invitation_row.expires_at,
    'respondedAt', invitation_row.responded_at,
    'classId', class_row.id,
    'className', class_row.name,
    'group', jsonb_build_object(
      'id', group_row.id,
      'name', group_row.name,
      'status', group_row.status,
      'leader', leader_json,
      'members', members_json,
      'memberCount', member_count,
      'maximumSize', class_row.max_group_size,
      'availableSeats', greatest(class_row.max_group_size - member_count, 0)
    ),
    'inviter', inviter_json,
    'viewer', jsonb_build_object(
      'isInvitee', actor_is_invitee,
      'canRespond', cannot_respond_reason is null,
      'cannotRespondReason', cannot_respond_reason
    ),
    'refreshedAt', now()
  );
end;
$$;

-- Board: surface the viewer's pending invitations (additive field).
create or replace function public.get_class_group_board(target_class_id uuid)
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
  pending_invitations_json jsonb := '[]'::jsonb;
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

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', invitation.id,
          'groupId', invitation.group_id,
          'groupName', invited_group.name,
          'inviterName', inviter_profile.display_name,
          'expiresAt', invitation.expires_at
        )
        order by invitation.created_at, invitation.id
      ),
      '[]'::jsonb
    )
    into pending_invitations_json
    from public.group_invitations as invitation
    join public.groups as invited_group on invited_group.id = invitation.group_id
    join public.profiles as inviter_profile on inviter_profile.id = invitation.invited_by
    where invitation.class_id = target_class_id
      and invitation.invitee_id = actor_user_id
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and invited_group.deleted_at is null
      and invited_group.status <> 'archived';
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
      'cannotCreateReason', cannot_create_reason,
      'pendingInvitations', pending_invitations_json
    ),
    'groups', groups_json,
    'unassignedStudents', unassigned_json,
    'refreshedAt', now()
  );
end;
$$;

-- Grants ----------------------------------------------------------------------

revoke execute on function private.group_active_member_count(uuid) from public, anon, authenticated;
revoke execute on function private.group_pending_invitation_count(uuid) from public, anon, authenticated;
revoke execute on function private.group_active_leader_id(uuid) from public, anon, authenticated;
revoke execute on function private.expire_stale_group_invitations(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.require_active_verified_actor() from public, anon, authenticated;
revoke execute on function private.require_group_manager(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.require_active_class(uuid) from public, anon, authenticated;

revoke execute on function public.send_group_invitation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_group_invitation(uuid) from public, anon, authenticated;
revoke execute on function public.accept_group_invitation(uuid) from public, anon, authenticated;
revoke execute on function public.decline_group_invitation(uuid) from public, anon, authenticated;
revoke execute on function public.list_group_eligible_classmates(uuid) from public, anon, authenticated;
revoke execute on function public.get_group_detail(uuid) from public, anon, authenticated;
revoke execute on function public.get_group_invitation(uuid) from public, anon, authenticated;

grant execute on function public.send_group_invitation(uuid, uuid) to authenticated;
grant execute on function public.cancel_group_invitation(uuid) to authenticated;
grant execute on function public.accept_group_invitation(uuid) to authenticated;
grant execute on function public.decline_group_invitation(uuid) to authenticated;
grant execute on function public.list_group_eligible_classmates(uuid) to authenticated;
grant execute on function public.get_group_detail(uuid) to authenticated;
grant execute on function public.get_group_invitation(uuid) to authenticated;

comment on function public.send_group_invitation(uuid, uuid) is
  'P4-02 leader/teacher invitation send. Locks the group, bounds members plus pending invitations by capacity, replays an existing pending invitation, and notifies the invitee.';
comment on function public.cancel_group_invitation(uuid) is
  'P4-02 leader/teacher cancellation of a pending invitation; idempotent for already cancelled invitations.';
comment on function public.accept_group_invitation(uuid) is
  'P4-03 atomic acceptance. Locks invitee class membership, group, then invitation; revalidates pending, expiry, group state, formation, one current group, and capacity; cancels the invitee''s other pending invitations.';
comment on function public.decline_group_invitation(uuid) is
  'P4-03 invitee decline; idempotent for already declined invitations.';
comment on function public.list_group_eligible_classmates(uuid) is
  'P4-02 advisory invitation candidates for the leader or class teacher: eligible, pending, and already-in-group classmates with available seats.';
comment on function public.get_group_detail(uuid) is
  'P4-02 group detail for class members; pending invitations are visible only to the leader and class teachers.';
comment on function public.get_group_invitation(uuid) is
  'P4-03 invitation detail for the invitee, leader, or class teacher with effective status and the invitee response eligibility reason.';

commit;
