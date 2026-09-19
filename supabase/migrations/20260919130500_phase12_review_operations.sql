begin;

-- P12-02 to P12-06: teacher review decisions with a submitted-version
-- precondition, targeted revision and resubmission of the same observation,
-- additional-topic requests, and anonymous rate-limited issue reports
-- (REV-007 to REV-012). Lock order: session share, group share, observation
-- update, then review-scoped rows. Every decision appends rows and notifies
-- only the owning student (D-057).

-- Shared helpers ------------------------------------------------------------------------

create function private.notify_user(
  target_recipient_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  observation_row public.observations,
  notification_actor_id uuid,
  notification_payload jsonb,
  target_request_id uuid default null,
  target_report_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (
    recipient_id, type, title, message, entity_type, entity_id, payload,
    class_id, session_id, activity_id, observation_id, actor_id, request_id, report_id
  )
  values (
    target_recipient_id, notification_type, notification_title, notification_message,
    'observation', observation_row.id, notification_payload,
    observation_row.class_id, observation_row.session_id, observation_row.activity_id,
    observation_row.id, notification_actor_id, target_request_id, target_report_id
  );
end;
$$;

create function private.notify_class_teachers_about(
  observation_row public.observations,
  notification_type text,
  notification_title text,
  notification_message text,
  notification_actor_id uuid,
  notification_payload jsonb,
  target_request_id uuid default null,
  target_report_id uuid default null
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
    class_id, session_id, activity_id, observation_id, actor_id, request_id, report_id
  )
  select
    membership.user_id, notification_type, notification_title, notification_message,
    'observation', observation_row.id, notification_payload,
    observation_row.class_id, observation_row.session_id, observation_row.activity_id,
    observation_row.id, notification_actor_id, target_request_id, target_report_id
  from public.class_members as membership
  where membership.class_id = observation_row.class_id
    and membership.role = 'teacher'
    and membership.status = 'active'
    and private.is_active_class_teacher(membership.user_id, observation_row.class_id);
  get diagnostics notified = row_count;
  return notified;
end;
$$;

create function private.record_observation_event(
  observation_row public.observations,
  actor_id uuid,
  event_name text,
  event_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.research_events (
    event_name, schema_version, actor_id, school_id, class_id, activity_id, session_id,
    group_id, observation_id, occurred_at, payload
  )
  select event_name, 1, actor_id, class_row.school_id, observation_row.class_id,
    observation_row.activity_id, observation_row.session_id, session_group.group_id,
    observation_row.id, now(), event_payload
  from public.classes as class_row
  left join public.exploration_session_groups as session_group
    on session_group.id = observation_row.session_group_id
  where class_row.id = observation_row.class_id;
end;
$$;

-- Teacher lock: the class teacher of a submitted observation.
create function private.lock_observation_for_teacher(target_observation_id uuid, actor_id uuid)
returns public.observations
language plpgsql
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
begin
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null
    or observation_row.first_submitted_at is null
    or not private.is_active_class_teacher(actor_id, observation_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1 from public.exploration_sessions as candidate where candidate.id = observation_row.session_id for share;
  perform 1 from public.exploration_session_groups as candidate where candidate.id = observation_row.session_group_id for share;
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id for update;
  return observation_row;
end;
$$;

create function private.latest_submission_id(target_observation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select submission.id
  from public.observation_submissions as submission
  where submission.observation_id = target_observation_id
  order by submission.submission_number desc
  limit 1;
$$;

-- Topics open for the current revision round: the latest review's topics.
create function private.open_revision_topics(target_observation_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(topic.field_key order by array_position(private.revision_field_keys(), topic.field_key)),
    array[]::text[])
  from public.observations as observation
  join public.observation_revision_topics as topic on topic.review_id = observation.latest_review_id
  where observation.id = target_observation_id
    and observation.status = 'revision_required';
$$;

create function private.observation_revision_denial(target_observation_id uuid)
returns table(code text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
  class_row public.classes%rowtype;
begin
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  select * into class_row from public.classes as class where class.id = observation_row.class_id;
  if class_row.status <> 'active' then
    return query select 'CLASS_NOT_ACTIVE'::text, null::text;
  elsif observation_row.status <> 'revision_required' then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'not_in_revision'::text;
  else
    return query select null::text, null::text;
  end if;
end;
$$;

-- A revision may add images while the images topic is open (owner item 77).
create or replace function private.observation_media_edit_denial(target_observation_id uuid)
returns table(code text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
  denial record;
begin
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.status = 'revision_required' then
    select * into denial from private.observation_revision_denial(target_observation_id);
    if denial.code is not null then
      return query select denial.code, denial.reason;
    elsif not ('images' = any (private.open_revision_topics(target_observation_id))) then
      return query select 'FIELD_NOT_UNLOCKED_FOR_REVISION'::text, 'images'::text;
    else
      return query select null::text, null::text;
    end if;
    return;
  end if;
  return query select edit.code, edit.reason from private.observation_edit_denial(target_observation_id) as edit;
end;
$$;

create or replace function private.observation_media_payload(target_media_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', media.id,
    'clientMediaId', media.client_media_id,
    'position', media.position,
    'category', media.category,
    'status', media.status,
    'mimeType', media.mime_type,
    'byteSize', media.byte_size,
    'width', media.width_px,
    'height', media.height_px,
    'capturedAt', media.captured_at,
    'uploadedAt', media.uploaded_at,
    'submitted', exists (
      select 1 from public.observation_submission_media as submitted where submitted.media_id = media.id
    ),
    'upload', jsonb_build_object(
      'bucket', 'observation-images',
      'path', media.storage_path,
      'contentType', media.mime_type
    )
  )
  from public.observation_media as media
  where media.id = target_media_id;
$$;

-- Teacher: begin review -----------------------------------------------------------------------

create function public.begin_observation_review(target_observation_id uuid)
returns table(outcome text, error_code text, error_details jsonb, observation_status text, observation_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  class_row public.classes%rowtype;
begin
  actor_profile := private.require_active_verified_actor();
  observation_row := private.lock_observation_for_teacher(target_observation_id, actor_profile.id);

  select * into class_row from public.classes as class where class.id = observation_row.class_id;
  if class_row.status <> 'active' then
    return query select 'denied'::text, 'CLASS_NOT_ACTIVE'::text, null::jsonb, observation_row.status, observation_row.version;
    return;
  end if;

  if observation_row.status = 'teacher_review' then
    return query select 'unchanged'::text, null::text, null::jsonb, observation_row.status, observation_row.version;
    return;
  end if;
  if observation_row.status not in ('submitted', 'resubmitted') then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
      jsonb_build_object('reason', 'not_reviewable'), observation_row.status, observation_row.version;
    return;
  end if;

  perform set_config('app.observation_status_reason', 'teacher_review_started', true);
  update public.observations as observation
  set status = 'teacher_review', version = observation.version + 1
  where observation.id = observation_row.id
  returning * into observation_row;
  perform set_config('app.observation_status_reason', '', true);

  return query select 'started'::text, null::text, null::jsonb, observation_row.status, observation_row.version;
end;
$$;

-- Teacher: decision ---------------------------------------------------------------------------

create function public.review_observation(
  target_observation_id uuid,
  expected_submission_id uuid,
  review_decision text,
  review_verified_common_name text,
  review_verified_scientific_name text,
  review_corrected_traits jsonb,
  review_feedback text,
  review_topic_keys text[]
)
returns table(outcome text, error_code text, error_details jsonb, review_id uuid, observation_status text,
  observation_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  class_row public.classes%rowtype;
  latest_submission public.observation_submissions%rowtype;
  existing_review public.teacher_reviews%rowtype;
  next_common text := nullif(btrim(review_verified_common_name), '');
  next_scientific text := nullif(btrim(review_verified_scientific_name), '');
  next_feedback text := nullif(btrim(review_feedback), '');
  corrections jsonb := coalesce(review_corrected_traits, '{}'::jsonb);
  topics text[] := coalesce(review_topic_keys, array[]::text[]);
  started_at timestamptz;
  new_review_id uuid;
  topic text;
  notification_type text;
  notification_title text;
  notification_message text;
begin
  actor_profile := private.require_active_verified_actor();
  observation_row := private.lock_observation_for_teacher(target_observation_id, actor_profile.id);

  select * into class_row from public.classes as class where class.id = observation_row.class_id;
  if class_row.status <> 'active' then
    return query select 'denied'::text, 'CLASS_NOT_ACTIVE'::text, null::jsonb, null::uuid,
      observation_row.status, observation_row.version;
    return;
  end if;

  select * into latest_submission
  from public.observation_submissions as submission
  where submission.id = private.latest_submission_id(observation_row.id);

  -- A retry of the decision that already landed is not a conflict.
  select * into existing_review from public.teacher_reviews as review where review.submission_id = expected_submission_id;
  if existing_review.id is not null then
    if existing_review.reviewer_id = actor_profile.id and existing_review.decision = review_decision
      and existing_review.observation_id = observation_row.id then
      return query select 'existing'::text, null::text, null::jsonb, existing_review.id,
        observation_row.status, observation_row.version;
    else
      return query select 'denied'::text, 'OBSERVATION_VERSION_CONFLICT'::text,
        jsonb_build_object('reason', 'decision_changed', 'currentSubmissionId', latest_submission.id,
          'currentStatus', observation_row.status),
        null::uuid, observation_row.status, observation_row.version;
    end if;
    return;
  end if;

  -- The teacher reviewed a version that is no longer the latest (REV-012).
  if expected_submission_id is distinct from latest_submission.id then
    return query select 'denied'::text, 'OBSERVATION_VERSION_CONFLICT'::text,
      jsonb_build_object('reason', 'submission_changed', 'currentSubmissionId', latest_submission.id,
        'currentStatus', observation_row.status),
      null::uuid, observation_row.status, observation_row.version;
    return;
  end if;

  if observation_row.status not in ('submitted', 'resubmitted', 'teacher_review') then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
      jsonb_build_object('reason', 'not_reviewable', 'currentStatus', observation_row.status),
      null::uuid, observation_row.status, observation_row.version;
    return;
  end if;

  if review_decision is null or review_decision not in ('verified', 'revision_required', 'unable_to_verify', 'rejected') then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'decision'),
      null::uuid, observation_row.status, observation_row.version;
    return;
  end if;

  if review_decision = 'verified' then
    next_common := coalesce(next_common, latest_submission.common_name);
    next_scientific := coalesce(next_scientific, latest_submission.scientific_name);
    if private.is_unknown_plant_name(next_common) or char_length(next_common) > 120 then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'verifiedCommonName'),
        null::uuid, observation_row.status, observation_row.version;
      return;
    end if;
    if private.is_unknown_plant_name(next_scientific) or char_length(next_scientific) > 160 then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'verifiedScientificName'),
        null::uuid, observation_row.status, observation_row.version;
      return;
    end if;
    if jsonb_typeof(corrections) <> 'object'
      or (select count(*) from jsonb_object_keys(corrections)) > 40
      or exists (
        select 1 from jsonb_each(corrections) as entry
        where entry.key !~ '^[a-z][a-z0-9_]{0,63}$'
          or jsonb_typeof(entry.value) <> 'string'
          or char_length(btrim(entry.value #>> '{}')) not between 1 and 120
      ) then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'correctedTraits'),
        null::uuid, observation_row.status, observation_row.version;
      return;
    end if;
  else
    next_common := null;
    next_scientific := null;
    corrections := '{}'::jsonb;
  end if;

  if next_feedback is not null and char_length(next_feedback) > 500 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'feedback'),
      null::uuid, observation_row.status, observation_row.version;
    return;
  end if;
  if review_decision in ('revision_required', 'rejected') and next_feedback is null then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text,
      jsonb_build_object('field', 'feedback', 'reason', 'required'),
      null::uuid, observation_row.status, observation_row.version;
    return;
  end if;

  if review_decision = 'revision_required' then
    if not private.is_revision_field_key_list(topics) then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text,
        jsonb_build_object('field', 'topicKeys', 'reason', 'required'),
        null::uuid, observation_row.status, observation_row.version;
      return;
    end if;
  elsif cardinality(topics) > 0 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'topicKeys'),
      null::uuid, observation_row.status, observation_row.version;
    return;
  end if;

  select history.created_at into started_at
  from public.observation_status_history as history
  where history.observation_id = observation_row.id and history.to_status = 'teacher_review'
    and history.created_at >= latest_submission.submitted_at
  order by history.created_at desc
  limit 1;

  insert into public.teacher_reviews (
    observation_id, submission_id, observer_id, class_id, session_id, reviewer_id, decision,
    verified_common_name, verified_scientific_name, corrected_traits, feedback, review_started_at
  )
  values (
    observation_row.id, latest_submission.id, observation_row.observer_id, observation_row.class_id,
    observation_row.session_id, actor_profile.id, review_decision, next_common, next_scientific,
    corrections, next_feedback, started_at
  )
  returning id into new_review_id;

  if review_decision = 'revision_required' then
    foreach topic in array topics loop
      insert into public.observation_revision_topics (
        observation_id, review_id, observer_id, class_id, field_key, source, opened_by
      )
      values (
        observation_row.id, new_review_id, observation_row.observer_id, observation_row.class_id,
        topic, 'review', actor_profile.id
      );
    end loop;
  end if;

  perform set_config('app.observation_status_reason', 'teacher_decision', true);
  update public.observations as observation
  set status = review_decision,
      latest_review_id = new_review_id,
      latest_reviewed_at = now(),
      review_count = observation.review_count + 1,
      verified_common_name = case when review_decision = 'verified' then next_common else observation.verified_common_name end,
      verified_scientific_name = case when review_decision = 'verified' then next_scientific else observation.verified_scientific_name end,
      version = observation.version + 1
  where observation.id = observation_row.id
  returning * into observation_row;
  perform set_config('app.observation_status_reason', '', true);

  perform private.record_observation_event(observation_row, actor_profile.id, 'teacher_review_completed',
    jsonb_build_object(
      'decision', review_decision,
      'review_duration_s', case when started_at is null then null
        else greatest(0, floor(extract(epoch from (now() - started_at))))::integer end,
      'submission_version', latest_submission.submission_number
    ));
  if review_decision = 'verified' then
    perform private.record_observation_event(observation_row, actor_profile.id, 'teacher_verified',
      jsonb_build_object(
        'corrected_identity', (next_common, next_scientific)
          is distinct from (latest_submission.common_name, latest_submission.scientific_name)
          or corrections <> '{}'::jsonb,
        'submission_version', latest_submission.submission_number
      ));
  elsif review_decision = 'revision_required' then
    perform private.record_observation_event(observation_row, actor_profile.id, 'teacher_requested_revision',
      jsonb_build_object('topic_keys', to_jsonb(topics), 'submission_version', latest_submission.submission_number));
  end if;

  select
    case review_decision
      when 'verified' then 'observation_verified'
      when 'revision_required' then 'observation_revision_requested'
      when 'unable_to_verify' then 'observation_unable_to_verify'
      else 'observation_rejected'
    end,
    case review_decision
      when 'verified' then 'ครูยืนยันรายการพืชแล้ว'
      when 'revision_required' then 'ครูขอให้แก้ไข'
      when 'unable_to_verify' then 'ครูยังยืนยันรายการพืชไม่ได้'
      else 'ครูไม่รับรายการพืช'
    end,
    case review_decision
      when 'verified' then 'ครูยืนยันรายการพืชของคุณแล้ว'
      when 'revision_required' then 'ครูขอให้แก้ไขรายการพืชของคุณ'
      when 'unable_to_verify' then 'ครูยังยืนยันรายการพืชของคุณไม่ได้ ดูคำแนะนำจากครู'
      else 'ครูไม่รับรายการพืชของคุณ ดูเหตุผลจากครู'
    end
  into notification_type, notification_title, notification_message;

  perform private.notify_user(observation_row.observer_id, notification_type, notification_title,
    notification_message, observation_row, actor_profile.id,
    jsonb_build_object('observationId', observation_row.id, 'decision', review_decision,
      'submissionNumber', latest_submission.submission_number, 'topicKeys', to_jsonb(topics)));

  return query select 'decided'::text, null::text, null::jsonb, new_review_id, observation_row.status,
    observation_row.version;
end;
$$;

-- Student: revision -----------------------------------------------------------------------

create function public.save_observation_revision(
  target_observation_id uuid,
  expected_version integer,
  revision_common_name text,
  revision_scientific_name text,
  revision_evidence_note text,
  revision_reference_note text,
  revision_traits jsonb
)
returns table(outcome text, error_code text, error_details jsonb, observation_version integer, observation_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  denial record;
  open_topics text[];
  changed text[] := array[]::text[];
  locked text[];
  next_common text := nullif(btrim(revision_common_name), '');
  next_scientific text := nullif(btrim(revision_scientific_name), '');
  next_note text := nullif(btrim(revision_evidence_note), '');
  next_reference text := nullif(btrim(revision_reference_note), '');
  traits jsonb := coalesce(revision_traits, '[]'::jsonb);
  trait jsonb;
  current_traits jsonb;
  requested_traits jsonb;
  trait_position integer := 0;
  updated_version integer;
begin
  actor_profile := private.require_active_verified_actor();
  observation_row := private.lock_owned_observation_for_review(target_observation_id, actor_profile.id);

  select * into denial from private.observation_revision_denial(observation_row.id);
  if denial.code is not null then
    return query select 'denied'::text, denial.code,
      case when denial.reason is null then null else jsonb_build_object('reason', denial.reason) end,
      observation_row.version, observation_row.status;
    return;
  end if;

  if expected_version is null
    or char_length(next_common) > 120 or char_length(next_scientific) > 160
    or char_length(next_note) > 1000 or char_length(next_reference) > 300
    or jsonb_typeof(traits) <> 'array' or jsonb_array_length(traits) > 40
    or (select count(distinct item ->> 'traitKey') from jsonb_array_elements(traits) as item) <> jsonb_array_length(traits) then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text,
      jsonb_build_object('fields', to_jsonb(array_remove(array[
        case when expected_version is null then 'expectedVersion' end,
        case when char_length(next_common) > 120 then 'commonName' end,
        case when char_length(next_scientific) > 160 then 'scientificName' end,
        case when char_length(next_note) > 1000 then 'evidenceNote' end,
        case when char_length(next_reference) > 300 then 'referenceNote' end,
        case when jsonb_typeof(traits) <> 'array' or jsonb_array_length(traits) > 40 then 'traits' end
      ], null))),
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

  if next_common is distinct from observation_row.student_common_name then changed := array_append(changed, 'common_name'); end if;
  if next_scientific is distinct from observation_row.student_scientific_name then changed := array_append(changed, 'scientific_name'); end if;
  if requested_traits <> current_traits then changed := array_append(changed, 'traits'); end if;
  if next_note is distinct from observation_row.student_evidence_note then changed := array_append(changed, 'evidence_note'); end if;
  if next_reference is distinct from observation_row.student_reference_note then changed := array_append(changed, 'reference_note'); end if;

  if cardinality(changed) = 0 then
    return query select 'unchanged'::text, null::text, null::jsonb, observation_row.version, observation_row.status;
    return;
  end if;

  open_topics := private.open_revision_topics(observation_row.id);
  select coalesce(array_agg(key), array[]::text[]) into locked from unnest(changed) as key where not (key = any (open_topics));
  if cardinality(locked) > 0 then
    return query select 'denied'::text, 'FIELD_NOT_UNLOCKED_FOR_REVISION'::text,
      jsonb_build_object('fields', to_jsonb(locked)), observation_row.version, observation_row.status;
    return;
  end if;

  if expected_version <> observation_row.version then
    return query select 'denied'::text, 'OBSERVATION_VERSION_CONFLICT'::text,
      jsonb_build_object('currentVersion', observation_row.version), observation_row.version, observation_row.status;
    return;
  end if;

  update public.observations as observation
  set student_common_name = next_common,
      student_scientific_name = next_scientific,
      student_evidence_note = next_note,
      student_reference_note = next_reference,
      version = observation.version + 1
  where observation.id = observation_row.id
  returning observation.version into updated_version;

  if 'traits' = any (changed) then
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
  end if;

  return query select 'updated'::text, null::text, null::jsonb, updated_version, observation_row.status;
end;
$$;

-- What changed since the latest submission, by revision topic.
create function private.revision_changed_topics(target_observation_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select submission.* from public.observation_submissions as submission
    where submission.id = private.latest_submission_id(target_observation_id)
  )
  select array_remove(array[
    case when exists (
      select 1 from public.observation_media as media, latest
      where media.observation_id = target_observation_id and media.status = 'uploaded'
        and not exists (
          select 1 from public.observation_submission_media as submitted
          where submitted.submission_id = latest.id and submitted.media_id = media.id
        )
    ) then 'images' end,
    case when observation.student_common_name is distinct from latest.common_name then 'common_name' end,
    case when observation.student_scientific_name is distinct from latest.scientific_name then 'scientific_name' end,
    case when (
      select coalesce(jsonb_agg(jsonb_build_object('traitKey', trait.trait_key, 'status', trait.student_status,
        'value', trait.student_value #>> '{}', 'note', trait.note) order by trait.position), '[]'::jsonb)
      from public.student_trait_verifications as trait
      where trait.observation_id = target_observation_id and trait.trait_source = 'manual'
    ) is distinct from coalesce(latest.verification_snapshot -> 'traits', '[]'::jsonb) then 'traits' end,
    case when observation.student_evidence_note is distinct from latest.evidence_note then 'evidence_note' end,
    case when observation.student_reference_note is distinct from latest.reference_note then 'reference_note' end
  ], null)
  from public.observations as observation, latest
  where observation.id = target_observation_id;
$$;

create function public.resubmit_observation(
  target_observation_id uuid,
  target_client_submission_id uuid,
  expected_version integer,
  acknowledge_same_species boolean
)
returns table(outcome text, error_code text, error_details jsonb, submission_id uuid, submission_number integer,
  observation_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  existing_submission public.observation_submissions%rowtype;
  latest_submission public.observation_submissions%rowtype;
  session_row public.exploration_sessions%rowtype;
  denial record;
  blockers text[];
  changed text[];
  taxon_key text;
  same_species_candidate record;
  same_count integer := 0;
  specimen_count integer := 0;
  new_submission_id uuid;
  new_version integer;
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

  select * into existing_submission
  from public.observation_submissions as submission
  where submission.observer_id = actor_profile.id and submission.client_submission_id = target_client_submission_id;
  if existing_submission.id is not null then
    if existing_submission.observation_id = observation_row.id and existing_submission.submission_kind = 'resubmission' then
      return query select 'existing'::text, null::text, null::jsonb, existing_submission.id,
        existing_submission.submission_number, existing_submission.observation_version;
    else
      return query select 'denied'::text, 'IDEMPOTENCY_KEY_REUSE'::text, null::jsonb, null::uuid, null::integer, null::integer;
    end if;
    return;
  end if;

  select * into denial from private.observation_revision_denial(observation_row.id);
  if denial.code is not null then
    return query select 'denied'::text, denial.code,
      case when denial.reason is null then null else jsonb_build_object('reason', denial.reason) end,
      null::uuid, null::integer, observation_row.version;
    return;
  end if;

  -- No resubmission while the teacher has paused the session (D-056).
  select * into session_row from public.exploration_sessions as candidate where candidate.id = observation_row.session_id;
  if session_row.status = 'paused' then
    return query select 'denied'::text, 'SESSION_PAUSED'::text, null::jsonb, null::uuid, null::integer, observation_row.version;
    return;
  end if;

  if expected_version <> observation_row.version then
    return query select 'denied'::text, 'OBSERVATION_VERSION_CONFLICT'::text,
      jsonb_build_object('currentVersion', observation_row.version), null::uuid, null::integer, observation_row.version;
    return;
  end if;

  blockers := array_remove(private.observation_submit_blockers(observation_row.id), 'student_review');
  if array_length(blockers, 1) is not null then
    return query select 'denied'::text,
      case blockers[1]
        when 'common_name' then 'PLANT_NAME_REQUIRED'
        when 'scientific_name' then 'SCIENTIFIC_NAME_REQUIRED'
        when 'pending_images' then 'IMAGE_UPLOAD_INCOMPLETE'
        else 'VALIDATION_FAILED'
      end,
      jsonb_build_object('blockers', to_jsonb(blockers), 'minChars', private.observation_evidence_note_min_chars()),
      null::uuid, null::integer, observation_row.version;
    return;
  end if;

  changed := private.revision_changed_topics(observation_row.id);
  if cardinality(changed) = 0 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text,
      jsonb_build_object('reason', 'no_changes', 'blockers', '[]'::jsonb),
      null::uuid, null::integer, observation_row.version;
    return;
  end if;

  select * into latest_submission from public.observation_submissions as submission
  where submission.id = private.latest_submission_id(observation_row.id);

  taxon_key := private.observation_taxon_key_v1(observation_row.student_scientific_name);
  if taxon_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('same_species:' || observation_row.session_id::text || ':' || taxon_key, 0)
    );
  end if;
  select count(*), count(*) filter (where candidates.possible_same_specimen)
  into same_count, specimen_count
  from private.find_same_species_candidates(observation_row.id, taxon_key) as candidates;

  -- A new taxon can meet a new same-species match: warn once, never block.
  if same_count > 0 and taxon_key is distinct from latest_submission.taxon_key
    and not coalesce(acknowledge_same_species, false) then
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
    observation_row.submission_count + 1, target_client_submission_id, 'resubmission', observation_row.version,
    new_version, observation_row.student_common_name, observation_row.student_scientific_name,
    observation_row.student_evidence_note, observation_row.student_reference_note,
    observation_row.identity_source, taxon_key,
    jsonb_build_object(
      'schemaVersion', 'student-review-v1',
      'identitySource', observation_row.identity_source,
      'analysis', jsonb_build_object('state', 'unavailable'),
      'referenceNote', observation_row.student_reference_note,
      'traits', private.observation_review_payload(observation_row.id) -> 'traits',
      'changedTopics', to_jsonb(changed),
      'revisionOfReviewId', observation_row.latest_review_id
    ),
    media_snapshot,
    jsonb_build_object(
      'locationStatus', observation_row.location_status,
      'accuracyM', observation_row.capture_accuracy_m,
      'capturedAt', observation_row.captured_at,
      'unavailableReason', observation_row.location_unavailable_reason
    ),
    same_count, same_count > 0 and coalesce(acknowledge_same_species, false), specimen_count, actor_profile.id
  )
  returning id into new_submission_id;

  insert into public.observation_submission_media (submission_id, media_id, observation_id, position, category)
  select new_submission_id, media.id, media.observation_id, media.position, media.category
  from public.observation_media as media
  where media.observation_id = observation_row.id and media.status = 'uploaded';

  for same_species_candidate in select * from private.find_same_species_candidates(observation_row.id, taxon_key) loop
    new_candidate_id := null;
    insert into public.observation_duplicate_candidates (
      observation_id, candidate_observation_id, session_id, class_id, relationship_type,
      location_distance_m, temporal_distance_seconds, system_recommendation,
      student_acknowledged_at, source_submission_id, rule_version
    )
    values (
      observation_row.id, same_species_candidate.candidate_observation_id, observation_row.session_id, observation_row.class_id,
      'same_species', same_species_candidate.distance_m, same_species_candidate.time_gap_seconds, null, now(),
      new_submission_id, 'taxon-key-v1'
    )
    on conflict (pair_low, pair_high, relationship_type) do nothing
    returning id into new_candidate_id;
    if new_candidate_id is not null then
      insert into public.observation_relation_events (candidate_id, class_id, session_id, event_type, actor_id)
      values (new_candidate_id, observation_row.class_id, observation_row.session_id, 'candidate_created', actor_profile.id);
    end if;
    if same_species_candidate.possible_same_specimen then
      new_candidate_id := null;
      insert into public.observation_duplicate_candidates (
        observation_id, candidate_observation_id, session_id, class_id, relationship_type,
        location_distance_m, temporal_distance_seconds, system_recommendation,
        student_acknowledged_at, source_submission_id, rule_version
      )
      values (
        observation_row.id, same_species_candidate.candidate_observation_id, observation_row.session_id, observation_row.class_id,
        'possible_same_specimen', same_species_candidate.distance_m, same_species_candidate.time_gap_seconds,
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

  -- Pending additional-topic requests end with the round they belonged to.
  update public.observation_unlock_requests as request
  set status = 'cancelled', decided_at = now()
  where request.observation_id = observation_row.id and request.status = 'pending';

  perform set_config('app.observation_status_reason', 'observation_resubmitted', true);
  update public.observations as observation
  set status = 'resubmitted',
      version = new_version,
      latest_submitted_at = now(),
      submission_count = observation.submission_count + 1,
      normalized_taxon_key = taxon_key,
      same_species_in_session = same_count > 0,
      same_species_count = same_count
  where observation.id = observation_row.id
  returning * into observation_row;
  perform set_config('app.observation_status_reason', '', true);

  perform private.record_observation_event(observation_row, actor_profile.id, 'observation_resubmitted',
    jsonb_build_object('submission_version', observation_row.submission_count, 'changed_topic_keys', to_jsonb(changed)));

  select profile.display_name into observer_name from public.profiles as profile where profile.id = actor_profile.id;
  perform private.notify_class_teachers_about(observation_row, 'observation_resubmitted', 'มีรายการพืชที่แก้ไขแล้ว',
    coalesce(nullif(btrim(observer_name), ''), 'นักเรียน') || ' ส่งรายการพืชที่แก้ไขแล้ว',
    actor_profile.id,
    jsonb_build_object('observationId', observation_row.id, 'submissionNumber', observation_row.submission_count));

  return query select 'resubmitted'::text, null::text, null::jsonb, new_submission_id,
    observation_row.submission_count, observation_row.version;
end;
$$;

-- Student: additional topics ------------------------------------------------------------------

create function public.request_additional_revision_fields(
  target_observation_id uuid,
  requested_field_keys text[],
  request_reason text
)
returns table(outcome text, error_code text, error_details jsonb, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  denial record;
  pending public.observation_unlock_requests%rowtype;
  next_reason text := nullif(btrim(request_reason), '');
  keys text[];
  already_open text[];
  new_request_id uuid;
  observer_name text;
begin
  actor_profile := private.require_active_verified_actor();
  observation_row := private.lock_owned_observation_for_review(target_observation_id, actor_profile.id);

  select * into denial from private.observation_revision_denial(observation_row.id);
  if denial.code is not null then
    return query select 'denied'::text, denial.code,
      case when denial.reason is null then null else jsonb_build_object('reason', denial.reason) end, null::uuid;
    return;
  end if;

  select coalesce(array_agg(key order by array_position(private.revision_field_keys(), key)), array[]::text[])
  into keys
  from (select distinct unnest(requested_field_keys) as key) as requested;
  if not private.is_revision_field_key_list(keys) then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'fieldKeys'), null::uuid;
    return;
  end if;
  if next_reason is null or char_length(next_reason) not between 5 and 300 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text,
      jsonb_build_object('field', 'reason', 'reason', case when next_reason is null then 'required' else 'too_short' end),
      null::uuid;
    return;
  end if;

  select coalesce(array_agg(key), array[]::text[]) into already_open
  from unnest(keys) as key where key = any (private.open_revision_topics(observation_row.id));
  if cardinality(already_open) > 0 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text,
      jsonb_build_object('field', 'fieldKeys', 'reason', 'already_open', 'fields', to_jsonb(already_open)), null::uuid;
    return;
  end if;

  select * into pending from public.observation_unlock_requests as request
  where request.observation_id = observation_row.id and request.requested_by = actor_profile.id
    and request.status = 'pending';
  if pending.id is not null then
    if pending.requested_fields = keys and pending.reason = next_reason then
      return query select 'existing'::text, null::text, null::jsonb, pending.id;
    else
      return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
        jsonb_build_object('reason', 'pending_exists'), pending.id;
    end if;
    return;
  end if;

  insert into public.observation_unlock_requests (
    observation_id, review_id, requested_by, class_id, session_id, requested_fields, reason
  )
  values (
    observation_row.id, observation_row.latest_review_id, actor_profile.id, observation_row.class_id,
    observation_row.session_id, keys, next_reason
  )
  returning id into new_request_id;

  perform private.record_observation_event(observation_row, actor_profile.id, 'revision_unlock_requested',
    jsonb_build_object('topic_keys', to_jsonb(keys)));

  select profile.display_name into observer_name from public.profiles as profile where profile.id = actor_profile.id;
  perform private.notify_class_teachers_about(observation_row, 'revision_access_requested', 'มีคำขอแก้ไขเพิ่มเติม',
    coalesce(nullif(btrim(observer_name), ''), 'นักเรียน') || ' ขอแก้ไขข้อมูลเพิ่มเติม',
    actor_profile.id,
    jsonb_build_object('observationId', observation_row.id, 'requestId', new_request_id, 'topicKeys', to_jsonb(keys)),
    new_request_id);

  return query select 'requested'::text, null::text, null::jsonb, new_request_id;
end;
$$;

create function public.decide_revision_unlock_request(
  target_request_id uuid,
  request_decision text,
  granted_field_keys text[],
  decision_note text
)
returns table(outcome text, error_code text, error_details jsonb, request_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  request_row public.observation_unlock_requests%rowtype;
  observation_row public.observations%rowtype;
  class_row public.classes%rowtype;
  next_note text := nullif(btrim(decision_note), '');
  keys text[];
  topic text;
begin
  actor_profile := private.require_active_verified_actor();

  select * into request_row from public.observation_unlock_requests as request where request.id = target_request_id;
  if request_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  observation_row := private.lock_observation_for_teacher(request_row.observation_id, actor_profile.id);
  select * into request_row from public.observation_unlock_requests as request where request.id = target_request_id for update;

  select * into class_row from public.classes as class where class.id = observation_row.class_id;
  if class_row.status <> 'active' then
    return query select 'denied'::text, 'CLASS_NOT_ACTIVE'::text, null::jsonb, request_row.status;
    return;
  end if;

  if request_row.status <> 'pending' then
    if request_row.status = request_decision and request_row.decided_by = actor_profile.id then
      return query select 'unchanged'::text, null::text, null::jsonb, request_row.status;
    else
      return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
        jsonb_build_object('reason', 'already_decided', 'currentStatus', request_row.status), request_row.status;
    end if;
    return;
  end if;

  if observation_row.status <> 'revision_required' or observation_row.latest_review_id <> request_row.review_id then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
      jsonb_build_object('reason', 'not_in_revision'), request_row.status;
    return;
  end if;

  if request_decision is null or request_decision not in ('granted', 'denied') then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'decision'), request_row.status;
    return;
  end if;
  if next_note is not null and char_length(next_note) > 300 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'note'), request_row.status;
    return;
  end if;

  if request_decision = 'granted' then
    select coalesce(array_agg(key order by array_position(private.revision_field_keys(), key)), array[]::text[])
    into keys
    from (select distinct unnest(coalesce(granted_field_keys, request_row.requested_fields)) as key) as granted;
    -- A grant opens exactly the requested topics it names, never others (API §24).
    if not private.is_revision_field_key_list(keys) or not (keys <@ request_row.requested_fields) then
      return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'fieldKeys'), request_row.status;
      return;
    end if;

    update public.observation_unlock_requests as request
    set status = 'granted', granted_fields = keys, decided_by = actor_profile.id, decision_note = next_note, decided_at = now()
    where request.id = request_row.id;

    foreach topic in array keys loop
      insert into public.observation_revision_topics (
        observation_id, review_id, observer_id, class_id, field_key, source, unlock_request_id, opened_by
      )
      values (
        observation_row.id, request_row.review_id, observation_row.observer_id, observation_row.class_id,
        topic, 'unlock_request', request_row.id, actor_profile.id
      )
      on conflict (review_id, field_key) do nothing;
    end loop;

    perform private.notify_user(observation_row.observer_id, 'revision_access_granted', 'ครูอนุญาตให้แก้ไขเพิ่ม',
      'ครูอนุญาตให้แก้ไขหัวข้อเพิ่มเติมแล้ว', observation_row, actor_profile.id,
      jsonb_build_object('observationId', observation_row.id, 'requestId', request_row.id, 'topicKeys', to_jsonb(keys)),
      request_row.id);
  else
    update public.observation_unlock_requests as request
    set status = 'denied', decided_by = actor_profile.id, decision_note = next_note, decided_at = now()
    where request.id = request_row.id;
  end if;

  return query select 'decided'::text, null::text, null::jsonb, request_decision;
end;
$$;

-- Issue reports (D-049, D-066) ----------------------------------------------------------------

create function public.report_observation_issue(
  target_observation_id uuid,
  target_report_type text,
  report_reason text
)
returns table(outcome text, error_code text, error_details jsonb, report_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  class_row public.classes%rowtype;
  next_reason text := nullif(btrim(report_reason), '');
  last_report timestamptz;
  new_report_id uuid;
begin
  actor_profile := private.require_active_verified_actor();

  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null
    or observation_row.first_submitted_at is null
    or observation_row.observer_id = actor_profile.id
    or not private.is_active_class_student(actor_profile.id, observation_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into class_row from public.classes as class where class.id = observation_row.class_id;
  if class_row.status <> 'active' then
    return query select 'denied'::text, 'CLASS_NOT_ACTIVE'::text, null::jsonb, null::uuid;
    return;
  end if;

  if target_report_type is null or target_report_type not in ('identity', 'image', 'location', 'privacy', 'other') then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'type'), null::uuid;
    return;
  end if;
  if next_reason is null or char_length(next_reason) not between 10 and 500 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text,
      jsonb_build_object('field', 'reason', 'reason', case when next_reason is null then 'required' else 'too_short' end,
        'minChars', 10),
      null::uuid;
    return;
  end if;

  -- One report per reporter and record in any rolling 24 hours.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('issue_report:' || actor_profile.id::text || ':' || observation_row.id::text, 0)
  );
  select max(report.created_at) into last_report
  from public.observation_issue_reports as report
  where report.reporter_id = actor_profile.id and report.observation_id = observation_row.id
    and report.created_at > now() - interval '24 hours';
  if last_report is not null then
    return query select 'denied'::text, 'RATE_LIMITED'::text,
      jsonb_build_object('retryAfterSeconds',
        greatest(1, ceil(extract(epoch from (last_report + interval '24 hours' - now()))))::integer),
      null::uuid;
    return;
  end if;

  insert into public.observation_issue_reports (observation_id, reporter_id, class_id, session_id, report_type, reason)
  values (observation_row.id, actor_profile.id, observation_row.class_id, observation_row.session_id,
    target_report_type, next_reason)
  returning id into new_report_id;

  perform private.record_observation_event(observation_row, actor_profile.id, 'observation_issue_reported',
    jsonb_build_object('report_type', target_report_type));

  -- Teachers only; the owner is never told who reported.
  perform private.notify_class_teachers_about(observation_row, 'observation_issue_reported', 'มีรายงานปัญหาในรายการพืช',
    'มีนักเรียนรายงานปัญหาในรายการพืช', actor_profile.id,
    jsonb_build_object('observationId', observation_row.id, 'reportId', new_report_id, 'reportType', target_report_type),
    null, new_report_id);

  return query select 'reported'::text, null::text, null::jsonb, new_report_id;
end;
$$;

create function public.resolve_observation_issue_report(
  target_report_id uuid,
  next_status text,
  note text
)
returns table(outcome text, error_code text, error_details jsonb, report_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  report_row public.observation_issue_reports%rowtype;
  next_note text := nullif(btrim(note), '');
begin
  actor_profile := private.require_active_verified_actor();
  select * into report_row from public.observation_issue_reports as report where report.id = target_report_id for update;
  if report_row.id is null or not private.is_active_class_teacher(actor_profile.id, report_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if next_status is null or next_status not in ('reviewing', 'resolved', 'dismissed') then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'status'), report_row.status;
    return;
  end if;
  if next_note is not null and char_length(next_note) > 500 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'note'), report_row.status;
    return;
  end if;
  if report_row.status = next_status then
    return query select 'unchanged'::text, null::text, null::jsonb, report_row.status;
    return;
  end if;
  if report_row.status in ('resolved', 'dismissed') then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
      jsonb_build_object('reason', 'already_decided', 'currentStatus', report_row.status), report_row.status;
    return;
  end if;

  update public.observation_issue_reports as report
  set status = next_status,
      resolution_note = case when next_status in ('resolved', 'dismissed') then next_note else report.resolution_note end,
      resolved_by = case when next_status in ('resolved', 'dismissed') then actor_profile.id else null end,
      resolved_at = case when next_status in ('resolved', 'dismissed') then now() else null end
  where report.id = report_row.id;

  return query select 'updated'::text, null::text, null::jsonb, next_status;
end;
$$;

-- Read models -------------------------------------------------------------------------------

create function private.observation_reviews_payload(target_observation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', review.id,
      'submissionId', review.submission_id,
      'submissionNumber', submission.submission_number,
      'decision', review.decision,
      'reviewerName', reviewer.display_name,
      'verifiedCommonName', review.verified_common_name,
      'verifiedScientificName', review.verified_scientific_name,
      'correctedTraits', review.corrected_traits,
      'feedback', review.feedback,
      'topics', coalesce((
        select jsonb_agg(jsonb_build_object('fieldKey', topic.field_key, 'source', topic.source)
          order by array_position(private.revision_field_keys(), topic.field_key))
        from public.observation_revision_topics as topic where topic.review_id = review.id
      ), '[]'::jsonb),
      'reviewedAt', review.reviewed_at
    )
    order by submission.submission_number desc, review.reviewed_at desc, review.id desc
  ), '[]'::jsonb)
  from public.teacher_reviews as review
  join public.observation_submissions as submission on submission.id = review.submission_id
  join public.profiles as reviewer on reviewer.id = review.reviewer_id
  where review.observation_id = target_observation_id;
$$;

create function private.observation_unlock_requests_payload(target_observation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', request.id,
      'reviewId', request.review_id,
      'requestedFields', to_jsonb(request.requested_fields),
      'reason', request.reason,
      'status', request.status,
      'grantedFields', to_jsonb(request.granted_fields),
      'decisionNote', request.decision_note,
      'createdAt', request.created_at,
      'decidedAt', request.decided_at
    )
    order by request.created_at desc, request.id desc
  ), '[]'::jsonb)
  from public.observation_unlock_requests as request
  where request.observation_id = target_observation_id;
$$;

create function private.observation_history_payload(target_observation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('fromStatus', history.from_status, 'toStatus', history.to_status,
      'reason', history.reason, 'changedAt', history.created_at)
    order by history.created_at, history.id
  ), '[]'::jsonb)
  from public.observation_status_history as history
  where history.observation_id = target_observation_id;
$$;

create or replace function public.get_teacher_observation_review(target_observation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  class_active boolean;
begin
  actor_profile := private.require_active_verified_actor();

  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null
    or observation_row.first_submitted_at is null
    or not private.is_active_class_teacher(actor_profile.id, observation_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select class.status = 'active' into class_active from public.classes as class where class.id = observation_row.class_id;

  return jsonb_build_object(
    'observationId', observation_row.id,
    'classId', observation_row.class_id,
    'status', observation_row.status,
    'version', observation_row.version,
    'latestSubmissionId', private.latest_submission_id(observation_row.id),
    'verifiedIdentity', case when observation_row.verified_common_name is null then null else jsonb_build_object(
      'commonName', observation_row.verified_common_name,
      'scientificName', observation_row.verified_scientific_name) end,
    'student', (
      select jsonb_build_object('id', profile.id, 'displayName', profile.display_name)
      from public.profiles as profile where profile.id = observation_row.observer_id
    ),
    'groupName', (
      select grouped.name
      from public.exploration_session_groups as session_group
      join public.groups as grouped on grouped.id = session_group.group_id
      where session_group.id = observation_row.session_group_id
    ),
    'session', (
      select jsonb_build_object('id', session_row.id, 'title', session_row.title, 'status', session_row.status)
      from public.exploration_sessions as session_row where session_row.id = observation_row.session_id
    ),
    'activity', (
      select jsonb_build_object('id', version_row.activity_id, 'title', version_row.title)
      from public.exploration_sessions as session_row
      join public.activity_versions as version_row on version_row.id = session_row.activity_version_id
      where session_row.id = observation_row.session_id
    ),
    'capture', jsonb_build_object(
      'locationStatus', observation_row.location_status,
      'lat', round(extensions.st_y(observation_row.capture_location::extensions.geometry)::numeric, 6),
      'lng', round(extensions.st_x(observation_row.capture_location::extensions.geometry)::numeric, 6),
      'accuracyM', observation_row.capture_accuracy_m,
      'capturedAt', observation_row.captured_at,
      'unavailableReason', observation_row.location_unavailable_reason
    ),
    'sameSpecies', jsonb_build_object(
      'inSession', observation_row.same_species_in_session,
      'count', observation_row.same_species_count
    ),
    'submissions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', submission.id,
          'submissionNumber', submission.submission_number,
          'submittedAt', submission.submitted_at,
          'commonName', submission.common_name,
          'scientificName', submission.scientific_name,
          'evidenceNote', submission.evidence_note,
          'referenceNote', submission.reference_note,
          'identitySource', submission.identity_source,
          'verification', submission.verification_snapshot,
          'sameSpeciesCount', submission.same_species_count,
          'sameSpeciesAcknowledged', submission.same_species_acknowledged,
          'media', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'mediaId', media.id,
                'position', media.position,
                'category', submitted.category,
                'width', media.width_px,
                'height', media.height_px,
                'storagePath', media.storage_path
              )
              order by submitted.position
            )
            from public.observation_submission_media as submitted
            join public.observation_media as media on media.id = submitted.media_id
            where submitted.submission_id = submission.id
          ), '[]'::jsonb)
        )
        order by submission.submission_number desc
      )
      from public.observation_submissions as submission
      where submission.observation_id = observation_row.id
    ), '[]'::jsonb),
    'relations', private.observation_relations_payload(observation_row.id, actor_profile.id),
    'reviews', private.observation_reviews_payload(observation_row.id),
    'unlockRequests', private.observation_unlock_requests_payload(observation_row.id),
    'history', private.observation_history_payload(observation_row.id),
    'reports', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', report.id, 'type', report.report_type, 'reason', report.reason,
          'status', report.status, 'reporterName', reporter.display_name, 'createdAt', report.created_at)
        order by report.created_at desc, report.id desc
      )
      from public.observation_issue_reports as report
      join public.profiles as reporter on reporter.id = report.reporter_id
      where report.observation_id = observation_row.id
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canDecide', class_active and observation_row.status in ('submitted', 'resubmitted', 'teacher_review'),
      'canBegin', class_active and observation_row.status in ('submitted', 'resubmitted')
    ),
    'refreshedAt', now()
  );
