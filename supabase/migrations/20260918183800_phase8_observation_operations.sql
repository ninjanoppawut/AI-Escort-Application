begin;

-- P8-02/P8-03: idempotent observation start against the participant snapshot
-- and the active group, capture metadata with explicit missing-location
-- handling, versioned draft edits, and owner-only read models.

-- Start rule (PRD §§2, 9.3; D-004; SES-005; SES-007; API §13): the session is
-- open, the caller's snapshotted group is active, participation and class
-- membership are active, the class is active, and the account is active and
-- verified. Kept separate from the live-location rule so they can diverge.
create function private.observation_start_denial(target_session_id uuid, target_user_id uuid)
returns table(code text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  participant_row public.session_participants%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
begin
  select * into session_row from public.exploration_sessions as candidate where candidate.id = target_session_id;
  select * into participant_row
  from public.session_participants as participant
  where participant.session_id = target_session_id and participant.user_id = target_user_id;

  if session_row.id is null or participant_row.id is null
    or participant_row.participation_status <> 'active'
    or not private.is_active_class_student(target_user_id, session_row.class_id) then
    return query select 'FORBIDDEN'::text, null::text;
    return;
  end if;

  select * into class_row from public.classes as class where class.id = session_row.class_id;
  if class_row.status <> 'active' then
    return query select 'CLASS_NOT_ACTIVE'::text, null::text;
    return;
  end if;

  if session_row.status = 'paused' then
    return query select 'SESSION_PAUSED'::text, null::text;
    return;
  end if;

  if session_row.status <> 'open' then
    return query select 'SESSION_NOT_OPEN'::text,
      case when session_row.status = 'completed' then 'session_completed' else 'session_scheduled' end;
    return;
  end if;

  select * into session_group_row
  from public.exploration_session_groups as session_group
  where session_group.id = participant_row.session_group_id;

  if session_group_row.status <> 'active' then
    return query select 'GROUP_NOT_ACTIVE'::text,
      case when session_group_row.status = 'completed' then 'group_completed' else 'group_waiting' end;
    return;
  end if;

  return query select null::text, null::text;
end;
$$;

-- Drafts stay editable while the session is paused (SES-007, D-056) but not
-- after the group or session completes.
create function private.observation_edit_denial(target_observation_id uuid)
returns table(code text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
  session_row public.exploration_sessions%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
begin
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  select * into session_row from public.exploration_sessions as candidate where candidate.id = observation_row.session_id;
  select * into session_group_row
  from public.exploration_session_groups as candidate
  where candidate.id = observation_row.session_group_id;

  if observation_row.status <> 'draft' then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'not_draft'::text;
  elsif session_row.status = 'completed' then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'session_completed'::text;
  elsif session_group_row.status = 'completed' then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'group_completed'::text;
  elsif session_row.status not in ('open', 'paused') or session_group_row.status not in ('active', 'paused') then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'group_waiting'::text;
  else
    return query select null::text, null::text;
  end if;
end;
$$;

create function private.observation_owner_payload(target_observation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', observation.id,
    'clientGeneratedId', observation.client_generated_id,
    'status', observation.status,
    'version', observation.version,
    'capture', jsonb_build_object(
      'locationStatus', observation.location_status,
      'lat', round(extensions.st_y(observation.capture_location::extensions.geometry)::numeric, 6),
      'lng', round(extensions.st_x(observation.capture_location::extensions.geometry)::numeric, 6),
      'accuracyM', observation.capture_accuracy_m,
      'capturedAt', observation.captured_at,
      'unavailableReason', observation.location_unavailable_reason
    ),
    'draft', jsonb_build_object(
      'commonName', observation.student_common_name,
      'scientificName', observation.student_scientific_name,
      'evidenceNote', observation.student_evidence_note
    ),
    'session', jsonb_build_object(
      'id', session_row.id,
      'classId', session_row.class_id,
      'title', session_row.title,
      'status', session_row.status
    ),
    'activity', jsonb_build_object('id', observation.activity_id, 'title', version_row.title),
    'groupStatus', session_group_row.status,
    'permissions', (
      select jsonb_build_object(
        'canEdit', denial.code is null,
        'blockedCode', denial.code,
        'blockedReason', denial.reason
      )
      from private.observation_edit_denial(observation.id) as denial
    ),
    'createdAt', observation.created_at,
    'updatedAt', observation.updated_at
  )
  from public.observations as observation
  join public.exploration_sessions as session_row on session_row.id = observation.session_id
  join public.exploration_session_groups as session_group_row on session_group_row.id = observation.session_group_id
  join public.activity_versions as version_row on version_row.id = session_row.activity_version_id
  where observation.id = target_observation_id;
$$;

-- Start ------------------------------------------------------------------------------

create function public.start_observation(
  target_session_id uuid,
  target_client_generated_id uuid,
  capture_location_status text,
  capture_lat double precision,
  capture_lng double precision,
  capture_accuracy_m double precision,
  capture_captured_at timestamptz,
  capture_unavailable_reason text
)
returns table(
  outcome text,
  error_code text,
  error_details jsonb,
  observation_id uuid,
  observation_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  participant_row public.session_participants%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
  existing_row public.observations%rowtype;
  denial record;
  inserted_id uuid;
  requested_location extensions.geography;
begin
  actor_profile := private.require_active_verified_actor();

  -- Same lock order as session control: session, then its group.
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
    or not private.is_active_class_student(actor_profile.id, session_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if target_client_generated_id is null then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text,
      jsonb_build_object('field', 'clientGeneratedId'), null::uuid, null::integer;
    return;
  end if;

  if capture_location_status = 'captured'
    and capture_lat between -90 and 90 and capture_lng between -180 and 180 then
    requested_location := extensions.st_setsrid(
      extensions.st_makepoint(capture_lng, capture_lat), 4326
    )::extensions.geography;
  end if;

  -- Idempotent replay before any state check, so a committed start that is
  -- retried after a pause still returns the same draft.
  select * into existing_row
  from public.observations as candidate
  where candidate.observer_id = actor_profile.id
    and candidate.client_generated_id = target_client_generated_id;

  if existing_row.id is not null then
    if existing_row.session_id = session_row.id
      and existing_row.location_status = capture_location_status
      and existing_row.location_unavailable_reason is not distinct from capture_unavailable_reason
      and existing_row.capture_location::text is not distinct from requested_location::text then
      return query select 'existing'::text, null::text, null::jsonb, existing_row.id, existing_row.version;
    else
      return query select 'denied'::text, 'IDEMPOTENCY_KEY_REUSE'::text, null::jsonb, null::uuid, null::integer;
    end if;
    return;
  end if;

  select * into denial from private.observation_start_denial(session_row.id, actor_profile.id);
  if denial.code = 'FORBIDDEN' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if denial.code is not null then
    return query select 'denied'::text, denial.code,
      case when denial.reason is null then null else jsonb_build_object('reason', denial.reason) end,
      null::uuid, null::integer;
    return;
  end if;

  select * into session_group_row
  from public.exploration_session_groups as session_group
  where session_group.id = participant_row.session_group_id
  for share;

  if session_group_row.status <> 'active' then
    return query select 'denied'::text, 'GROUP_NOT_ACTIVE'::text,
      jsonb_build_object('reason', case when session_group_row.status = 'completed' then 'group_completed' else 'group_waiting' end),
      null::uuid, null::integer;
    return;
  end if;

  -- Capture validation. Poor accuracy is never a denial (D-051).
  if capture_location_status is null or capture_location_status not in ('captured', 'unavailable') then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'locationStatus'), null::uuid, null::integer;
    return;
  end if;

  if capture_location_status = 'captured' then
    if capture_lat is null or capture_lat = 'NaN'::double precision or capture_lat < -90 or capture_lat > 90 then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'lat'), null::uuid, null::integer;
      return;
    end if;
    if capture_lng is null or capture_lng = 'NaN'::double precision or capture_lng < -180 or capture_lng > 180 then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'lng'), null::uuid, null::integer;
      return;
    end if;
    if capture_accuracy_m is null or capture_accuracy_m = 'NaN'::double precision
      or capture_accuracy_m <= 0 or capture_accuracy_m > 100000 then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'accuracyM'), null::uuid, null::integer;
      return;
    end if;
    if capture_unavailable_reason is not null then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'unavailableReason'), null::uuid, null::integer;
      return;
    end if;
  else
    -- A coordinate is never stored next to an unavailable flag (D-020).
    if capture_lat is not null or capture_lng is not null or capture_accuracy_m is not null then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'lat'), null::uuid, null::integer;
      return;
    end if;
    if capture_unavailable_reason is null
      or capture_unavailable_reason not in ('position_unavailable', 'timeout', 'unsupported') then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'unavailableReason'), null::uuid, null::integer;
      return;
    end if;
  end if;

  if capture_captured_at is null
    or capture_captured_at < now() - interval '15 minutes'
    or capture_captured_at > now() + interval '120 seconds' then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'capturedAt'), null::uuid, null::integer;
    return;
  end if;

  select * into class_row from public.classes as class where class.id = session_row.class_id;

  perform set_config('app.observation_status_reason', 'observation_started', true);

  insert into public.observations (
    client_generated_id, observer_id, class_id, activity_id, session_id, session_group_id,
    session_participant_id, location_status, capture_location, capture_accuracy_m, captured_at,
    location_unavailable_reason
  )
  values (
    target_client_generated_id, actor_profile.id, session_row.class_id, session_row.activity_id,
    session_row.id, participant_row.session_group_id, participant_row.id, capture_location_status,
    requested_location,
    case when capture_location_status = 'captured' then capture_accuracy_m else null end,
    capture_captured_at,
    case when capture_location_status = 'captured' then null else capture_unavailable_reason end
  )
  on conflict (observer_id, client_generated_id) do nothing
  returning id into inserted_id;

  perform set_config('app.observation_status_reason', '', true);

  if inserted_id is null then
    select * into existing_row
    from public.observations as candidate
    where candidate.observer_id = actor_profile.id
      and candidate.client_generated_id = target_client_generated_id;
    if existing_row.session_id = session_row.id
      and existing_row.location_status = capture_location_status
      and existing_row.capture_location::text is not distinct from requested_location::text then
      return query select 'existing'::text, null::text, null::jsonb, existing_row.id, existing_row.version;
    else
      return query select 'denied'::text, 'IDEMPOTENCY_KEY_REUSE'::text, null::jsonb, null::uuid, null::integer;
    end if;
    return;
  end if;

  insert into public.research_events (
    event_name, schema_version, actor_id, school_id, class_id, activity_id, session_id,
    group_id, observation_id, occurred_at, payload
  )
  values (
    'observation_started', 1, actor_profile.id, class_row.school_id, session_row.class_id,
    session_row.activity_id, session_row.id, session_group_row.group_id, inserted_id, now(),
    jsonb_build_object('location_status', capture_location_status, 'offline_at_start', false)
  );

  return query select 'created'::text, null::text, null::jsonb, inserted_id, 1;
