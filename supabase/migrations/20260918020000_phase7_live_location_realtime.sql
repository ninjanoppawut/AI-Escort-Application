begin;

-- P7-03: private session Realtime topics and the live-location lifecycle
-- (SES-008 to SES-010, D-006, D-054, PRIVACY §§4-6).
--
-- Realtime delivers a broadcast to every socket allowed to read its topic and
-- cannot verify who sent a client message. Named coordinates therefore travel
-- only on a per-student topic that the student and the class teacher can read
-- and only the student can write, and only while that student may publish.
-- Database-sent signals are persisted by realtime.send, so they carry pointers
-- only and never coordinates or names.

-- Topic parsing ------------------------------------------------------------------

create function private.parse_session_topic(topic text)
returns table(topic_kind text, session_id uuid, subject_id uuid)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when split_part(topic, ':', 3) = 'teachers' then 'teachers'
      else split_part(topic, ':', 3)
    end,
    split_part(topic, ':', 2)::uuid,
    case
      when split_part(topic, ':', 3) = 'teachers' then null
      else split_part(topic, ':', 4)::uuid
    end
  where topic ~ '^session:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(teachers|(group|location):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$';
$$;

-- Publish rule -------------------------------------------------------------------

-- A student may publish live location only while the session is open, their
-- snapshotted group is the active group, their participation is active, their
-- class membership is active, and their account is active and verified.
create function private.live_location_publish_allowed(target_session_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_session_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.session_participants as participant
      join public.exploration_session_groups as session_group
        on session_group.id = participant.session_group_id
      join public.exploration_sessions as session_row
        on session_row.id = participant.session_id
      join public.class_members as membership
        on membership.class_id = participant.class_id
       and membership.user_id = participant.user_id
      join public.profiles as profile on profile.id = participant.user_id
      where participant.session_id = target_session_id
        and participant.user_id = target_user_id
        and participant.participation_status = 'active'
        and session_group.status = 'active'
        and session_row.status = 'open'
        and membership.role = 'student'
        and membership.status = 'active'
        and profile.status = 'active'
        and profile.email_verified_at is not null
    );
$$;

