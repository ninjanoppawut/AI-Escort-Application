begin;

-- P11-05: teacher-only view of a submitted observation and teacher decisions on
-- possible same-specimen pairs. Decisions record judgment only: no observation
-- is merged, deleted, or changed (D-023, D-025, REV-006).

create function private.observation_relations_payload(target_observation_id uuid, viewer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'relationId', relation.id,
      'relationshipType', relation.relationship_type,
      'otherObservationId', other.id,
      'otherStudentName', other_profile.display_name,
      'otherCommonName', other.student_common_name,
      'otherScientificName', other.student_scientific_name,
      'otherCapturedAt', other.captured_at,
      'distanceM', relation.location_distance_m,
      'timeGapSeconds', relation.temporal_distance_seconds,
      'ruleVersion', relation.rule_version,
      'decision', relation.teacher_decision,
      'decidedAt', relation.decided_at,
      'canDecide', relation.relationship_type = 'possible_same_specimen'
        and private.is_active_class_teacher(viewer_id, relation.class_id)
    )
    order by relation.relationship_type, relation.created_at, relation.id
  ), '[]'::jsonb)
  from public.observation_duplicate_candidates as relation
  join public.observations as other
    on other.id = case
      when relation.observation_id = target_observation_id then relation.candidate_observation_id
      else relation.observation_id
    end
  join public.profiles as other_profile on other_profile.id = other.observer_id
  where relation.observation_id = target_observation_id
     or relation.candidate_observation_id = target_observation_id;
$$;

create function public.get_teacher_observation_review(target_observation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
begin
  actor_profile := private.require_active_verified_actor();

  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null
    or observation_row.first_submitted_at is null
    or not private.is_active_class_teacher(actor_profile.id, observation_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return jsonb_build_object(
    'observationId', observation_row.id,
    'classId', observation_row.class_id,
    'status', observation_row.status,
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
                'category', media.category,
                'width', media.width_px,
                'height', media.height_px,
                'storagePath', media.storage_path
              )
              order by media.position
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
    'refreshedAt', now()
  );
end;
$$;

create or replace function public.get_observation_related(target_observation_id uuid)
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
      select count(*) filter (where candidate.relationship_type = 'possible_same_specimen')
      into specimen_count
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

  if observation_row.first_submitted_at is not null
    and private.is_active_class_teacher(actor_profile.id, observation_row.class_id) then
    return jsonb_build_object(
      'basis', 'submitted', 'visibility', 'teacher',
      'sameSpeciesInSession', observation_row.same_species_in_session,
      'sameSpeciesCount', observation_row.same_species_count,
      'relations', private.observation_relations_payload(observation_row.id, actor_profile.id),
      'refreshedAt', now()
    );
  end if;

  raise exception using errcode = '42501', message = 'FORBIDDEN';
end;
$$;

create function public.decide_observation_relation(
  target_relation_id uuid,
  relation_decision text,
  expected_decision text
)
returns table(outcome text, error_code text, error_details jsonb, relation jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  relation_row public.observation_duplicate_candidates%rowtype;
  class_row public.classes%rowtype;
begin
  actor_profile := private.require_active_verified_actor();

  select * into relation_row
  from public.observation_duplicate_candidates as candidate
  where candidate.id = target_relation_id
  for update;

  if relation_row.id is null or not private.is_active_class_teacher(actor_profile.id, relation_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into class_row from public.classes as class where class.id = relation_row.class_id;
  if class_row.status <> 'active' then
    return query select 'denied'::text, 'CLASS_NOT_ACTIVE'::text, null::jsonb, null::jsonb;
    return;
  end if;

  if relation_row.relationship_type <> 'possible_same_specimen' then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
      jsonb_build_object('reason', 'not_specimen_candidate'), null::jsonb;
    return;
  end if;

  if relation_decision is null or relation_decision not in ('same_specimen', 'not_same_specimen') then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'decision'), null::jsonb;
    return;
  end if;

  if relation_row.teacher_decision is not distinct from relation_decision then
    return query select 'unchanged'::text, null::text, null::jsonb,
      jsonb_build_object('relationId', relation_row.id, 'decision', relation_row.teacher_decision);
    return;
  end if;

  if relation_row.teacher_decision is distinct from expected_decision then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
      jsonb_build_object(
        'reason', 'decision_changed',
        'relation', jsonb_build_object('relationId', relation_row.id, 'decision', relation_row.teacher_decision)
      ),
      null::jsonb;
    return;
  end if;

  update public.observation_duplicate_candidates as candidate
  set teacher_decision = relation_decision,
      decided_by = actor_profile.id,
      decided_at = now()
  where candidate.id = relation_row.id;

  insert into public.observation_relation_events (
    candidate_id, class_id, session_id, event_type, from_decision, to_decision, actor_id
  )
  values (
    relation_row.id, relation_row.class_id, relation_row.session_id,
    case when relation_row.teacher_decision is null then 'teacher_decided' else 'teacher_decision_changed' end,
    relation_row.teacher_decision, relation_decision, actor_profile.id
  );

  perform private.insert_audit_log(
    actor_profile.id, 'observation_relation_decided', 'observation_relation', relation_row.id,
    class_row.school_id, relation_row.class_id, 'succeeded',
    jsonb_build_object('decision', relation_decision)
  );

  return query select 'decided'::text, null::text, null::jsonb,
    jsonb_build_object('relationId', relation_row.id, 'decision', relation_decision);
end;
$$;

revoke execute on function private.observation_relations_payload(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.get_teacher_observation_review(uuid) from public, anon;
grant execute on function public.get_teacher_observation_review(uuid) to authenticated;
revoke execute on function public.decide_observation_relation(uuid, text, text) from public, anon;
grant execute on function public.decide_observation_relation(uuid, text, text) to authenticated;

commit;
