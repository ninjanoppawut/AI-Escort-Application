begin;

-- P11-02 to P11-04: manual student review, immutable submission, and the
-- same-species warning that never blocks (REV-001 to REV-006). Lock order:
-- session share, group share, observation update, then the same-species
-- advisory lock last.

-- Readiness ---------------------------------------------------------------------------

-- Ordered content blockers shared by the review read model and submit.
create function private.observation_submit_blockers(target_observation_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
  blockers text[] := array[]::text[];
begin
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;

  if observation_row.status = 'draft' or observation_row.identity_source is null then
    blockers := array_append(blockers, 'student_review');
  end if;
  if private.is_unknown_plant_name(observation_row.student_common_name) then
    blockers := array_append(blockers, 'common_name');
  end if;
  if private.is_unknown_plant_name(observation_row.student_scientific_name) then
    blockers := array_append(blockers, 'scientific_name');
  end if;
  if observation_row.student_evidence_note is null
    or char_length(btrim(observation_row.student_evidence_note)) < private.observation_evidence_note_min_chars() then
    blockers := array_append(blockers, 'evidence_note');
  end if;
  if exists (
    select 1 from public.observation_media as media
    where media.observation_id = observation_row.id and media.status = 'pending'
  ) then
    blockers := array_append(blockers, 'pending_images');
  end if;
  if not exists (
    select 1 from public.observation_media as media
    where media.observation_id = observation_row.id and media.status = 'uploaded' and media.category = 'whole_plant'
  ) then
    blockers := array_append(blockers, 'whole_plant_image');
  end if;

  return blockers;
end;
$$;

-- Same-species candidates: other submitted observations in the same session
-- with the same taxon key (including the student's own earlier records).
-- A possible same specimen additionally needs two captured locations within
-- max(15, min(accuracy sum, 50)) metres (specimen-candidate-v1).
create function private.find_same_species_candidates(target_observation_id uuid, taxon_key text)
returns table(
  candidate_observation_id uuid,
  distance_m numeric,
  time_gap_seconds integer,
  possible_same_specimen boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    other.id,
    case
      when self.location_status = 'captured' and other.location_status = 'captured'
        then round(extensions.st_distance(self.capture_location, other.capture_location)::numeric, 1)
      else null
    end,
    abs(extract(epoch from self.captured_at - other.captured_at))::integer,
    self.location_status = 'captured' and other.location_status = 'captured'
      and extensions.st_distance(self.capture_location, other.capture_location)
        <= greatest(15, least(self.capture_accuracy_m + other.capture_accuracy_m, 50))
  from public.observations as self
  join public.observations as other
    on other.session_id = self.session_id
   and other.id <> self.id
   and other.first_submitted_at is not null
   and other.normalized_taxon_key = taxon_key
  where self.id = target_observation_id
    and taxon_key is not null
  order by other.first_submitted_at, other.id;
$$;

create function private.notify_class_teachers(
  target_class_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  target_observation_id uuid,
  target_session_id uuid,
  target_activity_id uuid,
  target_group_id uuid,
  notification_actor_id uuid,
  notification_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  notified integer;
begin
  insert into public.notifications (
    recipient_id, type, title, message, entity_type, entity_id, payload,
    class_id, session_id, activity_id, group_id, observation_id, actor_id
  )
  select
    membership.user_id, notification_type, notification_title, notification_message,
    'observation', target_observation_id, notification_payload,
    target_class_id, target_session_id, target_activity_id, target_group_id, target_observation_id,
    notification_actor_id
  from public.class_members as membership
  where membership.class_id = target_class_id
    and membership.role = 'teacher'
    and membership.status = 'active'
    and private.is_active_class_teacher(membership.user_id, target_class_id);

  get diagnostics notified = row_count;
  return notified;
end;
$$;

-- Owner checks shared by the review operations (lock order: session, group, observation).
create function private.lock_owned_observation_for_review(target_observation_id uuid, actor_id uuid)
returns public.observations
language plpgsql
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
begin
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null or observation_row.observer_id <> actor_id then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1 from public.exploration_sessions as candidate where candidate.id = observation_row.session_id for share;
  perform 1 from public.exploration_session_groups as candidate where candidate.id = observation_row.session_group_id for share;
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id for update;

  if not private.is_active_class_student(actor_id, observation_row.class_id)
    or not exists (
      select 1 from public.session_participants as participant
      where participant.id = observation_row.session_participant_id
        and participant.participation_status = 'active'
    ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return observation_row;
end;
$$;

-- Owner review read model --------------------------------------------------------------

create function private.observation_review_payload(target_observation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'observationId', observation.id,
    'status', observation.status,
    'version', observation.version,
    'identitySource', observation.identity_source,
    'referenceNote', observation.student_reference_note,
    'analysis', jsonb_build_object('state', 'unavailable'),
    'traits', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'traitKey', trait.trait_key,
          'status', trait.student_status,
          'value', trait.student_value #>> '{}',
          'note', trait.note
        )
        order by trait.position
      )
      from public.student_trait_verifications as trait
      where trait.observation_id = observation.id and trait.trait_source = 'manual'
    ), '[]'::jsonb),
    'readiness', jsonb_build_object(
      'blockers', to_jsonb(private.observation_submit_blockers(observation.id)),
      'evidenceNoteMinChars', private.observation_evidence_note_min_chars()
    ),
    'sameSpecies', jsonb_build_object(
      'inSession', observation.same_species_in_session,
      'count', observation.same_species_count
    ),
    'submission', (
      select jsonb_build_object(
        'id', submission.id,
        'submissionNumber', submission.submission_number,
        'submittedAt', submission.submitted_at,
        'commonName', submission.common_name,
        'scientificName', submission.scientific_name,
        'evidenceNote', submission.evidence_note,
        'imageCount', jsonb_array_length(submission.media_snapshot),
        'sameSpeciesCount', submission.same_species_count,
        'sameSpeciesAcknowledged', submission.same_species_acknowledged
      )
      from public.observation_submissions as submission
      where submission.observation_id = observation.id
      order by submission.submission_number desc
      limit 1
    )
  )
  from public.observations as observation
  where observation.id = target_observation_id;
$$;

create function public.get_observation_review_state(target_observation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  edit_denial record;
  start_denial record;
  payload jsonb;
begin
  actor_profile := private.require_active_verified_actor();

  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null
    or observation_row.observer_id <> actor_profile.id
    or not private.is_active_class_student(actor_profile.id, observation_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into edit_denial from private.observation_edit_denial(observation_row.id);
  select * into start_denial from private.observation_start_denial(observation_row.session_id, actor_profile.id);
  payload := private.observation_review_payload(observation_row.id);

  return payload || jsonb_build_object(
    'permissions', jsonb_build_object(
      'canEdit', edit_denial.code is null,
      'canSubmit', edit_denial.code is null and start_denial.code is null
        and jsonb_array_length(payload #> '{readiness,blockers}') = 0,
      'submitBlockedCode', coalesce(edit_denial.code, start_denial.code),
      'submitBlockedReason', coalesce(edit_denial.reason, start_denial.reason)
    ),
    'refreshedAt', now()
  );
end;
$$;

-- Save the manual review ------------------------------------------------------------------

create function public.save_student_review(
  target_observation_id uuid,
  expected_version integer,
  review_identity_source text,
  review_common_name text,
  review_scientific_name text,
  review_evidence_note text,
  review_reference_note text,
  review_traits jsonb
)
returns table(
  outcome text,
  error_code text,
  error_details jsonb,
  observation_version integer,
  observation_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  denial record;
  next_common text := nullif(btrim(review_common_name), '');
  next_scientific text := nullif(btrim(review_scientific_name), '');
  next_note text := nullif(btrim(review_evidence_note), '');
  next_reference text := nullif(btrim(review_reference_note), '');
  traits jsonb := coalesce(review_traits, '[]'::jsonb);
  trait jsonb;
  current_traits jsonb;
  requested_traits jsonb;
  updated_version integer;
  first_save boolean;
  class_row public.classes%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
  trait_position integer := 0;
begin
  actor_profile := private.require_active_verified_actor();
  observation_row := private.lock_owned_observation_for_review(target_observation_id, actor_profile.id);

  select * into denial from private.observation_edit_denial(observation_row.id);
  if denial.code is not null then
    return query select 'denied'::text, denial.code, jsonb_build_object('reason', denial.reason),
      observation_row.version, observation_row.status;
    return;
  end if;

  if review_identity_source is distinct from 'manual' then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'identitySource'),
      observation_row.version, observation_row.status;
    return;
  end if;
  if expected_version is null or expected_version < 1 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'expectedVersion'),
      observation_row.version, observation_row.status;
    return;
  end if;
  if char_length(next_common) > 120 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'commonName'),
      observation_row.version, observation_row.status;
    return;
  end if;
  if char_length(next_scientific) > 160 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'scientificName'),
      observation_row.version, observation_row.status;
    return;
  end if;
  if char_length(next_note) > 1000 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'evidenceNote'),
      observation_row.version, observation_row.status;
    return;
  end if;
  if char_length(next_reference) > 300 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'referenceNote'),
      observation_row.version, observation_row.status;
    return;
  end if;

  -- Traits: at most 40 unique manual rows, each an observed value or unsure/not_visible.
  if jsonb_typeof(traits) <> 'array' or jsonb_array_length(traits) > 40
    or (select count(distinct item ->> 'traitKey') from jsonb_array_elements(traits) as item) <> jsonb_array_length(traits) then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'traits'),
      observation_row.version, observation_row.status;
    return;
  end if;
  for trait in select * from jsonb_array_elements(traits) loop
    if jsonb_typeof(trait) <> 'object'
      or coalesce(trait ->> 'traitKey', '') !~ '^[a-z][a-z0-9_]{0,63}$'
      or (trait ? 'note' and trait ->> 'note' is not null and char_length(trait ->> 'note') not between 1 and 300)
      or not (
        (trait ->> 'status' is null and char_length(coalesce(trait ->> 'value', '')) between 1 and 120)
        or (trait ->> 'status' in ('unsure', 'not_visible') and trait ->> 'value' is null)
      ) then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'traits'),
        observation_row.version, observation_row.status;
      return;
    end if;
  end loop;

  select coalesce(jsonb_agg(
    jsonb_build_object('traitKey', item.trait_key, 'status', item.student_status,
      'value', item.student_value #>> '{}', 'note', item.note)
    order by item.position
  ), '[]'::jsonb)
  into current_traits
  from public.student_trait_verifications as item
  where item.observation_id = observation_row.id and item.trait_source = 'manual';

  select coalesce(jsonb_agg(
    jsonb_build_object('traitKey', item ->> 'traitKey', 'status', item ->> 'status',
      'value', item ->> 'value', 'note', nullif(item ->> 'note', ''))
    order by ordinality
  ), '[]'::jsonb)
  into requested_traits
  from jsonb_array_elements(traits) with ordinality as elements(item, ordinality);

  first_save := observation_row.identity_source is null;

  -- Retries and identical saves never conflict.
  if not first_save
    and (observation_row.student_common_name, observation_row.student_scientific_name,
         observation_row.student_evidence_note, observation_row.student_reference_note)
      is not distinct from (next_common, next_scientific, next_note, next_reference)
    and current_traits = requested_traits then
    return query select 'unchanged'::text, null::text, null::jsonb, observation_row.version, observation_row.status;
    return;
  end if;

  if expected_version <> observation_row.version then
    return query select 'denied'::text, 'OBSERVATION_VERSION_CONFLICT'::text,
      jsonb_build_object(
        'currentVersion', observation_row.version,
        'observation', private.observation_owner_payload(observation_row.id)
      ),
      observation_row.version, observation_row.status;
    return;
  end if;

  if first_save then
    perform set_config('app.observation_status_reason', 'manual_entry_started', true);
  end if;

  update public.observations as observation
  set student_common_name = next_common,
      student_scientific_name = next_scientific,
      student_evidence_note = next_note,
      student_reference_note = next_reference,
      identity_source = 'manual',
      status = case when observation.status = 'draft' then 'student_review' else observation.status end,
      version = observation.version + 1
  where observation.id = observation_row.id
  returning observation.version into updated_version;

  perform set_config('app.observation_status_reason', '', true);

  delete from public.student_trait_verifications as item
  where item.observation_id = observation_row.id and item.trait_source = 'manual';

  for trait in select * from jsonb_array_elements(traits) loop
    trait_position := trait_position + 1;
    insert into public.student_trait_verifications (
      observation_id, observer_id, class_id, session_id, trait_key, trait_source,
      student_status, student_value, note, position
    )
    values (
      observation_row.id, observation_row.observer_id, observation_row.class_id, observation_row.session_id,
      trait ->> 'traitKey', 'manual', trait ->> 'status',
      case when trait ->> 'value' is null then null else to_jsonb(trait ->> 'value') end,
      nullif(trait ->> 'note', ''), trait_position
    );
  end loop;

  if first_save then
    select * into class_row from public.classes as class where class.id = observation_row.class_id;
    select * into session_group_row
    from public.exploration_session_groups as session_group
    where session_group.id = observation_row.session_group_id;
    insert into public.research_events (
      event_name, schema_version, actor_id, school_id, class_id, activity_id, session_id,
      group_id, observation_id, occurred_at, payload
    )
    values (
      'manual_entry_used', 1, actor_profile.id, class_row.school_id, observation_row.class_id,
      observation_row.activity_id, observation_row.session_id, session_group_row.group_id,
      observation_row.id, now(),
      jsonb_build_object('analysis_state', 'unavailable', 'reason_category', 'ai_unavailable')
    );
  end if;

  return query select 'updated'::text, null::text, null::jsonb, updated_version, 'student_review'::text;
end;
$$;

-- Submit -------------------------------------------------------------------------------------

create function public.submit_observation(
  target_observation_id uuid,
  target_client_submission_id uuid,
  expected_version integer,
  acknowledge_same_species boolean
)
returns table(
  outcome text,
  error_code text,
  error_details jsonb,
  submission_id uuid,
  submission_number integer,
  observation_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  existing_submission public.observation_submissions%rowtype;
  start_denial record;
  blockers text[];
  taxon_key text;
  candidate record;
  same_count integer := 0;
  specimen_count integer := 0;
  new_submission_id uuid;
  new_version integer;
  class_row public.classes%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
  media_snapshot jsonb;
  new_candidate_id uuid;
  observer_name text;
begin
  actor_profile := private.require_active_verified_actor();

  if target_client_submission_id is null or expected_version is null then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text,
      jsonb_build_object('field', case when target_client_submission_id is null then 'clientSubmissionId' else 'expectedVersion' end),
      null::uuid, null::integer, null::integer;
    return;
  end if;

  observation_row := private.lock_owned_observation_for_review(target_observation_id, actor_profile.id);

  -- Idempotent replay after the observation lock, so concurrent duplicates serialize.
  select * into existing_submission
  from public.observation_submissions as submission
  where submission.observer_id = actor_profile.id
    and submission.client_submission_id = target_client_submission_id;
  if existing_submission.id is not null then
    if existing_submission.observation_id = observation_row.id then
      return query select 'existing'::text, null::text, null::jsonb, existing_submission.id,
        existing_submission.submission_number, existing_submission.observation_version;
    else
      return query select 'denied'::text, 'IDEMPOTENCY_KEY_REUSE'::text, null::jsonb,
        null::uuid, null::integer, null::integer;
    end if;
    return;
  end if;

  if observation_row.status not in ('draft', 'student_review') then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
      jsonb_build_object('reason', 'already_submitted'), null::uuid, null::integer, observation_row.version;
    return;
  end if;

  select * into start_denial from private.observation_start_denial(observation_row.session_id, actor_profile.id);
  if start_denial.code is not null then
    return query select 'denied'::text, start_denial.code,
      case when start_denial.reason is null then null else jsonb_build_object('reason', start_denial.reason) end,
      null::uuid, null::integer, observation_row.version;
    return;
  end if;

  if expected_version <> observation_row.version then
    return query select 'denied'::text, 'OBSERVATION_VERSION_CONFLICT'::text,
      jsonb_build_object(
        'currentVersion', observation_row.version,
        'observation', private.observation_owner_payload(observation_row.id)
      ),
      null::uuid, null::integer, observation_row.version;
    return;
  end if;

  blockers := private.observation_submit_blockers(observation_row.id);
  if array_length(blockers, 1) is not null then
    return query select 'denied'::text,
      case blockers[1]
        when 'student_review' then 'STUDENT_REVIEW_REQUIRED'
        when 'common_name' then 'PLANT_NAME_REQUIRED'
        when 'scientific_name' then 'SCIENTIFIC_NAME_REQUIRED'
        when 'pending_images' then 'IMAGE_UPLOAD_INCOMPLETE'
        else 'VALIDATION_FAILED'
      end,
      jsonb_build_object(
        'blockers', to_jsonb(blockers),
        'reason', case blockers[1]
          when 'common_name' then case when observation_row.student_common_name is null then 'missing' else 'unknown_not_accepted' end
          when 'scientific_name' then case when observation_row.student_scientific_name is null then 'missing' else 'unknown_not_accepted' end
          when 'evidence_note' then case when observation_row.student_evidence_note is null then 'required' else 'too_short' end
          when 'pending_images' then 'pending'
          else null
        end,
        'fields', case blockers[1]
          when 'evidence_note' then jsonb_build_array('evidenceNote')
          when 'whole_plant_image' then jsonb_build_array('wholePlantImage')
          else '[]'::jsonb
        end,
        'minChars', private.observation_evidence_note_min_chars()
      ),
      null::uuid, null::integer, observation_row.version;
    return;
  end if;

  taxon_key := private.observation_taxon_key_v1(observation_row.student_scientific_name);
  if taxon_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('same_species:' || observation_row.session_id::text || ':' || taxon_key, 0)
    );
  end if;

  select count(*), count(*) filter (where candidates.possible_same_specimen)
  into same_count, specimen_count
  from private.find_same_species_candidates(observation_row.id, taxon_key) as candidates;

  select * into class_row from public.classes as class where class.id = observation_row.class_id;
  select * into session_group_row
  from public.exploration_session_groups as session_group
  where session_group.id = observation_row.session_group_id;

  -- The warning never blocks: it asks for one acknowledgement, then submits.
  if same_count > 0 and not coalesce(acknowledge_same_species, false) then
    if not exists (
      select 1 from public.research_events as event
      where event.observation_id = observation_row.id
        and event.event_name = 'same_species_warning_shown'
        and event.occurred_at >= observation_row.updated_at
    ) then
      insert into public.research_events (
        event_name, schema_version, actor_id, school_id, class_id, activity_id, session_id,
        group_id, observation_id, occurred_at, payload
      )
      values (
        'same_species_warning_shown', 1, actor_profile.id, class_row.school_id, observation_row.class_id,
        observation_row.activity_id, observation_row.session_id, session_group_row.group_id,
        observation_row.id, now(), jsonb_build_object('candidate_count', same_count)
      );
    end if;
    return query select 'denied'::text, 'SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED'::text,
      jsonb_build_object('sameSpeciesCount', same_count, 'possibleSameSpecimenCount', specimen_count),
      null::uuid, null::integer, observation_row.version;
    return;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'mediaId', media.id, 'position', media.position, 'category', media.category,
      'mimeType', media.mime_type, 'byteSize', media.byte_size, 'width', media.width_px,
      'height', media.height_px, 'sha256', media.image_hash, 'capturedAt', media.captured_at,
      'uploadedAt', media.uploaded_at, 'preprocessingVersion', media.preprocessing_version
    )
    order by media.position
  )
  into media_snapshot
  from public.observation_media as media
  where media.observation_id = observation_row.id and media.status = 'uploaded';

  new_version := observation_row.version + 1;

  insert into public.observation_submissions (
    observation_id, observer_id, class_id, session_id, submission_number, client_submission_id,
    submission_kind, based_on_version, observation_version, common_name, scientific_name,
    evidence_note, reference_note, identity_source, taxon_key, verification_snapshot,
    media_snapshot, capture_snapshot, same_species_count, same_species_acknowledged,
    possible_same_specimen_count, submitted_by
  )
  values (
    observation_row.id, observation_row.observer_id, observation_row.class_id, observation_row.session_id,
    observation_row.submission_count + 1, target_client_submission_id, 'initial', observation_row.version,
    new_version, observation_row.student_common_name, observation_row.student_scientific_name,
    observation_row.student_evidence_note, observation_row.student_reference_note,
    observation_row.identity_source, taxon_key,
    jsonb_build_object(
      'schemaVersion', 'student-review-v1',
      'identitySource', observation_row.identity_source,
      'analysis', jsonb_build_object('state', 'unavailable'),
      'referenceNote', observation_row.student_reference_note,
      'traits', private.observation_review_payload(observation_row.id) -> 'traits'
    ),
    media_snapshot,
    jsonb_build_object(
      'locationStatus', observation_row.location_status,
      'accuracyM', observation_row.capture_accuracy_m,
      'capturedAt', observation_row.captured_at,
      'unavailableReason', observation_row.location_unavailable_reason
    ),
    same_count, same_count > 0, specimen_count, actor_profile.id
  )
  returning id into new_submission_id;

  insert into public.observation_submission_media (submission_id, media_id, observation_id, position, category)
  select new_submission_id, media.id, media.observation_id, media.position, media.category
  from public.observation_media as media
  where media.observation_id = observation_row.id and media.status = 'uploaded';

  for candidate in
    select * from private.find_same_species_candidates(observation_row.id, taxon_key)
  loop
    insert into public.observation_duplicate_candidates (
      observation_id, candidate_observation_id, session_id, class_id, relationship_type,
      location_distance_m, temporal_distance_seconds, system_recommendation,
      student_acknowledged_at, source_submission_id, rule_version
    )
    values (
      observation_row.id, candidate.candidate_observation_id, observation_row.session_id, observation_row.class_id,
      'same_species', candidate.distance_m, candidate.time_gap_seconds, null, now(),
      new_submission_id, 'taxon-key-v1'
    )
    on conflict (pair_low, pair_high, relationship_type) do nothing
    returning id into new_candidate_id;
    if new_candidate_id is not null then
      insert into public.observation_relation_events (candidate_id, class_id, session_id, event_type, actor_id)
      values (new_candidate_id, observation_row.class_id, observation_row.session_id, 'candidate_created', actor_profile.id);
    end if;

    if candidate.possible_same_specimen then
      new_candidate_id := null;
      insert into public.observation_duplicate_candidates (
        observation_id, candidate_observation_id, session_id, class_id, relationship_type,
        location_distance_m, temporal_distance_seconds, system_recommendation,
        student_acknowledged_at, source_submission_id, rule_version
      )
      values (
        observation_row.id, candidate.candidate_observation_id, observation_row.session_id, observation_row.class_id,
        'possible_same_specimen', candidate.distance_m, candidate.time_gap_seconds,
        'review_possible_same_specimen', now(), new_submission_id, 'specimen-candidate-v1'
      )
      on conflict (pair_low, pair_high, relationship_type) do nothing
      returning id into new_candidate_id;
      if new_candidate_id is not null then
        insert into public.observation_relation_events (candidate_id, class_id, session_id, event_type, actor_id)
        values (new_candidate_id, observation_row.class_id, observation_row.session_id, 'candidate_created', actor_profile.id);
      end if;
    end if;
  end loop;

  perform set_config('app.observation_status_reason', 'observation_submitted', true);
  update public.observations as observation
  set status = 'submitted',
      version = new_version,
      first_submitted_at = coalesce(observation.first_submitted_at, now()),
      latest_submitted_at = now(),
      submission_count = observation.submission_count + 1,
      normalized_taxon_key = taxon_key,
      same_species_in_session = same_count > 0,
      same_species_count = same_count
  where observation.id = observation_row.id;
  perform set_config('app.observation_status_reason', '', true);

  insert into public.research_events (
    event_name, schema_version, actor_id, school_id, class_id, activity_id, session_id,
    group_id, observation_id, occurred_at, payload
  )
  values (
    'observation_submitted', 1, actor_profile.id, class_row.school_id, observation_row.class_id,
    observation_row.activity_id, observation_row.session_id, session_group_row.group_id,
    observation_row.id, now(),
    jsonb_build_object(
      'submission_version', observation_row.submission_count + 1,
      'same_species_acknowledged', same_count > 0,
      'image_count', jsonb_array_length(media_snapshot)
    )
  );

  select profile.display_name into observer_name from public.profiles as profile where profile.id = actor_profile.id;

  perform private.notify_class_teachers(
    observation_row.class_id, 'observation_submitted', 'มีรายการพืชใหม่',
    coalesce(nullif(btrim(observer_name), ''), 'นักเรียน') || ' ส่งรายการพืชใหม่',
    observation_row.id, observation_row.session_id, observation_row.activity_id, session_group_row.group_id,
    actor_profile.id,
    jsonb_build_object('observationId', observation_row.id, 'submissionNumber', observation_row.submission_count + 1)
  );

  if same_count > 0 then
    perform private.notify_class_teachers(
      observation_row.class_id, 'same_species_warning', 'พบพืชชนิดเดียวกันซ้ำ',
      'พบการส่งพืชชนิดเดียวกันซ้ำในกิจกรรม',
      observation_row.id, observation_row.session_id, observation_row.activity_id, session_group_row.group_id,
      actor_profile.id,
      jsonb_build_object('observationId', observation_row.id, 'sameSpeciesCount', same_count)
    );
  end if;

  return query select 'submitted'::text, null::text, null::jsonb, new_submission_id,
    observation_row.submission_count + 1, new_version;
