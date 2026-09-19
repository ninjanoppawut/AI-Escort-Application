begin;

-- P13: the completed activity map (MAP-001 to MAP-006, MAP-009; D-018,
-- D-019, D-026, D-027, D-051, D-055, D-068). Teachers of the class see every
-- submitted record at any time; the session's participant snapshot sees the
-- map once the teacher completes the session. Drafts never appear, peers never
-- see another student's rejected record or teacher feedback, and no live
-- location sample or track is ever read here.

-- Access ------------------------------------------------------------------------

-- The fixed participation snapshot (MAP-006): a participant row for the
-- session and a still-active class membership; the current group is not used.
create function private.is_completed_map_participant(target_session_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exploration_sessions as session_row
    join public.session_participants as participant
      on participant.session_id = session_row.id and participant.user_id = target_user_id
    where session_row.id = target_session_id
      and session_row.status = 'completed'
      and private.is_active_class_student(target_user_id, session_row.class_id)
  );
$$;

-- Whether a viewer may see one record on the completed map (D-068).
create function private.completed_map_record_visible(observation_row public.observations, viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select observation_row.first_submitted_at is not null
    and (
      private.is_active_class_teacher(viewer_id, observation_row.class_id)
      or (
        private.is_completed_map_participant(observation_row.session_id, viewer_id)
        and (observation_row.status <> 'rejected' or observation_row.observer_id = viewer_id)
      )
    );
$$;

-- Peers read submitted images of records they may see (D-055); drafts and
-- rejected records stay private.
create or replace function private.observation_media_object_readable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.observation_media as media
    join public.observations as observation on observation.id = media.observation_id
    where media.storage_path = object_name
      and (
        (media.observer_id = (select auth.uid())
          and (select private.current_user_is_class_student(media.class_id)))
        or (
          exists (
            select 1 from public.observation_submission_media as submitted
            where submitted.media_id = media.id
          )
          and (
            (select private.current_user_is_class_teacher(media.class_id))
            or private.completed_map_record_visible(observation, (select auth.uid()))
          )
        )
      )
  );
$$;

-- Read models ---------------------------------------------------------------------