end;
$$;

-- Draft edits (OBS-011, D-052) ------------------------------------------------------

create function public.update_observation_draft(
  target_observation_id uuid,
  expected_version integer,
  draft_common_name text,
  draft_scientific_name text,
  draft_evidence_note text
)
returns table(
  outcome text,
  error_code text,
  error_details jsonb,
  observation_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  denial record;
  next_common text := nullif(btrim(draft_common_name), '');
  next_scientific text := nullif(btrim(draft_scientific_name), '');
  next_note text := nullif(btrim(draft_evidence_note), '');
  updated_version integer;
begin
  actor_profile := private.require_active_verified_actor();

  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null or observation_row.observer_id <> actor_profile.id then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  -- Lock order: session, group, observation.
  perform 1 from public.exploration_sessions as candidate where candidate.id = observation_row.session_id for share;
  perform 1 from public.exploration_session_groups as candidate where candidate.id = observation_row.session_group_id for share;
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id for update;

  if not private.is_active_class_student(actor_profile.id, observation_row.class_id)
    or not exists (
      select 1 from public.session_participants as participant
      where participant.id = observation_row.session_participant_id
        and participant.participation_status = 'active'
    ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into denial from private.observation_edit_denial(observation_row.id);
  if denial.code is not null then
    return query select 'denied'::text, denial.code, jsonb_build_object('reason', denial.reason), observation_row.version;
    return;
  end if;

  if expected_version is null or expected_version < 1 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'expectedVersion'), observation_row.version;
    return;
  end if;

  if char_length(next_common) > 120 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'commonName'), observation_row.version;
    return;
  end if;
  if char_length(next_scientific) > 160 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'scientificName'), observation_row.version;
    return;
  end if;
  if char_length(next_note) > 1000 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'evidenceNote'), observation_row.version;
    return;
  end if;

  -- Retries and no-op writes never conflict.
  if (observation_row.student_common_name, observation_row.student_scientific_name, observation_row.student_evidence_note)
    is not distinct from (next_common, next_scientific, next_note) then
    return query select 'unchanged'::text, null::text, null::jsonb, observation_row.version;
    return;
  end if;

  update public.observations as observation
  set student_common_name = next_common,
      student_scientific_name = next_scientific,
      student_evidence_note = next_note,
      version = observation.version + 1
  where observation.id = observation_row.id
    and observation.version = expected_version
  returning observation.version into updated_version;

  if updated_version is null then
    return query select 'denied'::text, 'OBSERVATION_VERSION_CONFLICT'::text,
      jsonb_build_object(
        'currentVersion', observation_row.version,
        'observation', private.observation_owner_payload(observation_row.id)
      ),
      observation_row.version;
    return;
  end if;

  return query select 'updated'::text, null::text, null::jsonb, updated_version;
