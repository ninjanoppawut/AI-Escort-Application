begin;

-- P14-05A: the versioned research-event registry from
-- RESEARCH_EVENT_DICTIONARY.md section 3, enforced on every insert, and the
-- study-scoped pseudonymous export allowlist from section 5. Allowlists stay
-- empty and no study is approved until DEC-Q005 finalizes the research
-- variables, so nothing is exportable yet.

create table private.research_event_registry (
  event_name text not null,
  schema_version integer not null check (schema_version >= 1),
  payload_keys text[] not null,
  purpose text not null,
  registered_at timestamptz not null default now(),
  primary key (event_name, schema_version),
  constraint research_event_registry_name_check
    check (event_name ~ '^[a-z][a-z0-9_]{2,63}$')
);

comment on table private.research_event_registry is
  'Registered research events and the only payload keys each version may carry (RESEARCH_EVENT_DICTIONARY.md section 3). Change control: new rows, never repurposed keys.';

-- Client-origin events may add the bounded offline_delay_s (section 4).
insert into private.research_event_registry (event_name, schema_version, payload_keys, purpose)
values
  ('account_confirmed', 1, array['account_type'], 'onboarding reliability'),
  ('teacher_invitation_consumed', 1, array['school_id', 'invite_age_s'], 'provisioning audit'),
  ('class_created', 1, array['minimum_group_size', 'maximum_group_size', 'maximum_groups', 'allow_student_groups', 'formation_status'], 'class setup'),
  ('class_group_settings_updated', 1, array['minimum_group_size', 'maximum_group_size', 'maximum_groups', 'allow_student_groups', 'formation_status'], 'group-formation setup'),
  ('class_invitation_issued', 1, array['has_expiry', 'has_max_uses'], 'invitation setup'),
  ('class_invitation_disabled', 1, array['used_count'], 'invitation lifecycle'),
  ('class_invitation_rotated', 1, array['previous_used_count', 'has_expiry', 'has_max_uses'], 'invitation lifecycle'),
  ('class_joined', 1, array['invite_channel', 'attempt_count'], 'onboarding flow'),
  ('group_created', 1, array['creator_type', 'remaining_slots'], 'group formation'),
  ('group_creation_failed', 1, array['error_code'], 'flow diagnosis'),
  ('group_invitation_sent', 1, array['group_member_count'], 'collaboration'),
  ('group_invitation_accepted', 1, array['invite_age_s', 'group_member_count'], 'collaboration'),
  ('group_invitation_declined', 1, array['invite_age_s'], 'collaboration'),
  ('group_leader_changed', 1, array['reason_category'], 'group history'),
  ('student_moved_between_groups', 1, array['leader_changed', 'reason_category'], 'teacher management'),
  ('group_locked', 1, array['member_count'], 'readiness'),
  ('group_deleted', 1, array['member_count', 'had_pending_invites'], 'lifecycle'),
  ('group_archived', 1, array['session_count'], 'lifecycle'),
  ('session_opened', 1, array['participant_count', 'group_count', 'activity_version'], 'field setup'),
  ('session_group_activated', 1, array['queue_position', 'wait_duration_s'], 'session flow'),
  ('session_group_paused', 1, array['reason_category'], 'session flow'),
  ('session_group_completed', 1, array['active_duration_s'], 'session flow'),
  ('observation_started', 1, array['location_status', 'offline_at_start', 'offline_delay_s'], 'field workflow'),
  ('photo_captured', 1, array['category', 'processed_bytes', 'width', 'height', 'offline_delay_s'], 'media workflow'),
  ('image_uploaded', 1, array['category', 'processed_bytes', 'attempt_count'], 'upload reliability'),
  ('ai_analysis_queued', 1, array['prompt_version', 'schema_version', 'image_count'], 'AI workflow'),
  ('ai_analysis_completed', 1, array['provider_category', 'model_version', 'latency_ms', 'candidate_count', 'needs_more_evidence'], 'AI evaluation'),
  ('ai_analysis_failed', 1, array['failure_category', 'attempt_count', 'manual_entry_available'], 'AI reliability'),
  ('student_reviewed_ai_result', 1, array['candidate_selected', 'trait_count'], 'learning interaction'),
  ('student_corrected_ai_trait', 1, array['trait_key', 'from_state', 'to_state'], 'AI/student comparison'),
  ('manual_entry_used', 1, array['analysis_state', 'reason_category'], 'degraded behavior'),
  ('same_species_warning_shown', 1, array['candidate_count'], 'duplicate-awareness flow'),
  ('observation_submitted', 1, array['submission_version', 'same_species_acknowledged', 'image_count'], 'student completion'),
  ('teacher_requested_revision', 1, array['topic_keys', 'submission_version'], 'review workflow'),
  ('revision_unlock_requested', 1, array['topic_keys'], 'revision workflow'),
  ('observation_resubmitted', 1, array['submission_version', 'changed_topic_keys'], 'revision workflow'),
  ('teacher_verified', 1, array['corrected_identity', 'submission_version'], 'review outcome'),
  ('teacher_review_completed', 1, array['decision', 'review_duration_s', 'submission_version'], 'review outcome'),
  ('observation_issue_reported', 1, array['report_type'], 'quality/safety'),
  ('session_completed', 1, array['duration_s', 'participant_count', 'observation_count'], 'activity outcome'),
  ('map_marker_opened', 1, array['viewer_role', 'observation_status'], 'result engagement'),
  ('export_requested', 1, array['export_type', 'filter_count'], 'reporting'),
  ('export_completed', 1, array['export_type', 'row_count', 'duration_ms'], 'reporting reliability'),
  ('admin_incident_acknowledged', 1, array['severity', 'flow'], 'operations audit');

