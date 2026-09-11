begin;

create table if not exists public.notification_types (
  type text primary key,
  layout text not null
    check (layout in (
      'membership',
      'invitation',
      'group_status',
      'session_status',
      'observation_status',
      'request',
      'warning',
      'export'
    )),
  icon text not null check (btrim(icon) <> ''),
  copy_key text not null unique check (btrim(copy_key) <> ''),
  deep_link_template text not null
    check (left(deep_link_template, 1) = '/'),
  schema_version integer not null default 1 check (schema_version >= 1),
  status text not null default 'active'
    check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_types (
  type,
  layout,
  icon,
  copy_key,
  deep_link_template
)
values
  ('class_joined', 'membership', 'School', 'notifications.class_joined', '/classes/{classId}'),
  ('student_joined_class', 'membership', 'UserPlus', 'notifications.student_joined_class', '/teacher/classes/{classId}/members'),
  ('group_invitation_received', 'invitation', 'MailPlus', 'notifications.group_invitation_received', '/group-invitations/{invitationId}'),
  ('group_invitation_accepted', 'membership', 'UserRoundCheck', 'notifications.group_invitation_accepted', '/classes/{classId}/groups/{groupId}'),
  ('group_invitation_declined', 'membership', 'UserRoundX', 'notifications.group_invitation_declined', '/classes/{classId}/groups/{groupId}'),
  ('group_invitation_cancelled', 'invitation', 'MailX', 'notifications.group_invitation_cancelled', '/classes/{classId}/groups'),
  ('student_moved_group', 'membership', 'ArrowRightLeft', 'notifications.student_moved_group', '/classes/{classId}/groups/{groupId}'),
  ('leadership_assigned', 'membership', 'Crown', 'notifications.leadership_assigned', '/classes/{classId}/groups/{groupId}'),
  ('leadership_transferred', 'membership', 'RefreshCw', 'notifications.leadership_transferred', '/classes/{classId}/groups/{groupId}'),
  ('group_minimum_reached', 'group_status', 'UsersRound', 'notifications.group_minimum_reached', '/teacher/classes/{classId}/groups/{groupId}'),
  ('group_approval_requested', 'request', 'ClipboardClock', 'notifications.group_approval_requested', '/teacher/classes/{classId}/groups/{groupId}'),
  ('group_approved', 'group_status', 'BadgeCheck', 'notifications.group_approved', '/classes/{classId}/groups/{groupId}'),
  ('group_locked', 'group_status', 'LockKeyhole', 'notifications.group_locked', '/classes/{classId}/groups/{groupId}'),
  ('group_unlocked', 'group_status', 'LockOpen', 'notifications.group_unlocked', '/classes/{classId}/groups/{groupId}'),
  ('group_archived', 'group_status', 'Archive', 'notifications.group_archived', '/classes/{classId}/groups'),
  ('group_deleted', 'group_status', 'Trash2', 'notifications.group_deleted', '/classes/{classId}/groups'),
  ('session_group_next', 'session_status', 'ListStart', 'notifications.session_group_next', '/activities/{activityId}/sessions/{sessionId}'),
  ('session_group_active', 'session_status', 'Navigation', 'notifications.session_group_active', '/field/sessions/{sessionId}'),
  ('session_completed', 'session_status', 'Flag', 'notifications.session_completed', '/sessions/{sessionId}/map'),
  ('observation_submitted', 'observation_status', 'Send', 'notifications.observation_submitted', '/teacher/reviews/{observationId}'),
  ('observation_resubmitted', 'observation_status', 'RefreshCw', 'notifications.observation_resubmitted', '/teacher/reviews/{observationId}'),
  ('observation_revision_requested', 'observation_status', 'RotateCcw', 'notifications.observation_revision_requested', '/observations/{observationId}/revision'),
  ('revision_access_requested', 'request', 'MessageSquarePlus', 'notifications.revision_access_requested', '/teacher/reviews/{observationId}/unlock-requests/{requestId}'),
  ('revision_access_granted', 'request', 'LockOpen', 'notifications.revision_access_granted', '/observations/{observationId}/revision'),
  ('observation_verified', 'observation_status', 'BadgeCheck', 'notifications.observation_verified', '/observations/{observationId}'),
  ('observation_unable_to_verify', 'observation_status', 'CircleHelp', 'notifications.observation_unable_to_verify', '/observations/{observationId}'),
  ('observation_rejected', 'observation_status', 'Ban', 'notifications.observation_rejected', '/observations/{observationId}'),
  ('same_species_warning', 'warning', 'Copy', 'notifications.same_species_warning', '/teacher/reviews/{observationId}'),
  ('observation_issue_reported', 'request', 'FlagTriangleRight', 'notifications.observation_issue_reported', '/teacher/reports/{reportId}'),
  ('location_session_warning', 'warning', 'MapPinWarning', 'notifications.location_session_warning', '/teacher/sessions/{sessionId}/live'),
  ('export_ready', 'export', 'Download', 'notifications.export_ready', '/teacher/exports/{exportId}')
on conflict (type) do update
set layout = excluded.layout,
    icon = excluded.icon,
    copy_key = excluded.copy_key,
    deep_link_template = excluded.deep_link_template,
    schema_version = excluded.schema_version,
    status = 'active',
    updated_at = now();

alter table public.notification_types enable row level security;

revoke all on table public.notification_types from anon, authenticated;
grant select on table public.notification_types to authenticated;

drop policy if exists notification_types_select_active on public.notification_types;
create policy notification_types_select_active
on public.notification_types
for select
to authenticated
using (
  status = 'active'
  and (select private.current_profile_is_active())
);

alter table public.notifications
  add column if not exists school_id uuid references public.schools (id) on delete cascade,
  add column if not exists class_id uuid references public.classes (id) on delete cascade,
  add column if not exists actor_id uuid references public.profiles (id) on delete set null,
  add column if not exists group_id uuid,
  add column if not exists group_invitation_id uuid,
  add column if not exists activity_id uuid,
  add column if not exists session_id uuid,
  add column if not exists observation_id uuid,
  add column if not exists request_id uuid,
  add column if not exists report_id uuid,
  add column if not exists export_id uuid,
  add column if not exists deep_link_path text,
  add column if not exists schema_version integer not null default 1;

alter table public.notifications
  drop constraint if exists notifications_type_check,
  drop constraint if exists notifications_type_fkey,
  add constraint notifications_type_fkey
    foreign key (type) references public.notification_types (type)
    on update cascade on delete restrict,
  add constraint notifications_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  add constraint notifications_schema_version_check
    check (schema_version >= 1),
  add constraint notifications_deep_link_path_check
    check (deep_link_path is null or left(deep_link_path, 1) = '/');

create index if not exists notifications_recipient_read_created_idx
  on public.notifications (recipient_id, read_at, created_at desc, id desc);
create index if not exists notifications_type_created_idx
  on public.notifications (type, created_at desc, id desc);
create index if not exists notifications_school_created_idx
  on public.notifications (school_id, created_at desc, id desc)
  where school_id is not null;
create index if not exists notifications_class_created_idx
  on public.notifications (class_id, created_at desc, id desc)
  where class_id is not null;
create index if not exists notifications_actor_created_idx
  on public.notifications (actor_id, created_at desc, id desc)
  where actor_id is not null;

create or replace function private.populate_notification_targets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  class_school_id uuid;
begin
  if new.entity_type = 'class' and new.entity_id is not null then
    new.class_id := coalesce(new.class_id, new.entity_id);
  end if;

  if new.class_id is not null then
    select class.school_id
    into class_school_id
    from public.classes as class
    where class.id = new.class_id;

    new.school_id := coalesce(new.school_id, class_school_id);
  end if;

  return new;
end;
$$;

drop trigger if exists populate_notification_targets_before_write
  on public.notifications;
create trigger populate_notification_targets_before_write
before insert or update on public.notifications
for each row execute function private.populate_notification_targets();

create or replace function private.insert_notification(
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
  normalized_type text := btrim(coalesce(notification_type, ''));
  normalized_title text := btrim(coalesce(notification_title, ''));
  normalized_message text := btrim(coalesce(notification_message, ''));
  normalized_payload jsonb := coalesce(notification_payload, '{}'::jsonb);
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = target_recipient_id
      and profile.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.notification_types as notification_type_row
    where notification_type_row.type = normalized_type
      and notification_type_row.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'NOTIFICATION_TYPE_INVALID';
  end if;

  if normalized_title = '' or normalized_message = '' then
    raise exception using errcode = '23514', message = 'NOTIFICATION_CONTENT_REQUIRED';
  end if;

  if jsonb_typeof(normalized_payload) <> 'object' then
    raise exception using errcode = '23514', message = 'NOTIFICATION_PAYLOAD_INVALID';
  end if;

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
    normalized_type,
    normalized_title,
    normalized_message,
    notification_entity_type,
    notification_entity_id,
    normalized_payload
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke execute on function private.populate_notification_targets()
  from public, anon, authenticated;
revoke execute on function private.insert_notification(uuid, text, text, text, text, uuid, jsonb)
  from public, anon, authenticated;

comment on table public.notification_types is
  'Authoritative P2 notification type registry: layout, icon, copy key, and deep-link template from UI_CONTRACTS.';
comment on table public.notifications is
  'Durable in-app notifications with recipient-scoped RLS, registry-backed types, and relational target columns.';
comment on function private.insert_notification(uuid, text, text, text, text, uuid, jsonb) is
  'Trusted notification producer interface; validates recipient, registered type, nonempty content, and object payload.';

commit;