end;
$$;

-- Owner read models --------------------------------------------------------------------

create function public.get_observation_draft(target_observation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
begin
  actor_profile := private.require_active_verified_actor();

  if not exists (
    select 1 from public.observations as observation
    where observation.id = target_observation_id
      and observation.observer_id = actor_profile.id
      and private.is_active_class_student(actor_profile.id, observation.class_id)
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return private.observation_owner_payload(target_observation_id)
    || jsonb_build_object('refreshedAt', now());
end;
$$;

create function public.list_my_session_observations(target_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  denial record;
  total integer;
begin
  actor_profile := private.require_active_verified_actor();

  select * into session_row from public.exploration_sessions as candidate where candidate.id = target_session_id;
  if session_row.id is null
    or not exists (
      select 1 from public.session_participants as participant
      where participant.session_id = session_row.id and participant.user_id = actor_profile.id
    )
    or not private.is_active_class_student(actor_profile.id, session_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into denial from private.observation_start_denial(session_row.id, actor_profile.id);
  select count(*) into total
  from public.observations as observation
  where observation.session_id = session_row.id and observation.observer_id = actor_profile.id;

  return jsonb_build_object(
    'sessionId', session_row.id,
    'sessionStatus', session_row.status,
    'canStart', denial.code is null,
    'startBlockedCode', denial.code,
    'startBlockedReason', denial.reason,
    'items', coalesce((
      select jsonb_agg(private.observation_owner_payload(recent.id) order by recent.created_at desc, recent.id desc)
      from (
        select observation.id, observation.created_at
        from public.observations as observation
        where observation.session_id = session_row.id and observation.observer_id = actor_profile.id
        order by observation.created_at desc, observation.id desc
        limit 100
      ) as recent
    ), '[]'::jsonb),
    'hasMore', total > 100,
    'refreshedAt', now()
  );
end;
$$;

-- Grants ---------------------------------------------------------------------------------

revoke execute on function private.observation_start_denial(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.observation_edit_denial(uuid) from public, anon, authenticated;
revoke execute on function private.observation_owner_payload(uuid) from public, anon, authenticated;

revoke execute on function public.start_observation(uuid, uuid, text, double precision, double precision, double precision, timestamptz, text)
  from public, anon;
grant execute on function public.start_observation(uuid, uuid, text, double precision, double precision, double precision, timestamptz, text)
  to authenticated;
revoke execute on function public.update_observation_draft(uuid, integer, text, text, text) from public, anon;
grant execute on function public.update_observation_draft(uuid, integer, text, text, text) to authenticated;
revoke execute on function public.get_observation_draft(uuid) from public, anon;
grant execute on function public.get_observation_draft(uuid) to authenticated;
revoke execute on function public.list_my_session_observations(uuid) from public, anon;
grant execute on function public.list_my_session_observations(uuid) to authenticated;

comment on function public.start_observation(uuid, uuid, text, double precision, double precision, double precision, timestamptz, text) is
  'P8-02/P8-03: idempotent draft start against the participant snapshot and active group with immutable capture metadata.';
comment on function public.update_observation_draft(uuid, integer, text, text, text) is
  'P8-01: owner draft edit with optimistic version check; conflicts return the refreshed record.';

commit;