-- Topic authorization used by the realtime.messages policies. Access values:
-- broadcast_read, broadcast_write, presence_read, presence_write.
create function private.current_user_session_topic_allows(topic text, access text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  parsed record;
  session_row public.exploration_sessions%rowtype;
  is_teacher boolean;
begin
  if actor_id is null or not (select private.current_profile_is_active()) then
    return false;
  end if;

  select * into parsed from private.parse_session_topic(topic);
  if parsed.topic_kind is null then
    return false;
  end if;

  select * into session_row
  from public.exploration_sessions as candidate
  where candidate.id = parsed.session_id;
  if session_row.id is null then
    return false;
  end if;

  is_teacher := private.is_active_class_teacher(actor_id, session_row.class_id);

  if parsed.topic_kind = 'teachers' then
    return access = 'broadcast_read' and is_teacher;
  end if;

  if parsed.topic_kind = 'group' then
    if access = 'presence_read' then
      return is_teacher;
    end if;

    if access not in ('broadcast_read', 'presence_write') then
      return false;
    end if;

    if access = 'broadcast_read' and is_teacher then
      return true;
    end if;

    return exists (
      select 1
      from public.session_participants as participant
      join public.exploration_session_groups as session_group
        on session_group.id = participant.session_group_id
      join public.class_members as membership
        on membership.class_id = participant.class_id
       and membership.user_id = participant.user_id
      where participant.session_id = session_row.id
        and participant.user_id = actor_id
        and participant.participation_status = 'active'
        and session_group.group_id = parsed.subject_id
        and membership.status = 'active'
        and (access = 'broadcast_read' or session_row.status in ('open', 'paused'))
    );
  end if;

  -- Location topics: the owner reads and writes, the class teacher only reads,
  -- and both lose access as soon as the owner may no longer publish.
  if access = 'broadcast_write' then
    return actor_id = parsed.subject_id
      and private.live_location_publish_allowed(session_row.id, parsed.subject_id);
  end if;

  if access = 'broadcast_read' then
    return (actor_id = parsed.subject_id or is_teacher)
      and private.live_location_publish_allowed(session_row.id, parsed.subject_id);
  end if;

  return false;
end;
$$;

-- Session signals ----------------------------------------------------------------

create function private.send_session_signal(
  signal_type text,
  target_topic text,
  target_session_id uuid,
  target_session_group_id uuid,
  target_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Pointer only: clients stop publishing and refetch the authoritative view.
  perform realtime.send(
    jsonb_build_object(
      'type', signal_type,
      'version', 1,
      'sessionId', target_session_id,
      'sessionGroupId', target_session_group_id,
      'groupId', target_group_id,
      'changedAt', now()
    ),
    signal_type,
    target_topic,
    true
  );
end;
$$;

create function private.broadcast_session_status_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_group_row public.exploration_session_groups%rowtype;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  perform private.send_session_signal(
    'session.status_changed', 'session:' || new.id::text || ':teachers', new.id, null, null
  );

  for session_group_row in
    select * from public.exploration_session_groups as session_group
    where session_group.session_id = new.id
    order by session_group.queue_position
  loop
    perform private.send_session_signal(
      'session.status_changed',
      'session:' || new.id::text || ':group:' || session_group_row.group_id::text,
      new.id, null, null
    );
  end loop;

  return null;
end;
$$;

create function private.broadcast_session_group_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session_group public.exploration_session_groups%rowtype;
  signal_type text;
begin
  if tg_table_name = 'exploration_session_groups' then
    if new.status is not distinct from old.status then
      return null;
    end if;
    target_session_group := new;
    signal_type := 'session.group_status_changed';
  else
    if new.participation_status is not distinct from old.participation_status then
      return null;
    end if;
    select * into target_session_group
    from public.exploration_session_groups as session_group
    where session_group.id = new.session_group_id;
    signal_type := 'session.participant_changed';
  end if;

  perform private.send_session_signal(
    signal_type, 'session:' || target_session_group.session_id::text || ':teachers',
    target_session_group.session_id, target_session_group.id, target_session_group.group_id
  );
  perform private.send_session_signal(
    signal_type,
    'session:' || target_session_group.session_id::text || ':group:' || target_session_group.group_id::text,
    target_session_group.session_id, target_session_group.id, target_session_group.group_id
  );

  return null;
end;
$$;

create trigger exploration_sessions_broadcast_status_signal
after update of status on public.exploration_sessions
for each row execute function private.broadcast_session_status_signal();

create trigger exploration_session_groups_broadcast_status_signal
after update of status on public.exploration_session_groups
for each row execute function private.broadcast_session_group_signal();

create trigger session_participants_broadcast_status_signal
after update of participation_status on public.session_participants
for each row execute function private.broadcast_session_group_signal();

-- Realtime policies --------------------------------------------------------------

create policy session_group_realtime_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.topic = (select realtime.topic())
  and (select realtime.topic()) like 'session:%:group:%'
  and (select private.current_user_session_topic_allows((select realtime.topic()), 'broadcast_read'))
);

create policy session_group_presence_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and realtime.messages.topic = (select realtime.topic())
  and (select realtime.topic()) like 'session:%:group:%'
  and (select private.current_user_session_topic_allows((select realtime.topic()), 'presence_read'))
);

create policy session_group_presence_track
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and realtime.messages.topic = (select realtime.topic())
  and (select realtime.topic()) like 'session:%:group:%'
  and (select private.current_user_session_topic_allows((select realtime.topic()), 'presence_write'))
);

create policy session_teachers_realtime_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.topic = (select realtime.topic())
  and (select realtime.topic()) like 'session:%:teachers'
  and (select private.current_user_session_topic_allows((select realtime.topic()), 'broadcast_read'))
);

create policy session_location_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.topic = (select realtime.topic())
  and (select realtime.topic()) like 'session:%:location:%'
  and (select private.current_user_session_topic_allows((select realtime.topic()), 'broadcast_read'))
);

create policy session_location_publish
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.topic = (select realtime.topic())
  and (select realtime.topic()) like 'session:%:location:%'
  and (select private.current_user_session_topic_allows((select realtime.topic()), 'broadcast_write'))
);

-- Durable location samples (SES-009, DATABASE_DESIGN §14A) ----------------------

alter table public.session_participants
  add constraint session_participants_id_session_unique unique (id, session_id);