end;
$$;

-- The review queue: submitted and resubmitted work first, oldest first (API §22).
create function public.get_teacher_review_queue(
  target_class_id uuid,
  target_session_id uuid,
  queue_filter text,
  page_limit integer,
  cursor_submitted_at timestamptz,
  cursor_observation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  bounded_limit integer := least(greatest(coalesce(page_limit, 50), 1), 100);
  filter_value text := coalesce(queue_filter, 'pending');
  statuses text[];
  items jsonb;
  has_more boolean;
begin
  actor_profile := private.require_active_verified_actor();
  if target_class_id is null or not private.is_active_class_teacher(actor_profile.id, target_class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  statuses := case filter_value
    when 'pending' then array['submitted', 'resubmitted', 'teacher_review']
    when 'resubmitted' then array['resubmitted']
    when 'same_species' then array['submitted', 'resubmitted', 'teacher_review']
    when 'revision_required' then array['revision_required']
    when 'verified' then array['verified']
    when 'unable_to_verify' then array['unable_to_verify']
    when 'rejected' then array['rejected']
    else null
  end;
  if statuses is null then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  with page as (
    select observation.*
    from public.observations as observation
    where observation.class_id = target_class_id
      and observation.first_submitted_at is not null
      and observation.status = any (statuses)
      and (target_session_id is null or observation.session_id = target_session_id)
      and (filter_value <> 'same_species' or observation.same_species_in_session)
      and (cursor_submitted_at is null
        or (observation.latest_submitted_at, observation.id) > (cursor_submitted_at, cursor_observation_id))
    order by observation.latest_submitted_at, observation.id
    limit bounded_limit + 1
  )
  select
    coalesce(jsonb_agg(item order by sort_at, sort_id) filter (where position_in_page <= bounded_limit), '[]'::jsonb),
    count(*) > bounded_limit
  into items, has_more
  from (
    select
      page.latest_submitted_at as sort_at,
      page.id as sort_id,
      row_number() over (order by page.latest_submitted_at, page.id) as position_in_page,
      jsonb_build_object(
        'observationId', page.id,
        'status', page.status,
        'studentName', student.display_name,
        'groupName', grouped.name,
        'sessionId', page.session_id,
        'sessionTitle', session_row.title,
        'commonName', latest.common_name,
        'scientificName', latest.scientific_name,
        'submissionNumber', latest.submission_number,
        'latestSubmittedAt', page.latest_submitted_at,
        'sameSpeciesInSession', page.same_species_in_session,
        'pendingUnlockRequest', exists (
          select 1 from public.observation_unlock_requests as request
          where request.observation_id = page.id and request.status = 'pending'
        ),
        'openReportCount', (
          select count(*) from public.observation_issue_reports as report
          where report.observation_id = page.id and report.status in ('open', 'reviewing')
        ),
        'thumbnailPath', (
          select media.storage_path
          from public.observation_submission_media as submitted
          join public.observation_media as media on media.id = submitted.media_id
          where submitted.submission_id = latest.id
          order by (submitted.category = 'whole_plant') desc, submitted.position
          limit 1
        )
      ) as item
    from page
    join public.profiles as student on student.id = page.observer_id
    join public.exploration_sessions as session_row on session_row.id = page.session_id
    left join public.exploration_session_groups as session_group on session_group.id = page.session_group_id
    left join public.groups as grouped on grouped.id = session_group.group_id
    join lateral (
      select submission.* from public.observation_submissions as submission
      where submission.observation_id = page.id
      order by submission.submission_number desc limit 1
    ) as latest on true
  ) as rows;

  return jsonb_build_object(
    'items', items,
    'nextCursor', case when has_more then (
      select jsonb_build_object('submittedAt', entry ->> 'latestSubmittedAt', 'observationId', entry ->> 'observationId')
      from jsonb_array_elements(items) with ordinality as elements(entry, ordinality)
      order by ordinality desc limit 1
    ) else null end,
    'counts', (
      select jsonb_build_object(
        'pending', count(*) filter (where observation.status in ('submitted', 'resubmitted', 'teacher_review')),
        'resubmitted', count(*) filter (where observation.status = 'resubmitted'),
        'sameSpecies', count(*) filter (where observation.status in ('submitted', 'resubmitted', 'teacher_review')
          and observation.same_species_in_session),
        'verified', count(*) filter (where observation.status = 'verified'),
        'revisionRequired', count(*) filter (where observation.status = 'revision_required')
      )
      from public.observations as observation
      where observation.class_id = target_class_id and observation.first_submitted_at is not null
        and (target_session_id is null or observation.session_id = target_session_id)
    ),
    'refreshedAt', now()
  );
end;
$$;

-- The owner's revision view: the latest review, open topics, and requests.
create function public.get_observation_revision_state(target_observation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  denial record;
  session_row public.exploration_sessions%rowtype;
  latest_review public.teacher_reviews%rowtype;
  open_topics text[];
  changed text[];
begin
  actor_profile := private.require_active_verified_actor();
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null
    or observation_row.observer_id <> actor_profile.id
    or not private.is_active_class_student(actor_profile.id, observation_row.class_id)
    or observation_row.first_submitted_at is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into denial from private.observation_revision_denial(observation_row.id);
  select * into session_row from public.exploration_sessions as candidate where candidate.id = observation_row.session_id;
  select * into latest_review from public.teacher_reviews as review where review.id = observation_row.latest_review_id;
  open_topics := private.open_revision_topics(observation_row.id);
  changed := case when observation_row.status = 'revision_required'
    then private.revision_changed_topics(observation_row.id) else array[]::text[] end;

  return jsonb_build_object(
    'observationId', observation_row.id,
    'status', observation_row.status,
    'version', observation_row.version,
    'submissionCount', observation_row.submission_count,
    'current', jsonb_build_object(
      'commonName', observation_row.student_common_name,
      'scientificName', observation_row.student_scientific_name,
      'evidenceNote', observation_row.student_evidence_note,
      'referenceNote', observation_row.student_reference_note,
      'traits', private.observation_review_payload(observation_row.id) -> 'traits'
    ),
    'verifiedIdentity', case when observation_row.verified_common_name is null then null else jsonb_build_object(
      'commonName', observation_row.verified_common_name,
      'scientificName', observation_row.verified_scientific_name) end,
    'latestReview', case when latest_review.id is null then null else jsonb_build_object(
      'id', latest_review.id,
      'decision', latest_review.decision,
      'feedback', latest_review.feedback,
      'verifiedCommonName', latest_review.verified_common_name,
      'verifiedScientificName', latest_review.verified_scientific_name,
      'correctedTraits', latest_review.corrected_traits,
      'reviewedAt', latest_review.reviewed_at,
      'submissionNumber', (select submission.submission_number from public.observation_submissions as submission
        where submission.id = latest_review.submission_id)
    ) end,
    'openTopics', to_jsonb(open_topics),
    'changedTopics', to_jsonb(changed),
    'readiness', jsonb_build_object(
      'blockers', to_jsonb(array_remove(private.observation_submit_blockers(observation_row.id), 'student_review'))
    ),
    'unlockRequests', coalesce((
      select jsonb_agg(entry) from jsonb_array_elements(private.observation_unlock_requests_payload(observation_row.id)) as entry
      where (entry ->> 'reviewId')::uuid = observation_row.latest_review_id
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canEdit', denial.code is null,
      'canResubmit', denial.code is null and session_row.status <> 'paused',
      'canRequestTopics', denial.code is null and cardinality(open_topics) < cardinality(private.revision_field_keys())
        and not exists (select 1 from public.observation_unlock_requests as request
          where request.observation_id = observation_row.id and request.status = 'pending'),
      'blockedCode', coalesce(denial.code, case when session_row.status = 'paused' then 'SESSION_PAUSED' end),
      'blockedReason', denial.reason
    ),
    'refreshedAt', now()
  );
end;
$$;

create function public.get_teacher_issue_report(target_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  report_row public.observation_issue_reports%rowtype;
begin
  actor_profile := private.require_active_verified_actor();
  select * into report_row from public.observation_issue_reports as report where report.id = target_report_id;
  if report_row.id is null or not private.is_active_class_teacher(actor_profile.id, report_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return jsonb_build_object(
    'id', report_row.id,
    'observationId', report_row.observation_id,
    'classId', report_row.class_id,
    'type', report_row.report_type,
    'reason', report_row.reason,
    'status', report_row.status,
    'reporterName', (select profile.display_name from public.profiles as profile where profile.id = report_row.reporter_id),
    'resolutionNote', report_row.resolution_note,
    'createdAt', report_row.created_at,
    'resolvedAt', report_row.resolved_at,
    'observation', (
      select jsonb_build_object('status', observation.status,
        'commonName', coalesce(observation.verified_common_name, submission.common_name),
        'scientificName', coalesce(observation.verified_scientific_name, submission.scientific_name),
        'studentName', owner.display_name)
      from public.observations as observation
      join public.profiles as owner on owner.id = observation.observer_id
      left join public.observation_submissions as submission
        on submission.id = private.latest_submission_id(observation.id)
      where observation.id = report_row.observation_id
    ),
    'refreshedAt', now()
  );
end;
$$;

-- Grants -------------------------------------------------------------------------------------

revoke execute on function private.notify_user(uuid, text, text, text, public.observations, uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.notify_class_teachers_about(public.observations, text, text, text, uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.record_observation_event(public.observations, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function private.lock_observation_for_teacher(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.latest_submission_id(uuid) from public, anon, authenticated;
revoke execute on function private.open_revision_topics(uuid) from public, anon, authenticated;
revoke execute on function private.observation_revision_denial(uuid) from public, anon, authenticated;
revoke execute on function private.revision_changed_topics(uuid) from public, anon, authenticated;
revoke execute on function private.observation_reviews_payload(uuid) from public, anon, authenticated;
revoke execute on function private.observation_unlock_requests_payload(uuid) from public, anon, authenticated;
revoke execute on function private.observation_history_payload(uuid) from public, anon, authenticated;

revoke execute on function public.begin_observation_review(uuid) from public, anon;
grant execute on function public.begin_observation_review(uuid) to authenticated;
revoke execute on function public.review_observation(uuid, uuid, text, text, text, jsonb, text, text[]) from public, anon;
grant execute on function public.review_observation(uuid, uuid, text, text, text, jsonb, text, text[]) to authenticated;
revoke execute on function public.save_observation_revision(uuid, integer, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_observation_revision(uuid, integer, text, text, text, text, jsonb) to authenticated;
revoke execute on function public.resubmit_observation(uuid, uuid, integer, boolean) from public, anon;
grant execute on function public.resubmit_observation(uuid, uuid, integer, boolean) to authenticated;
revoke execute on function public.request_additional_revision_fields(uuid, text[], text) from public, anon;
grant execute on function public.request_additional_revision_fields(uuid, text[], text) to authenticated;
revoke execute on function public.decide_revision_unlock_request(uuid, text, text[], text) from public, anon;
grant execute on function public.decide_revision_unlock_request(uuid, text, text[], text) to authenticated;
revoke execute on function public.report_observation_issue(uuid, text, text) from public, anon;
grant execute on function public.report_observation_issue(uuid, text, text) to authenticated;
revoke execute on function public.resolve_observation_issue_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_observation_issue_report(uuid, text, text) to authenticated;
revoke execute on function public.get_teacher_review_queue(uuid, uuid, text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.get_teacher_review_queue(uuid, uuid, text, integer, timestamptz, uuid) to authenticated;
revoke execute on function public.get_observation_revision_state(uuid) from public, anon;
grant execute on function public.get_observation_revision_state(uuid) to authenticated;
revoke execute on function public.get_teacher_issue_report(uuid) from public, anon;
grant execute on function public.get_teacher_issue_report(uuid) to authenticated;

commit;