create function public.get_session_completed_map(target_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  viewer_role text;
  item_limit constant integer := 500;
  items jsonb;
  total integer;
begin
  actor_profile := private.require_active_verified_actor();
  select * into session_row from public.exploration_sessions as candidate where candidate.id = target_session_id;
  if session_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if private.is_active_class_teacher(actor_profile.id, session_row.class_id) then
    viewer_role := 'teacher';
  elsif exists (
    select 1 from public.session_participants as participant
    where participant.session_id = session_row.id and participant.user_id = actor_profile.id
  ) and private.is_active_class_student(actor_profile.id, session_row.class_id) then
    viewer_role := 'participant';
  else
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  -- Participants wait for the teacher's manual completion (D-018, D-027).
  if viewer_role = 'participant' and session_row.status <> 'completed' then
    return jsonb_build_object(
      'sessionId', session_row.id,
      'viewerRole', viewer_role,
      'available', false,
      'session', jsonb_build_object('title', session_row.title, 'status', session_row.status),
      'refreshedAt', now()
    );
  end if;

  select
    coalesce(jsonb_agg(entry order by entry ->> 'capturedAt', entry ->> 'observationId')
      filter (where position_in_map <= item_limit), '[]'::jsonb),
    count(*)
  into items, total
  from (
    select
      row_number() over (order by observation.captured_at, observation.id) as position_in_map,
      jsonb_build_object(
        'observationId', observation.id,
        'status', observation.status,
        'lat', case when observation.location_status = 'captured'
          then round(extensions.st_y(observation.capture_location::extensions.geometry)::numeric, 6) end,
        'lng', case when observation.location_status = 'captured'
          then round(extensions.st_x(observation.capture_location::extensions.geometry)::numeric, 6) end,
        'accuracyM', observation.capture_accuracy_m,
        'locationStatus', observation.location_status,
        'capturedAt', observation.captured_at,
        'commonName', coalesce(observation.verified_common_name, latest.common_name),
        'scientificName', coalesce(observation.verified_scientific_name, latest.scientific_name),
        'verified', observation.verified_common_name is not null,
        'recorderName', recorder.display_name,
        'groupName', grouped.name,
        'isMine', observation.observer_id = actor_profile.id,
        'sameSpeciesInSession', observation.same_species_in_session,
        'thumbnailPath', (
          select media.storage_path
          from public.observation_submission_media as submitted
          join public.observation_media as media on media.id = submitted.media_id
          where submitted.submission_id = latest.id
          order by (submitted.category = 'whole_plant') desc, submitted.position
          limit 1
        )
      ) as entry
    from public.observations as observation
    join public.profiles as recorder on recorder.id = observation.observer_id
    left join public.exploration_session_groups as session_group on session_group.id = observation.session_group_id
    left join public.groups as grouped on grouped.id = session_group.group_id
    join lateral (
      select submission.* from public.observation_submissions as submission
      where submission.observation_id = observation.id
      order by submission.submission_number desc limit 1
    ) as latest on true
    where observation.session_id = session_row.id
      and private.completed_map_record_visible(observation, actor_profile.id)
  ) as visible;

  return jsonb_build_object(
    'sessionId', session_row.id,
    'classId', session_row.class_id,
    'viewerRole', viewer_role,
    'available', true,
    'session', jsonb_build_object(
      'title', session_row.title,
      'status', session_row.status,
      'completedAt', session_row.completed_at
    ),
    'activity', (
      select jsonb_build_object('id', version_row.activity_id, 'title', version_row.title)
      from public.activity_versions as version_row where version_row.id = session_row.activity_version_id
    ),
    'boundary', (
      select extensions.st_asgeojson(boundary.boundary::extensions.geometry)::jsonb
      from public.activity_boundaries as boundary
      where boundary.activity_version_id = session_row.activity_version_id
    ),
    'items', items,
    'total', total,
    'truncated', total > item_limit,
    'pendingReviewCount', case when viewer_role = 'teacher' then (
      select count(*) from public.observations as observation
      where observation.session_id = session_row.id
        and observation.status in ('submitted', 'resubmitted', 'teacher_review')
    ) end,
    'refreshedAt', now()
  );
end;
$$;

create function public.get_observation_map_detail(target_observation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
  latest public.observation_submissions%rowtype;
  latest_review public.teacher_reviews%rowtype;
  is_teacher boolean;
  is_owner boolean;
begin
  actor_profile := private.require_active_verified_actor();
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null or not private.completed_map_record_visible(observation_row, actor_profile.id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  is_teacher := private.is_active_class_teacher(actor_profile.id, observation_row.class_id);
  is_owner := observation_row.observer_id = actor_profile.id;

  select * into latest from public.observation_submissions as submission
  where submission.observation_id = observation_row.id
  order by submission.submission_number desc limit 1;
  select * into latest_review from public.teacher_reviews as review where review.id = observation_row.latest_review_id;

  return jsonb_build_object(
    'observationId', observation_row.id,
    'sessionId', observation_row.session_id,
    'status', observation_row.status,
    'viewer', jsonb_build_object(
      'role', case when is_teacher then 'teacher' else 'participant' end,
      'isOwner', is_owner,
      'canReport', not is_teacher and not is_owner
    ),
    'verified', case when observation_row.verified_common_name is null then null else jsonb_build_object(
      'commonName', observation_row.verified_common_name,
      'scientificName', observation_row.verified_scientific_name,
      'teacherName', (select profile.display_name from public.profiles as profile
        where profile.id = latest_review.reviewer_id and latest_review.decision = 'verified'),
      'verifiedAt', case when latest_review.decision = 'verified' then latest_review.reviewed_at end
    ) end,
    'student', jsonb_build_object(
      'commonName', latest.common_name,
      'scientificName', latest.scientific_name,
      'evidenceNote', latest.evidence_note,
      'referenceNote', latest.reference_note,
      'traits', coalesce(latest.verification_snapshot -> 'traits', '[]'::jsonb),
      'submissionNumber', latest.submission_number,
      'submittedAt', latest.submitted_at
    ),
    'recorder', jsonb_build_object(
      'name', (select profile.display_name from public.profiles as profile where profile.id = observation_row.observer_id),
      'groupName', (
        select grouped.name
        from public.exploration_session_groups as session_group
        join public.groups as grouped on grouped.id = session_group.group_id
        where session_group.id = observation_row.session_group_id
      )
    ),
    'capture', jsonb_build_object(
      'locationStatus', observation_row.location_status,
      'lat', case when observation_row.location_status = 'captured'
        then round(extensions.st_y(observation_row.capture_location::extensions.geometry)::numeric, 6) end,
      'lng', case when observation_row.location_status = 'captured'
        then round(extensions.st_x(observation_row.capture_location::extensions.geometry)::numeric, 6) end,
      'accuracyM', observation_row.capture_accuracy_m,
      'capturedAt', observation_row.captured_at
    ),
    -- Teacher feedback goes to the owner only (D-057).
    'feedback', case when is_teacher or is_owner then latest_review.feedback end,
    'relations', jsonb_build_object(
      'sameSpeciesInSession', observation_row.same_species_in_session,
      'sameSpeciesCount', observation_row.same_species_count,
      'possibleSameSpecimenCount', case when is_teacher then (
        select count(*) from public.observation_duplicate_candidates as candidate
        where candidate.relationship_type = 'possible_same_specimen'
          and (candidate.observation_id = observation_row.id or candidate.candidate_observation_id = observation_row.id)
      ) end
    ),
    'media', coalesce((
      select jsonb_agg(
        jsonb_build_object('mediaId', media.id, 'position', submitted.position, 'category', submitted.category,
          'width', media.width_px, 'height', media.height_px, 'storagePath', media.storage_path)
        order by submitted.position
      )
      from public.observation_submission_media as submitted
      join public.observation_media as media on media.id = submitted.media_id
      where submitted.submission_id = latest.id
    ), '[]'::jsonb),
    'refreshedAt', now()
  );
end;
$$;

revoke execute on function private.is_completed_map_participant(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.completed_map_record_visible(public.observations, uuid) from public, anon, authenticated;
revoke execute on function public.get_session_completed_map(uuid) from public, anon;
grant execute on function public.get_session_completed_map(uuid) to authenticated;
revoke execute on function public.get_observation_map_detail(uuid) from public, anon;
grant execute on function public.get_observation_map_detail(uuid) to authenticated;

commit;