create table public.location_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  class_id uuid not null,
  session_participant_id uuid not null,
  client_sample_id uuid not null,
  event_type text not null default 'sample',
  location extensions.geography(point, 4326),
  accuracy_m numeric,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  device_context jsonb not null default '{}'::jsonb,
  constraint location_events_session_class_fk foreign key (session_id, class_id)
    references public.exploration_sessions (id, class_id) on delete cascade,
  constraint location_events_participant_session_fk foreign key (session_participant_id, session_id)
    references public.session_participants (id, session_id) on delete cascade,
  constraint location_events_client_sample_unique unique (session_participant_id, client_sample_id),
  constraint location_events_type_check check (
    event_type in ('sample', 'boundary_warning', 'checkpoint_reached')
  ),
  constraint location_events_sample_check check (
    event_type <> 'sample' or (location is not null and accuracy_m is not null)
  ),
  constraint location_events_accuracy_check check (
    accuracy_m is null or (accuracy_m > 0 and accuracy_m <= 100000)
  ),
  constraint location_events_device_context_check check (jsonb_typeof(device_context) = 'object')
);

create index location_events_session_participant_recorded_idx
  on public.location_events (session_id, session_participant_id, recorded_at desc, id desc);
create index location_events_participant_recorded_idx
  on public.location_events (session_participant_id, recorded_at desc);
create index location_events_class_idx on public.location_events (class_id);

alter table public.location_events enable row level security;
revoke all on table public.location_events from public, anon, authenticated;

create function private.reject_location_event_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'LOCATION_EVENTS_APPEND_ONLY';
end;
$$;

create trigger location_events_reject_update
before update on public.location_events
for each row execute function private.reject_location_event_update();

-- Record one durable sample --------------------------------------------------------