-- Deployment-local switches. Only seed.sql (local and CI) writes rows here.
create table private.runtime_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  value text not null
);
alter table private.runtime_flags enable row level security;
revoke all on table private.runtime_flags from public, anon, authenticated;

-- Every insert is checked against the registry. A producer drift is a code
-- defect: local and CI databases (seed.sql sets research_events_strict)
-- raise so tests fail; elsewhere the row is kept with only registered keys,
-- because a research write must never undo a committed product mutation
-- (dictionary section 4) and unregistered fields must never be stored.
create function private.enforce_research_event_registry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[];
  unknown_keys text[];
  strict_mode boolean := exists (
    select 1
    from private.runtime_flags as flag
    where flag.key = 'research_events_strict' and flag.value = 'on'
  );
begin
  select registry.payload_keys
  into allowed
  from private.research_event_registry as registry
  where registry.event_name = new.event_name
    and registry.schema_version = new.schema_version;

  if jsonb_typeof(new.payload) <> 'object' then
    if strict_mode then
      raise exception 'research event % payload must be an object', new.event_name
        using errcode = '22023';
    end if;
    new.payload := '{}'::jsonb;
  end if;

  if allowed is null then
    if strict_mode then
      raise exception 'research event %.v% is not registered', new.event_name, new.schema_version
        using errcode = '22023';
    end if;
    new.payload := '{}'::jsonb;
    return new;
  end if;

  select coalesce(array_agg(payload_key order by payload_key), array[]::text[])
  into unknown_keys
  from jsonb_object_keys(new.payload) as payload_key
  where payload_key <> all (allowed);

  if cardinality(unknown_keys) > 0 then
    if strict_mode then
      raise exception 'research event %.v% has unregistered payload keys %',
        new.event_name, new.schema_version, unknown_keys
        using errcode = '22023';
    end if;
    new.payload := new.payload - unknown_keys;
  end if;
  return new;
end;
$$;

create trigger research_events_registry_check
before insert on public.research_events
for each row execute function private.enforce_research_event_registry();

revoke all on function private.enforce_research_event_registry() from public, anon, authenticated;

-- Section 5: a study owns its own pepper, so subject IDs from two studies
-- cannot be joined without the controlled mapping (the peppers). A study is
-- exportable only once approved against a recorded protocol reference.
create table private.research_studies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  pepper bytea not null default extensions.gen_random_bytes(32),
  status text not null default 'draft' check (status in ('draft', 'approved', 'closed')),
  protocol_reference text,
  starts_on date,
  ends_on date,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint research_studies_approval_check check (
    status = 'draft'
    or (protocol_reference is not null and btrim(protocol_reference) <> '' and approved_at is not null)
  ),
  constraint research_studies_range_check check (
    starts_on is null or ends_on is null or starts_on <= ends_on
  ),
  constraint research_studies_pepper_check check (octet_length(pepper) >= 32)
);

