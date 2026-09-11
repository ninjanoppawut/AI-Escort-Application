begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint notifications_type_check check (btrim(type) <> ''),
  constraint notifications_title_check check (btrim(title) <> ''),
  constraint notifications_message_check check (btrim(message) <> '')
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc, id desc);
create index if not exists notifications_unread_by_user
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon, authenticated;
grant select, update (read_at) on table public.notifications to authenticated;

create policy notifications_select_recipient
on public.notifications
for select
to authenticated
using (
  recipient_id = (select auth.uid())
  and (select private.current_profile_is_active())
);

create policy notifications_mark_read_recipient
on public.notifications
for update
to authenticated
using (
  recipient_id = (select auth.uid())
  and (select private.current_profile_is_active())
)
with check (
  recipient_id = (select auth.uid())
  and (select private.current_profile_is_active())
);

create function private.insert_notification(
  target_recipient_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  notification_entity_type text,
  notification_entity_id uuid,
  notification_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id uuid;
begin
  insert into public.notifications (
    recipient_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    payload
  )
  values (
    target_recipient_id,
    notification_type,
    notification_title,
    notification_message,
    notification_entity_type,
    notification_entity_id,
    coalesce(notification_payload, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create function public.join_class_with_invite(
  invite_code text default null,
  invitation_token text default null
)
returns table(
  class_id uuid,
  school_id uuid,
  membership_id uuid,
  school_membership_id uuid,
  role text,
  class_name text,
  school_name text,
  already_joined boolean,
  used_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_profile public.profiles%rowtype;
  normalized_code text := upper(btrim(coalesce(invite_code, '')));
  trimmed_token text := btrim(coalesce(invitation_token, ''));
  hashed_token text;
  invite_row public.class_invites%rowtype;
  class_row public.classes%rowtype;
  school_row public.schools%rowtype;
  existing_member public.class_members%rowtype;
  inserted_school_membership_id uuid;
  inserted_class_membership_id uuid;
  new_used_count integer;
  invite_age_seconds integer;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if (normalized_code = '' and trimmed_token = '')
    or (normalized_code <> '' and trimmed_token <> '') then
    raise exception using errcode = '23514', message = 'INVITE_INVALID';
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

  if actor_profile.account_type <> 'student' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if trimmed_token <> '' then
    hashed_token := private.hash_invitation_token(trimmed_token);

    select *
    into invite_row
    from public.class_invites as invite
    where invite.token_hash = hashed_token
    for update;
  else
    select *
    into invite_row
    from public.class_invites as invite
    where invite.code = normalized_code
    for update;
  end if;

  if invite_row.id is null then
    raise exception using errcode = '42501', message = 'INVITE_INVALID';
  end if;

  select *
  into class_row
  from public.classes as class
  where class.id = invite_row.class_id
  for update;

  if class_row.id is null then
    raise exception using errcode = '42501', message = 'INVITE_INVALID';
  end if;

  if class_row.status <> 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  select *
  into school_row
  from public.schools as school
  where school.id = class_row.school_id
  for update;

  if school_row.id is null or school_row.status <> 'active' then
    raise exception using errcode = '42501', message = 'CLASS_NOT_ACTIVE';
  end if;

  select *
  into existing_member
  from public.class_members as member
  where member.class_id = class_row.id
    and member.user_id = actor_user_id
  for update;

  if existing_member.id is not null
    and existing_member.status = 'active'
    and existing_member.role = 'student' then
    return query
    select
      class_row.id,
      school_row.id,
      existing_member.id,
      (
        select school_membership.id
        from public.school_memberships as school_membership
        where school_membership.school_id = school_row.id
          and school_membership.user_id = actor_user_id
          and school_membership.role = 'student'
          and school_membership.status = 'active'
        limit 1
      ),
      'student'::text,
      class_row.name,
      school_row.name,
      true,
      invite_row.used_count;
    return;
  end if;

  if existing_member.id is not null and existing_member.role <> 'student' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if invite_row.status <> 'active' then
    raise exception using errcode = '42501', message = 'INVITE_DISABLED';
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at <= now() then
    raise exception using errcode = '42501', message = 'INVITE_EXPIRED';
  end if;

  if invite_row.max_uses is not null
    and invite_row.used_count >= invite_row.max_uses then
    raise exception using errcode = '42501', message = 'INVITE_INVALID';
  end if;

  insert into public.school_memberships (
    school_id,
    user_id,
    role,
    status,
    joined_at,
    left_at
  )
  values (
    school_row.id,
    actor_user_id,
    'student',
    'active',
    now(),
    null
  )
  on conflict on constraint school_memberships_school_user_unique do update
  set role = 'student',
      status = 'active',
      left_at = null,
      joined_at = case
        when public.school_memberships.status = 'left' then excluded.joined_at
        else public.school_memberships.joined_at
      end
  returning id into inserted_school_membership_id;

  if existing_member.id is null then
    insert into public.class_members (
      class_id,
      user_id,
      role,
      status,
      joined_at,
      left_at
    )
    values (
      class_row.id,
      actor_user_id,
      'student',
      'active',
      now(),
      null
    )
    returning id into inserted_class_membership_id;
  else
    update public.class_members as member
    set status = 'active',
        left_at = null,
        joined_at = now()
    where member.id = existing_member.id
    returning id into inserted_class_membership_id;
  end if;

  update public.class_invites as invite
  set used_count = invite.used_count + 1
  where invite.id = invite_row.id
  returning invite.used_count into new_used_count;

  invite_age_seconds := greatest(
    0,
    floor(extract(epoch from now() - invite_row.created_at))::integer
  );

  perform private.insert_notification(
    actor_user_id,
    'class_joined',
    'เข้าร่วมชั้นเรียนแล้ว',
    'เข้าร่วมชั้นเรียน ' || class_row.name || ' แล้ว',
    'class',
    class_row.id,
    jsonb_build_object('classId', class_row.id)
  );

  insert into public.notifications (
    recipient_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    payload
  )
  select
    teacher_member.user_id,
    'student_joined_class',
    'มีนักเรียนเข้าร่วมชั้นเรียน',
    actor_profile.display_name || ' เข้าร่วมชั้นเรียนแล้ว',
    'class',
    class_row.id,
    jsonb_build_object('classId', class_row.id, 'studentId', actor_user_id)
  from public.class_members as teacher_member
  where teacher_member.class_id = class_row.id
    and teacher_member.role = 'teacher'
    and teacher_member.status = 'active';

  perform private.insert_audit_log(
    actor_user_id,
    'class_joined',
    'class',
    class_row.id,
    school_row.id,
    class_row.id,
    'succeeded',
    jsonb_build_object(
      'invite_id', invite_row.id,
      'invite_channel', case when trimmed_token <> '' then 'link' else 'code' end,
      'already_joined', false
    )
  );

  perform private.insert_research_event(
    'class_joined',
    actor_user_id,
    school_row.id,
    class_row.id,
    jsonb_build_object(
      'invite_channel', case when trimmed_token <> '' then 'link' else 'code' end,
      'attempt_count', new_used_count
    )
  );

  return query
  select
    class_row.id,
    school_row.id,
    inserted_class_membership_id,
    inserted_school_membership_id,
    'student'::text,
    class_row.name,
    school_row.name,
    false,
    new_used_count;
end;
$$;

revoke execute on function private.insert_notification(uuid, text, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.join_class_with_invite(text, text)
  from public, anon, authenticated;

grant execute on function public.join_class_with_invite(text, text)
  to authenticated;

comment on table public.notifications is
  'Durable in-app notifications with recipient-scoped RLS; P1-04 creates class join notifications.';
comment on function public.join_class_with_invite(text, text) is
  'P1-04 atomic student class-invitation consumption RPC; stores no raw tokens and always creates student membership.';

commit;