create function public.record_live_location_sample(
  target_session_id uuid,
  target_client_sample_id uuid,
  sample_lat double precision,
  sample_lng double precision,
  sample_accuracy_m double precision,
  sample_recorded_at timestamptz
)
returns table(
  outcome text,
  error_code text,
  error_details jsonb,
  sample_id uuid,
  retry_after_s integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  participant_row public.session_participants%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
  existing_id uuid;
  last_recorded timestamptz;
  inserted_id uuid;
begin
  actor_profile := private.require_active_verified_actor();

  -- Same lock order as the session control RPCs: session, then its group.
  select * into session_row
  from public.exploration_sessions as candidate
  where candidate.id = target_session_id
  for share;

  if session_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into participant_row
  from public.session_participants as participant
  where participant.session_id = session_row.id
    and participant.user_id = actor_profile.id;

  if participant_row.id is null
    or participant_row.participation_status <> 'active'
    or not exists (
      select 1 from public.class_members as membership
      where membership.class_id = session_row.class_id
        and membership.user_id = actor_profile.id
        and membership.role = 'student'
        and membership.status = 'active'
    ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if session_row.status = 'paused' then
    return query select 'denied'::text, 'SESSION_PAUSED'::text, null::jsonb, null::uuid, null::integer;
    return;
  end if;

  if session_row.status <> 'open' then
    return query select 'denied'::text, 'SESSION_NOT_OPEN'::text, null::jsonb, null::uuid, null::integer;
    return;
  end if;

  select * into session_group_row
  from public.exploration_session_groups as session_group
  where session_group.id = participant_row.session_group_id
  for share;

  if session_group_row.status <> 'active' then
    return query select 'denied'::text, 'GROUP_NOT_ACTIVE'::text, null::jsonb, null::uuid, null::integer;
    return;
  end if;

  if sample_lat is null or sample_lat < -90 or sample_lat > 90 or sample_lat = 'NaN'::double precision then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'lat'), null::uuid, null::integer;
    return;
  end if;

  if sample_lng is null or sample_lng < -180 or sample_lng > 180 or sample_lng = 'NaN'::double precision then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'lng'), null::uuid, null::integer;
    return;
  end if;

  if sample_accuracy_m is null or sample_accuracy_m <= 0 or sample_accuracy_m > 100000
    or sample_accuracy_m = 'NaN'::double precision then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'accuracyM'), null::uuid, null::integer;
    return;
  end if;

  if sample_recorded_at is null
    or sample_recorded_at < now() - interval '120 seconds'
    or sample_recorded_at > now() + interval '120 seconds' then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'recordedAt'), null::uuid, null::integer;
    return;
  end if;

  if target_client_sample_id is null then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'clientSampleId'), null::uuid, null::integer;
    return;
  end if;

  select event.id into existing_id
  from public.location_events as event
  where event.session_participant_id = participant_row.id
    and event.client_sample_id = target_client_sample_id;

  if existing_id is not null then
    return query select 'duplicate'::text, null::text, null::jsonb, existing_id, null::integer;
    return;
  end if;

  select max(event.received_at) into last_recorded
  from public.location_events as event
  where event.session_participant_id = participant_row.id
    and event.event_type = 'sample';

  if last_recorded is not null and last_recorded > now() - interval '8 seconds' then
    return query select 'denied'::text, 'RATE_LIMITED'::text, null::jsonb, null::uuid,
      greatest(ceil(extract(epoch from last_recorded + interval '8 seconds' - now()))::integer, 1);
    return;
  end if;

  insert into public.location_events (
    session_id, class_id, session_participant_id, client_sample_id, event_type,
    location, accuracy_m, recorded_at
  )
  values (
    session_row.id, session_row.class_id, participant_row.id, target_client_sample_id, 'sample',
    extensions.st_setsrid(extensions.st_makepoint(sample_lng, sample_lat), 4326)::extensions.geography,
    sample_accuracy_m, sample_recorded_at
  )
  on conflict (session_participant_id, client_sample_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select event.id into inserted_id
    from public.location_events as event
    where event.session_participant_id = participant_row.id
      and event.client_sample_id = target_client_sample_id;
    return query select 'duplicate'::text, null::text, null::jsonb, inserted_id, null::integer;
    return;
  end if;

  return query select 'recorded'::text, null::text, null::jsonb, inserted_id, null::integer;
end;
$$;

-- Teacher live-location read model (SES-010) ------------------------------------

create function public.get_session_live_locations(target_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  active_row public.exploration_session_groups%rowtype;
  publishing boolean;
begin
  actor_profile := private.require_active_verified_actor();

  select * into session_row
  from public.exploration_sessions as candidate
  where candidate.id = target_session_id;

  if session_row.id is null
    or not private.is_active_class_teacher(actor_profile.id, session_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into active_row
  from public.exploration_session_groups as session_group
  where session_group.session_id = session_row.id
    and session_group.status = 'active';

  publishing := session_row.status = 'open' and active_row.id is not null;

  return jsonb_build_object(
    'sessionStatus', session_row.status,
    'activeSessionGroupId', active_row.id,
    'activeGroupId', active_row.group_id,
    'publishing', publishing,
    'items', case
      when not publishing then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'userId', participant.user_id,
            'displayName', profile.display_name,
            'roleAtStart', participant.role_at_start,
            'latestSample', (
              select jsonb_build_object(
                'lat', round(extensions.st_y(event.location::extensions.geometry)::numeric, 6),
                'lng', round(extensions.st_x(event.location::extensions.geometry)::numeric, 6),
                'accuracyM', event.accuracy_m,
                'recordedAt', event.recorded_at,
                'receivedAt', event.received_at
              )
              from public.location_events as event
              where event.session_participant_id = participant.id
                and event.event_type = 'sample'
                and event.received_at >= active_row.activated_at
                and event.received_at >= now() - interval '10 minutes'
              order by event.recorded_at desc, event.id desc
              limit 1
            )
          )
          order by (participant.role_at_start = 'leader') desc, profile.display_name, participant.user_id
        )
        from public.session_participants as participant
        join public.profiles as profile on profile.id = participant.user_id
        where participant.session_group_id = active_row.id
          and participant.participation_status = 'active'
      ), '[]'::jsonb)
    end,
    'refreshedAt', now()
  );
end;
$$;

