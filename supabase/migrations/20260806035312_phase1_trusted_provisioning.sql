begin;

create extension if not exists pgcrypto with schema extensions;

create table public.research_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  schema_version integer not null check (schema_version >= 1),
  actor_id uuid references public.profiles (id) on delete restrict,
  school_id uuid references public.schools (id) on delete restrict,
  class_id uuid references public.classes (id) on delete restrict,
  request_id uuid,
  trace_id text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  constraint research_events_name_check check (btrim(event_name) <> '')
);

create index research_events_name_time_idx
  on public.research_events (event_name, occurred_at desc, id desc);
create index research_events_actor_time_idx
  on public.research_events (actor_id, occurred_at desc, id desc)
  where actor_id is not null;
create index research_events_school_time_idx
  on public.research_events (school_id, occurred_at desc, id desc)
  where school_id is not null;
create index research_events_class_time_idx
  on public.research_events (class_id, occurred_at desc, id desc)
  where class_id is not null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete restrict,
  actor_kind text not null
    check (actor_kind in ('student', 'teacher', 'admin', 'system', 'worker')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  school_id uuid references public.schools (id) on delete restrict,
  class_id uuid references public.classes (id) on delete restrict,
  outcome text not null check (outcome in ('succeeded', 'denied', 'failed')),
  request_id uuid,
  trace_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_check check (btrim(action) <> ''),
  constraint audit_logs_resource_type_check check (btrim(resource_type) <> '')
);

create index audit_logs_created_idx
  on public.audit_logs (created_at desc, id desc);
create index audit_logs_actor_created_idx
  on public.audit_logs (actor_id, created_at desc, id desc)
  where actor_id is not null;
create index audit_logs_resource_created_idx
  on public.audit_logs (resource_type, resource_id, created_at desc, id desc)
  where resource_id is not null;
create index audit_logs_school_created_idx
  on public.audit_logs (school_id, created_at desc, id desc)
  where school_id is not null;
create index audit_logs_class_created_idx
  on public.audit_logs (class_id, created_at desc, id desc)
  where class_id is not null;

alter table public.research_events enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.research_events from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