comment on table private.research_studies is
  'Approved research studies (DEC-Q005). The pepper never leaves the database; export returns only derived study subject IDs.';

create table private.research_export_allowlist (
  study_id uuid not null references private.research_studies (id) on delete cascade,
  event_name text not null,
  schema_version integer not null,
  payload_keys text[] not null default array[]::text[],
  primary key (study_id, event_name, schema_version),
  foreign key (event_name, schema_version)
    references private.research_event_registry (event_name, schema_version)
);

comment on table private.research_export_allowlist is
  'Per-study allowlist of events and payload keys; a key must also be registered for the event version.';

create function private.research_allowlist_keys_registered()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  registered text[];
begin
  select registry.payload_keys
  into registered
  from private.research_event_registry as registry
  where registry.event_name = new.event_name
    and registry.schema_version = new.schema_version;
  if not (new.payload_keys <@ registered) then
    raise exception 'allowlisted keys must be registered for %.v%', new.event_name, new.schema_version
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger research_export_allowlist_keys_check
before insert or update on private.research_export_allowlist
for each row execute function private.research_allowlist_keys_registered();

revoke all on function private.research_allowlist_keys_registered() from public, anon, authenticated;

create function private.study_pseudonym(target_study_id uuid, kind text, subject_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when subject_id is null then null
    else encode(
      extensions.hmac(convert_to(kind || ':' || subject_id::text, 'UTF8'), study.pepper, 'sha256'::text),
      'hex'
    )
  end
  from private.research_studies as study
  where study.id = target_study_id;
$$;

revoke all on function private.study_pseudonym(uuid, text, uuid) from public, anon, authenticated;

-- Pseudonymous rows for one approved study (section 5 default fields):
-- subject and class/session pseudonyms, event, version, day-coarsened time,
-- seconds since study start, and only allowlisted payload keys. No raw IDs,
-- request/trace IDs, emails, names, coordinates, or free text.
create function private.research_export_rows(target_study_id uuid)
returns table (
  study_subject_id text,
  class_pseudonym text,
  session_pseudonym text,
  event_name text,
  schema_version integer,
  occurred_on date,
  study_offset_s bigint,
  payload jsonb
)
language plpgsql
stable
set search_path = ''
as $$
declare
  study private.research_studies%rowtype;
begin
  select * into study from private.research_studies where id = target_study_id;
  if not found or study.status <> 'approved' then
    raise exception 'study is not approved for export' using errcode = '42501';
  end if;

  return query
  select
    private.study_pseudonym(study.id, 'subject', event.actor_id),
    private.study_pseudonym(study.id, 'class', event.class_id),
    private.study_pseudonym(study.id, 'session', event.session_id),
    event.event_name,
    event.schema_version,
    (event.occurred_at at time zone 'Asia/Bangkok')::date,
    case
      when study.starts_on is null then null
      else floor(extract(epoch from event.occurred_at - (study.starts_on::timestamp at time zone 'Asia/Bangkok')))::bigint
    end,
    coalesce(
      (
        select jsonb_object_agg(item.key, item.value)
        from jsonb_each(event.payload) as item
        where item.key = any (allow.payload_keys)
      ),
      '{}'::jsonb
    )
  from public.research_events as event
  join private.research_export_allowlist as allow
    on allow.study_id = study.id
   and allow.event_name = event.event_name
   and allow.schema_version = event.schema_version
  where (study.starts_on is null
      or event.occurred_at >= (study.starts_on::timestamp at time zone 'Asia/Bangkok'))
    and (study.ends_on is null
      or event.occurred_at < ((study.ends_on + 1)::timestamp at time zone 'Asia/Bangkok'))
  order by event.occurred_at, event.id;
end;
$$;

revoke all on function private.research_export_rows(uuid) from public, anon, authenticated;

alter table private.research_event_registry enable row level security;
alter table private.research_studies enable row level security;
alter table private.research_export_allowlist enable row level security;
revoke all on table private.research_event_registry from public, anon, authenticated;
revoke all on table private.research_studies from public, anon, authenticated;
revoke all on table private.research_export_allowlist from public, anon, authenticated;

commit;