-- The participant view reports the same publish rule the policies enforce.
create or replace function public.get_session_participant_view(target_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  version_row public.activity_versions%rowtype;
  participant_row public.session_participants%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
  group_row public.groups%rowtype;
begin
  actor_profile := private.require_active_verified_actor();

  select * into session_row
  from public.exploration_sessions as candidate
  where candidate.id = target_session_id;

  if session_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into participant_row
  from public.session_participants as participant
  where participant.session_id = session_row.id
    and participant.user_id = actor_profile.id;

  if participant_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into class_row from public.classes as class where class.id = session_row.class_id;
  select * into version_row from public.activity_versions as version where version.id = session_row.activity_version_id;
  select * into session_group_row
  from public.exploration_session_groups as session_group
  where session_group.id = participant_row.session_group_id;
  select * into group_row from public.groups as candidate where candidate.id = session_group_row.group_id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', session_row.id,
      'classId', session_row.class_id,
      'title', session_row.title,
      'status', session_row.status,
      'openedAt', session_row.opened_at,
      'completedAt', session_row.completed_at
    ),
    'className', class_row.name,
    'activity', jsonb_build_object(
      'id', session_row.activity_id,
      'title', version_row.title,
      'versionNumber', version_row.version_number,
      'instructions', version_row.instructions
    ),
    'geometry', (private.activity_version_payload(version_row.id)) -> 'geometry',
    'myGroup', jsonb_build_object(
      'sessionGroupId', session_group_row.id,
      'groupId', session_group_row.group_id,
      'name', group_row.name,
      'status', session_group_row.status,
      'queuePosition', session_group_row.queue_position,
      'roleAtStart', participant_row.role_at_start,
      'members', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'userId', participant.user_id,
            'displayName', profile.display_name,
            'roleAtStart', participant.role_at_start
          )
          order by (participant.role_at_start = 'leader') desc, profile.display_name, participant.user_id
        )
        from public.session_participants as participant
        join public.profiles as profile on profile.id = participant.user_id
        where participant.session_group_id = session_group_row.id
      ), '[]'::jsonb)
    ),
    'groupsAhead', (
      select count(*)
      from public.exploration_session_groups as session_group
      where session_group.session_id = session_row.id
        and session_group.queue_position < session_group_row.queue_position
        and session_group.status <> 'completed'
    ),
    'permissions', jsonb_build_object(
      'canPublishLocation', private.live_location_publish_allowed(session_row.id, actor_profile.id),
      'canSubmitObservations', session_row.status = 'open' and session_group_row.status = 'active'
        and participant_row.participation_status = 'active',
      'blockedReason', case
        when session_row.status = 'completed' then 'session_completed'
        when session_row.status = 'paused' then 'session_paused'
        when session_group_row.status = 'completed' then 'group_completed'
        when session_group_row.status <> 'active' then 'group_waiting'
        when participant_row.participation_status <> 'active' then 'participation_inactive'
        else null
      end
    ),
    'refreshedAt', now()
  );
end;
$$;

-- Grants -------------------------------------------------------------------------

revoke execute on function private.parse_session_topic(text) from public, anon;
grant execute on function private.parse_session_topic(text) to authenticated;
revoke execute on function private.current_user_session_topic_allows(text, text) from public, anon;
grant execute on function private.current_user_session_topic_allows(text, text) to authenticated;
revoke execute on function private.live_location_publish_allowed(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.send_session_signal(text, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.broadcast_session_status_signal() from public, anon, authenticated;
revoke execute on function private.broadcast_session_group_signal() from public, anon, authenticated;
revoke execute on function private.reject_location_event_update() from public, anon, authenticated;

revoke execute on function public.record_live_location_sample(uuid, uuid, double precision, double precision, double precision, timestamptz)
  from public, anon;
grant execute on function public.record_live_location_sample(uuid, uuid, double precision, double precision, double precision, timestamptz)
  to authenticated;
revoke execute on function public.get_session_live_locations(uuid) from public, anon;
grant execute on function public.get_session_live_locations(uuid) to authenticated;
revoke execute on function public.get_session_participant_view(uuid) from public, anon;
grant execute on function public.get_session_participant_view(uuid) to authenticated;

comment on function private.parse_session_topic(text) is
  'Parses strict session:{uuid}:teachers, session:{uuid}:group:{uuid}, and session:{uuid}:location:{uuid} topics; returns no row otherwise.';
comment on function private.live_location_publish_allowed(uuid, uuid) is
  'P7-03 publish rule: session open, group active, participation active, class membership active, account active and verified.';
comment on function private.current_user_session_topic_allows(text, text) is
  'P7-03 session topic authorization for realtime.messages policies.';
comment on table public.location_events is
  'P7-03 durable live-location samples. No direct client access; written and read only through SECURITY DEFINER RPCs. Raw samples follow the PRIVACY §5 retention schedule (P14-05).';
comment on policy session_location_publish on realtime.messages is
  'P7-03: only the owner may broadcast on session:{sessionId}:location:{userId}, and only while allowed to publish.';

commit;