create function private.hash_invitation_token(invitation_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(coalesce(invitation_token, ''), 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create function private.require_current_admin_aal2()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_status text;
  actor_confirmed_at timestamptz;
  actor_is_admin boolean;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select profile.status, profile.email_verified_at
  into actor_status, actor_confirmed_at
  from public.profiles as profile
  where profile.id = actor_user_id;

  if actor_status is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if actor_status <> 'active' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DISABLED';
  end if;

  if actor_confirmed_at is null then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_CONFIRMED';
  end if;

  select exists (
    select 1
    from public.platform_admins as platform_admin
    where platform_admin.user_id = actor_user_id
      and platform_admin.status = 'active'
  )
  into actor_is_admin;

  if not actor_is_admin then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception using errcode = '42501', message = 'MFA_REQUIRED';
  end if;

  return actor_user_id;
end;
$$;

create function private.ensure_target_profile_can_be_trusted(target_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_status text;
  target_confirmed_at timestamptz;
begin
  select profile.status, profile.email_verified_at
  into target_status, target_confirmed_at
  from public.profiles as profile
  where profile.id = target_user_id;

  if target_status is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if target_status <> 'active' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DISABLED';
  end if;

  if target_confirmed_at is null then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_CONFIRMED';
  end if;
end;
$$;

create function private.insert_audit_log(
  actor_user_id uuid,
  audit_action text,
  audit_resource_type text,
  audit_resource_id uuid,
  audit_school_id uuid,
  audit_class_id uuid,
  audit_outcome text,
  audit_payload jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    actor_id,
    actor_kind,
    action,
    resource_type,
    resource_id,
    school_id,
    class_id,
    outcome,
    payload
  )
  values (
    actor_user_id,
    case
      when actor_user_id is null then 'system'
      when exists (
        select 1
        from public.platform_admins as platform_admin
        where platform_admin.user_id = actor_user_id
          and platform_admin.status = 'active'
      ) then 'admin'
      else coalesce((
        select profile.account_type
        from public.profiles as profile
        where profile.id = actor_user_id
      ), 'system')
    end,
    audit_action,
    audit_resource_type,
    audit_resource_id,
    audit_school_id,
    audit_class_id,
    audit_outcome,
    coalesce(audit_payload, '{}'::jsonb)
  );
$$;

create function public.grant_platform_admin(
  target_user_id uuid,
  reason text
)
returns table(user_id uuid, status text, granted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  trimmed_reason text := btrim(coalesce(reason, ''));
begin
  actor_user_id := private.require_current_admin_aal2();
  perform private.ensure_target_profile_can_be_trusted(target_user_id);

  if char_length(trimmed_reason) not between 1 and 500 then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  insert into public.platform_admins (
    user_id,
    status,
    granted_by,
    granted_at,
    revoked_by,
    revoked_at,
    reason
  )
  values (
    target_user_id,
    'active',
    actor_user_id,
    now(),
    null,
    null,
    trimmed_reason
  )
  on conflict on constraint platform_admins_pkey do update
  set status = 'active',
      granted_by = excluded.granted_by,
      granted_at = excluded.granted_at,
      revoked_by = null,
      revoked_at = null,
      reason = excluded.reason;

  perform private.insert_audit_log(
    actor_user_id,
    'platform_admin_granted',
    'platform_admin',
    target_user_id,
    null,
    null,
    'succeeded',
    jsonb_build_object('target_user_id', target_user_id)
  );

  return query
  select platform_admin.user_id, platform_admin.status, platform_admin.granted_at
  from public.platform_admins as platform_admin
  where platform_admin.user_id = target_user_id;
end;
$$;

create function public.revoke_platform_admin(
  target_user_id uuid,
  reason text
)
returns table(user_id uuid, status text, revoked_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  trimmed_reason text := btrim(coalesce(reason, ''));
begin
  actor_user_id := private.require_current_admin_aal2();

  if char_length(trimmed_reason) not between 1 and 500 then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.platform_admins as platform_admin
  where platform_admin.user_id = target_user_id
    and platform_admin.status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  update public.platform_admins as platform_admin
  set status = 'revoked',
      revoked_by = actor_user_id,
      revoked_at = now(),
      reason = trimmed_reason
  where platform_admin.user_id = target_user_id;

  perform private.insert_audit_log(
    actor_user_id,
    'platform_admin_revoked',
    'platform_admin',
    target_user_id,
    null,
    null,
    'succeeded',
    jsonb_build_object('target_user_id', target_user_id)
  );

  return query
  select platform_admin.user_id, platform_admin.status, platform_admin.revoked_at
  from public.platform_admins as platform_admin
  where platform_admin.user_id = target_user_id;
end;
$$;

create function public.issue_teacher_invitation(
  target_school_id uuid,
  target_email text,
  invitation_expires_at timestamptz
)
returns table(invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  normalized_email text := lower(btrim(coalesce(target_email, '')));
  generated_token text;
  generated_token_hash text;
  existing_profile record;
  inserted_invitation_id uuid;
begin
  actor_user_id := private.require_current_admin_aal2();

  if normalized_email = '' then
    raise exception using errcode = '23514', message = 'EMAIL_REQUIRED';
  end if;

  if invitation_expires_at <= now()
    or invitation_expires_at > now() + interval '30 days' then
    raise exception using errcode = '23514', message = 'TEACHER_INVITE_INVALID';
  end if;

  perform 1
  from public.schools as school
  where school.id = target_school_id
    and school.status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_INVALID';
  end if;

  select profile.id, profile.status, profile.email_verified_at
  into existing_profile
  from public.profiles as profile
  where profile.email = normalized_email;

  if existing_profile.id is not null then
    if existing_profile.status <> 'active' then
      raise exception using errcode = '42501', message = 'ACCOUNT_DISABLED';
    end if;

    if existing_profile.email_verified_at is null then
      raise exception using errcode = '42501', message = 'EMAIL_NOT_CONFIRMED';
    end if;

    if exists (
      select 1
      from public.school_memberships as school_membership
      where school_membership.school_id = target_school_id
        and school_membership.user_id = existing_profile.id
        and school_membership.role = 'teacher'
        and school_membership.status = 'active'
    ) then
      raise exception using errcode = '23505', message = 'TEACHER_INVITE_INVALID';
    end if;
  end if;

  generated_token := replace(
    replace(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+', '-'),
    '/',
    '_'
  );
  generated_token_hash := private.hash_invitation_token(generated_token);

  begin
    insert into public.teacher_invitations (
      school_id,
      email,
      token_hash,
      created_by,
      expires_at
    )
    values (
      target_school_id,
      normalized_email,
      generated_token_hash,
      actor_user_id,
      invitation_expires_at
    )
    returning id into inserted_invitation_id;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'TEACHER_INVITE_INVALID';
  end;

  perform private.insert_audit_log(
    actor_user_id,
    'teacher_invitation_issued',
    'teacher_invitation',
    inserted_invitation_id,
    target_school_id,
    null,
    'succeeded',
    jsonb_build_object('email_domain', split_part(normalized_email, '@', 2))
  );

  return query select inserted_invitation_id, generated_token, invitation_expires_at;
end;
$$;

create function public.revoke_teacher_invitation(
  invitation_id uuid,
  reason text
)
returns table(id uuid, status text, revoked_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid;
  invitation_row public.teacher_invitations%rowtype;
  trimmed_reason text := btrim(coalesce(reason, ''));
begin
  actor_user_id := private.require_current_admin_aal2();

  if char_length(trimmed_reason) not between 1 and 500 then
    raise exception using errcode = '23514', message = 'FORBIDDEN';
  end if;

  select *
  into invitation_row
  from public.teacher_invitations as invitation
  where invitation.id = invitation_id
  for update;

  if invitation_row.id is null or invitation_row.status in ('accepted', 'revoked') then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_INVALID';
  end if;

  if invitation_row.status = 'expired' or invitation_row.expires_at <= now() then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_EXPIRED';
  end if;

  update public.teacher_invitations as invitation
  set status = 'revoked',
      revoked_by = actor_user_id,
      revoked_at = now()
  where invitation.id = invitation_id;

  perform private.insert_audit_log(
    actor_user_id,
    'teacher_invitation_revoked',
    'teacher_invitation',
    invitation_id,
    invitation_row.school_id,
    null,
    'succeeded',
    jsonb_build_object('reason_category', 'admin_requested')
  );

  return query
  select invitation.id, invitation.status, invitation.revoked_at
  from public.teacher_invitations as invitation
  where invitation.id = invitation_id;
end;
$$;

create function public.preview_teacher_invitation(invitation_token text)
returns table(
  invitation_id uuid,
  school_id uuid,
  school_name text,
  email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_email text;
  hashed_invitation_token text := private.hash_invitation_token(invitation_token);
  invitation_row public.teacher_invitations%rowtype;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select profile.email
  into actor_email
  from public.profiles as profile
  where profile.id = actor_user_id
    and profile.status = 'active'
    and profile.email_verified_at is not null;

  if actor_email is null then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_CONFIRMED';
  end if;

  select *
  into invitation_row
  from public.teacher_invitations as invitation
  where invitation.token_hash = hashed_invitation_token;

  if invitation_row.id is null or invitation_row.status in ('accepted', 'revoked') then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_INVALID';
  end if;

  if invitation_row.status = 'expired' or invitation_row.expires_at <= now() then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_EXPIRED';
  end if;

  if invitation_row.email <> actor_email then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_INVALID';
  end if;

  return query
  select
    invitation_row.id,
    school.id,
    school.name,
    invitation_row.email,
    invitation_row.expires_at
  from public.schools as school
  where school.id = invitation_row.school_id
    and school.status = 'active';

  if not found then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_INVALID';
  end if;
end;
$$;

create function public.consume_teacher_invitation(invitation_token text)
returns table(
  invitation_id uuid,
  school_id uuid,
  user_id uuid,
  account_type text,
  membership_role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_profile public.profiles%rowtype;
  hashed_invitation_token text := private.hash_invitation_token(invitation_token);
  invitation_row public.teacher_invitations%rowtype;
  invite_age_seconds integer;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into actor_profile
  from public.profiles as profile
  where profile.id = actor_user_id
  for update;

  if actor_profile.id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if actor_profile.status <> 'active' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DISABLED';
  end if;

  if actor_profile.email_verified_at is null then
    raise exception using errcode = '42501', message = 'EMAIL_NOT_CONFIRMED';
  end if;

  select *
  into invitation_row
  from public.teacher_invitations as invitation
  where invitation.token_hash = hashed_invitation_token
  for update;

  if invitation_row.id is null or invitation_row.status in ('accepted', 'revoked') then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_INVALID';
  end if;

  if invitation_row.status = 'expired' or invitation_row.expires_at <= now() then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_EXPIRED';
  end if;

  if invitation_row.email <> actor_profile.email then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_INVALID';
  end if;

  perform 1
  from public.schools as school
  where school.id = invitation_row.school_id
    and school.status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'TEACHER_INVITE_INVALID';
  end if;

  update public.profiles as profile
  set account_type = 'teacher'
  where profile.id = actor_user_id;

  insert into public.school_memberships (
    school_id,
    user_id,
    role,
    status,
    joined_at,
    left_at
  )
  values (
    invitation_row.school_id,
    actor_user_id,
    'teacher',
    'active',
    now(),
    null
  )
  on conflict on constraint school_memberships_school_user_unique do update
  set role = 'teacher',
      status = 'active',
      left_at = null,
      joined_at = case
        when public.school_memberships.status = 'left' then excluded.joined_at
        else public.school_memberships.joined_at
      end;

  update public.teacher_invitations as invitation
  set status = 'accepted',
      accepted_by = actor_user_id,
      accepted_at = now()
  where invitation.id = invitation_row.id;

  invite_age_seconds := greatest(
    0,
    floor(extract(epoch from now() - invitation_row.created_at))::integer
  );

  insert into public.research_events (
    event_name,
    schema_version,
    actor_id,
    school_id,
    occurred_at,
    payload
  )
  values (
    'teacher_invitation_consumed',
    1,
    actor_user_id,
    invitation_row.school_id,
    now(),
    jsonb_build_object(
      'school_id', invitation_row.school_id,
      'invite_age_s', invite_age_seconds
    )
  );

  perform private.insert_audit_log(
    actor_user_id,
    'teacher_invitation_consumed',
    'teacher_invitation',
    invitation_row.id,
    invitation_row.school_id,
    null,
    'succeeded',
    jsonb_build_object('invite_age_s', invite_age_seconds)
  );

  return query
  select
    invitation_row.id,
    invitation_row.school_id,
    actor_user_id,
    'teacher'::text,
    'teacher'::text;
end;
$$;

revoke execute on function private.hash_invitation_token(text)
  from public, anon, authenticated;
revoke execute on function private.require_current_admin_aal2()
  from public, anon, authenticated;
revoke execute on function private.ensure_target_profile_can_be_trusted(uuid)
  from public, anon, authenticated;
revoke execute on function private.insert_audit_log(uuid, text, text, uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;

revoke execute on function public.grant_platform_admin(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.revoke_platform_admin(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.issue_teacher_invitation(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.revoke_teacher_invitation(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.preview_teacher_invitation(text)
  from public, anon, authenticated;
revoke execute on function public.consume_teacher_invitation(text)
  from public, anon, authenticated;

grant execute on function public.grant_platform_admin(uuid, text)
  to authenticated;
grant execute on function public.revoke_platform_admin(uuid, text)
  to authenticated;
grant execute on function public.issue_teacher_invitation(uuid, text, timestamptz)
  to authenticated;
grant execute on function public.revoke_teacher_invitation(uuid, text)
  to authenticated;
grant execute on function public.preview_teacher_invitation(text)
  to authenticated;
grant execute on function public.consume_teacher_invitation(text)
  to authenticated;

comment on table public.research_events is
  'Append-only product/research event stream; P1-02A records teacher_invitation_consumed.';
comment on table public.audit_logs is
  'Append-only trusted operation audit records for platform-admin and provisioning changes.';
comment on function public.issue_teacher_invitation(uuid, text, timestamptz) is
  'Admin AAL2 RPC that generates the opaque teacher-invitation secret in PostgreSQL and stores only its hash.';
comment on function public.consume_teacher_invitation(text) is
  'Atomic email-bound teacher provisioning RPC; rejects expired, revoked, mismatched, and replayed invitations.';

commit;