end;
$$;

-- Related records: the owner sees counts only; teachers see the list (P11-05 file).
create function public.get_observation_related(target_observation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  taxon_key text;
  same_count integer;
  specimen_count integer;
begin
  actor_profile := private.require_active_verified_actor();
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;

  if observation_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if observation_row.observer_id = actor_profile.id
    and private.is_active_class_student(actor_profile.id, observation_row.class_id) then
    if observation_row.first_submitted_at is not null then
      select count(*) filter (where candidate.relationship_type = 'same_species'),
             count(*) filter (where candidate.relationship_type = 'possible_same_specimen')
      into same_count, specimen_count
      from public.observation_duplicate_candidates as candidate
      where candidate.observation_id = observation_row.id or candidate.candidate_observation_id = observation_row.id;
      return jsonb_build_object(
        'basis', 'submitted', 'sameSpeciesInSession', observation_row.same_species_in_session,
        'sameSpeciesCount', observation_row.same_species_count, 'possibleSameSpecimenCount', specimen_count,
        'visibility', 'restricted', 'refreshedAt', now()
      );
    end if;

    taxon_key := private.observation_taxon_key_v1(observation_row.student_scientific_name);
    select count(*), count(*) filter (where candidates.possible_same_specimen)
    into same_count, specimen_count
    from private.find_same_species_candidates(observation_row.id, taxon_key) as candidates;
    return jsonb_build_object(
      'basis', 'draft', 'sameSpeciesInSession', same_count > 0, 'sameSpeciesCount', same_count,
      'possibleSameSpecimenCount', specimen_count, 'visibility', 'restricted', 'refreshedAt', now()
    );
  end if;

  raise exception using errcode = '42501', message = 'FORBIDDEN';
end;
$$;

-- Grants -------------------------------------------------------------------------------------

revoke execute on function private.observation_submit_blockers(uuid) from public, anon, authenticated;
revoke execute on function private.find_same_species_candidates(uuid, text) from public, anon, authenticated;
revoke execute on function private.notify_class_teachers(uuid, text, text, text, uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.lock_owned_observation_for_review(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.observation_review_payload(uuid) from public, anon, authenticated;

revoke execute on function public.get_observation_review_state(uuid) from public, anon;
grant execute on function public.get_observation_review_state(uuid) to authenticated;
revoke execute on function public.save_student_review(uuid, integer, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_student_review(uuid, integer, text, text, text, text, text, jsonb) to authenticated;
revoke execute on function public.submit_observation(uuid, uuid, integer, boolean) from public, anon;
grant execute on function public.submit_observation(uuid, uuid, integer, boolean) to authenticated;
revoke execute on function public.get_observation_related(uuid) from public, anon;
grant execute on function public.get_observation_related(uuid) to authenticated;

commit;
