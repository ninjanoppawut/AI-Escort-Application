begin;

-- P9-03: deterministic register/confirm/delete of observation images and the
-- owner read model. Uploads go straight from the browser to Storage with the
-- student's JWT; these RPCs reserve the row, verify the stored object, and
-- withdraw it. Lock order: session share, group share, observation update,
-- media update (same as the P8 draft operations).

create function private.require_observation_owner_for_media(target_observation_id uuid)
returns public.observations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  observation_row public.observations%rowtype;
begin
  actor_profile := private.require_active_verified_actor();

  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null or observation_row.observer_id <> actor_profile.id then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

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

  return observation_row;
end;
$$;

create function private.observation_media_payload(target_media_id uuid)
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
    'upload', jsonb_build_object(
      'bucket', 'observation-images',
      'path', media.storage_path,
      'contentType', media.mime_type
    )
  )
  from public.observation_media as media
  where media.id = target_media_id;
$$;

-- Register -------------------------------------------------------------------------

create function public.register_observation_media(
  target_observation_id uuid,
  target_client_media_id uuid,
  media_category text,
  media_mime_type text,
  media_byte_size bigint,
  media_width integer,
  media_height integer,
  media_hash text,
  media_preprocessing_version text,
  media_captured_at timestamptz
)
returns table(outcome text, error_code text, error_details jsonb, media jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
  existing_row public.observation_media%rowtype;
  denial record;
  free_position integer;
  inserted_id uuid;
  class_row public.classes%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
begin
  observation_row := private.require_observation_owner_for_media(target_observation_id);

  if target_client_media_id is null then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'clientMediaId'), null::jsonb;
    return;
  end if;

  -- Idempotent replay before any state rule; category is not part of the key.
  select * into existing_row
  from public.observation_media as candidate
  where candidate.observer_id = observation_row.observer_id
    and candidate.client_media_id = target_client_media_id;

  if existing_row.id is not null then
    if existing_row.observation_id = observation_row.id
      and existing_row.mime_type = media_mime_type
      and existing_row.byte_size = media_byte_size
      and existing_row.width_px = media_width
      and existing_row.height_px = media_height
      and existing_row.image_hash = media_hash
      and existing_row.status <> 'deleting' then
      return query select 'existing'::text, null::text, null::jsonb, private.observation_media_payload(existing_row.id);
    else
      return query select 'denied'::text, 'IDEMPOTENCY_KEY_REUSE'::text, null::jsonb, null::jsonb;
    end if;
    return;
  end if;

  select * into denial from private.observation_media_edit_denial(observation_row.id);
  if denial.code is not null then
    return query select 'denied'::text, denial.code, jsonb_build_object('reason', denial.reason), null::jsonb;
    return;
  end if;

  if media_mime_type is null or media_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    return query select 'denied'::text, 'INVALID_IMAGE_TYPE'::text, null::jsonb, null::jsonb;
    return;
  end if;
  if media_byte_size is null or media_byte_size <= 0 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'byteSize'), null::jsonb;
    return;
  end if;
  if media_byte_size > 5242880 then
    return query select 'denied'::text, 'IMAGE_TOO_LARGE'::text, jsonb_build_object('reason', 'bytes'), null::jsonb;
    return;
  end if;
  if media_width is null or media_height is null or media_width < 1 or media_height < 1 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'dimensions'), null::jsonb;
    return;
  end if;
  if media_width > 2048 or media_height > 2048 then
    return query select 'denied'::text, 'IMAGE_TOO_LARGE'::text, jsonb_build_object('reason', 'dimensions'), null::jsonb;
    return;
  end if;
  if media_category is null or media_category not in (
    'whole_plant', 'leaf', 'leaf_underside', 'stem_trunk', 'flower', 'fruit', 'habitat', 'other'
  ) then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'category'), null::jsonb;
    return;
  end if;
  if media_hash is null or media_hash !~ '^[0-9a-f]{64}$' then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'sha256'), null::jsonb;
    return;
  end if;
  if media_preprocessing_version is null or media_preprocessing_version !~ '^img-v[0-9]+$' then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'preprocessingVersion'), null::jsonb;
    return;
  end if;
  if media_captured_at is null
    or media_captured_at < observation_row.captured_at - interval '15 minutes'
    or media_captured_at > now() + interval '120 seconds' then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'capturedAt'), null::jsonb;
    return;
  end if;

  -- Lowest free position; the partial unique index enforces at most ten.
  select candidate_position into free_position
  from generate_series(1, 10) as candidate_position
  where not exists (
    select 1 from public.observation_media as media
    where media.observation_id = observation_row.id
      and media.position = candidate_position
      and media.status <> 'deleting'
  )
  order by candidate_position
  limit 1;

  if free_position is null then
    return query select 'denied'::text, 'IMAGE_LIMIT_EXCEEDED'::text, jsonb_build_object('maxImages', 10), null::jsonb;
    return;
  end if;

  insert into public.observation_media (
    client_media_id, observation_id, observer_id, class_id, session_id, position, category,
    mime_type, byte_size, width_px, height_px, image_hash, preprocessing_version, captured_at
  )
  values (
    target_client_media_id, observation_row.id, observation_row.observer_id, observation_row.class_id,
    observation_row.session_id, free_position, media_category, media_mime_type, media_byte_size,
    media_width, media_height, media_hash, media_preprocessing_version, media_captured_at
  )
  on conflict (observer_id, client_media_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select * into existing_row
    from public.observation_media as candidate
    where candidate.observer_id = observation_row.observer_id
      and candidate.client_media_id = target_client_media_id;
    if existing_row.observation_id = observation_row.id and existing_row.image_hash = media_hash then
      return query select 'existing'::text, null::text, null::jsonb, private.observation_media_payload(existing_row.id);
    else
      return query select 'denied'::text, 'IDEMPOTENCY_KEY_REUSE'::text, null::jsonb, null::jsonb;
    end if;
    return;
  end if;

  select * into class_row from public.classes as class where class.id = observation_row.class_id;
  select * into session_group_row
  from public.exploration_session_groups as session_group
  where session_group.id = observation_row.session_group_id;

  insert into public.research_events (
    event_name, schema_version, actor_id, school_id, class_id, activity_id, session_id,
    group_id, observation_id, occurred_at, payload
  )
  values (
    'photo_captured', 1, observation_row.observer_id, class_row.school_id, observation_row.class_id,
    observation_row.activity_id, observation_row.session_id, session_group_row.group_id,
    observation_row.id, media_captured_at,
    jsonb_build_object(
      'category', media_category, 'processed_bytes', media_byte_size,
      'width', media_width, 'height', media_height
    )
  );

  return query select 'created'::text, null::text, null::jsonb, private.observation_media_payload(inserted_id);
end;
$$;

-- Confirm upload ---------------------------------------------------------------------

create function public.complete_observation_media_upload(
  target_observation_id uuid,
  target_media_id uuid,
  attempt_count integer
)
returns table(outcome text, error_code text, error_details jsonb, media jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
  media_row public.observation_media%rowtype;
  object_row storage.objects%rowtype;
  class_row public.classes%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
begin
  observation_row := private.require_observation_owner_for_media(target_observation_id);

  select * into media_row
  from public.observation_media as candidate
  where candidate.id = target_media_id and candidate.observation_id = observation_row.id
  for update;

  if media_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if media_row.status = 'uploaded' then
    return query select 'existing'::text, null::text, null::jsonb, private.observation_media_payload(media_row.id);
    return;
  end if;

  if media_row.status = 'deleting' then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, jsonb_build_object('reason', 'media_deleting'), null::jsonb;
    return;
  end if;

  if attempt_count is null or attempt_count < 1 or attempt_count > 50 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'attemptCount'), null::jsonb;
    return;
  end if;

  select * into object_row
  from storage.objects as object
  where object.bucket_id = 'observation-images'
    and object.name = media_row.storage_path;

  if object_row.id is null or object_row.owner_id is distinct from media_row.observer_id::text then
    return query select 'denied'::text, 'IMAGE_UPLOAD_INCOMPLETE'::text, jsonb_build_object('reason', 'missing'), null::jsonb;
    return;
  end if;

  if (object_row.metadata ->> 'size')::bigint is distinct from media_row.byte_size
    or (object_row.metadata ->> 'mimetype') is distinct from media_row.mime_type then
    return query select 'denied'::text, 'IMAGE_UPLOAD_INCOMPLETE'::text, jsonb_build_object('reason', 'mismatch'), null::jsonb;
    return;
  end if;

  update public.observation_media as media
  set status = 'uploaded',
      uploaded_at = now(),
      upload_attempt_count = attempt_count
  where media.id = media_row.id;

  select * into class_row from public.classes as class where class.id = observation_row.class_id;
  select * into session_group_row
  from public.exploration_session_groups as session_group
  where session_group.id = observation_row.session_group_id;

  insert into public.research_events (
    event_name, schema_version, actor_id, school_id, class_id, activity_id, session_id,
    group_id, observation_id, occurred_at, payload
  )
  values (
    'image_uploaded', 1, observation_row.observer_id, class_row.school_id, observation_row.class_id,
    observation_row.activity_id, observation_row.session_id, session_group_row.group_id,
    observation_row.id, now(),
    jsonb_build_object(
      'category', media_row.category, 'processed_bytes', media_row.byte_size,
      'attempt_count', attempt_count
    )
  );

  return query select 'uploaded'::text, null::text, null::jsonb, private.observation_media_payload(media_row.id);
end;
$$;

-- Delete (two steps: withdraw, then remove the row once the object is gone) ------

create function public.delete_observation_media(
  target_observation_id uuid,
  target_media_id uuid
)
returns table(outcome text, error_code text, error_details jsonb, media jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
  media_row public.observation_media%rowtype;
  denial record;
begin
  observation_row := private.require_observation_owner_for_media(target_observation_id);

  select * into media_row
  from public.observation_media as candidate
  where candidate.id = target_media_id and candidate.observation_id = observation_row.id
  for update;

  if media_row.id is null then
    return query select 'deleted'::text, null::text, null::jsonb, null::jsonb;
    return;
  end if;

  if media_row.status <> 'deleting' then
    select * into denial from private.observation_media_edit_denial(observation_row.id);
    if denial.code is not null then
      return query select 'denied'::text, denial.code, jsonb_build_object('reason', denial.reason), null::jsonb;
      return;
    end if;
  end if;

  if not exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'observation-images' and object.name = media_row.storage_path
  ) then
    if media_row.status = 'uploaded' then
      update public.observation_media as media set status = 'deleting' where media.id = media_row.id;
    end if;
    delete from public.observation_media as media where media.id = media_row.id;
    return query select 'deleted'::text, null::text, null::jsonb, null::jsonb;
    return;
  end if;

  if media_row.status <> 'deleting' then
    update public.observation_media as media set status = 'deleting' where media.id = media_row.id;
  end if;

  return query select 'deleting'::text, null::text, null::jsonb, private.observation_media_payload(media_row.id);
end;
$$;

-- Category change ----------------------------------------------------------------------

create function public.update_observation_media_category(
  target_observation_id uuid,
  target_media_id uuid,
  media_category text
)
returns table(outcome text, error_code text, error_details jsonb, media jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
  media_row public.observation_media%rowtype;
  denial record;
begin
  observation_row := private.require_observation_owner_for_media(target_observation_id);

  select * into media_row
  from public.observation_media as candidate
  where candidate.id = target_media_id and candidate.observation_id = observation_row.id
  for update;

  if media_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if media_row.status = 'deleting' then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, jsonb_build_object('reason', 'media_deleting'), null::jsonb;
    return;
  end if;

  select * into denial from private.observation_media_edit_denial(observation_row.id);
  if denial.code is not null then
    return query select 'denied'::text, denial.code, jsonb_build_object('reason', denial.reason), null::jsonb;
    return;
  end if;

  if media_category is null or media_category not in (
    'whole_plant', 'leaf', 'leaf_underside', 'stem_trunk', 'flower', 'fruit', 'habitat', 'other'
  ) then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'category'), null::jsonb;
    return;
  end if;

  if media_row.category = media_category then
    return query select 'unchanged'::text, null::text, null::jsonb, private.observation_media_payload(media_row.id);
    return;
  end if;

  update public.observation_media as media set category = media_category where media.id = media_row.id;
  return query select 'updated'::text, null::text, null::jsonb, private.observation_media_payload(media_row.id);
end;
$$;

-- Owner read model -------------------------------------------------------------------------

create function public.list_observation_media(target_observation_id uuid)
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
  live_count integer;
begin
  actor_profile := private.require_active_verified_actor();

  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  if observation_row.id is null
    or observation_row.observer_id <> actor_profile.id
    or not private.is_active_class_student(actor_profile.id, observation_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into denial from private.observation_media_edit_denial(observation_row.id);
  select count(*) into live_count
  from public.observation_media as media
  where media.observation_id = observation_row.id and media.status <> 'deleting';

  return jsonb_build_object(
    'observationId', observation_row.id,
    'permissions', jsonb_build_object(
      'canEdit', denial.code is null,
      'blockedCode', denial.code,
      'blockedReason', denial.reason
    ),
    'limits', jsonb_build_object('maxImages', 10, 'remaining', greatest(10 - live_count, 0)),
    'summary', jsonb_build_object(
      'uploadedCount', (select count(*) from public.observation_media as media where media.observation_id = observation_row.id and media.status = 'uploaded'),
      'pendingCount', (select count(*) from public.observation_media as media where media.observation_id = observation_row.id and media.status = 'pending'),
      'hasWholePlant', exists (
        select 1 from public.observation_media as media
        where media.observation_id = observation_row.id and media.status = 'uploaded' and media.category = 'whole_plant'
      )
    ),
    'items', coalesce((
      select jsonb_agg(private.observation_media_payload(media.id) order by media.position, media.created_at)
      from public.observation_media as media
      where media.observation_id = observation_row.id
    ), '[]'::jsonb),
    'refreshedAt', now()
  );
end;
$$;

-- Grants -----------------------------------------------------------------------------------

revoke execute on function private.require_observation_owner_for_media(uuid) from public, anon, authenticated;
revoke execute on function private.observation_media_payload(uuid) from public, anon, authenticated;

revoke execute on function public.register_observation_media(uuid, uuid, text, text, bigint, integer, integer, text, text, timestamptz) from public, anon;
grant execute on function public.register_observation_media(uuid, uuid, text, text, bigint, integer, integer, text, text, timestamptz) to authenticated;
revoke execute on function public.complete_observation_media_upload(uuid, uuid, integer) from public, anon;
grant execute on function public.complete_observation_media_upload(uuid, uuid, integer) to authenticated;
revoke execute on function public.delete_observation_media(uuid, uuid) from public, anon;
grant execute on function public.delete_observation_media(uuid, uuid) to authenticated;
revoke execute on function public.update_observation_media_category(uuid, uuid, text) from public, anon;
grant execute on function public.update_observation_media_category(uuid, uuid, text) to authenticated;
revoke execute on function public.list_observation_media(uuid) from public, anon;
grant execute on function public.list_observation_media(uuid) to authenticated;

commit;
