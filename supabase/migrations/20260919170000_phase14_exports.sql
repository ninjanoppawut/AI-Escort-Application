begin;

-- P14-03/P14-04: authorized CSV/GeoJSON exports of submitted records with a
-- stable versioned schema (export-v1, D-069), idempotent requests, a
-- SKIP LOCKED claim so one worker generates each file, a private
-- `activity-exports` bucket, `export_ready` only after commit, reauthorized
-- downloads, and a seven-day expiry (D-064). Drafts, live-location samples,
-- tracks, and emails never enter an export (MAP-007 to MAP-009).

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete cascade,
  session_id uuid not null references public.exploration_sessions (id) on delete cascade,
  export_type text not null,
  schema_version text not null default 'export-v1',
  status text not null default 'queued',
  idempotency_key uuid not null,
  request_payload jsonb not null,
  storage_path text,
  row_count integer,
  byte_size bigint,
  failure_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  constraint exports_type_check check (export_type in ('csv', 'geojson', 'research_csv')),
  constraint exports_status_check check (status in ('queued', 'running', 'ready', 'failed', 'expired')),
  constraint exports_idempotency_unique unique (requested_by, idempotency_key),
  constraint exports_payload_check check (jsonb_typeof(request_payload) = 'object'),
  constraint exports_ready_check check (
    (status = 'ready') = (storage_path is not null and completed_at is not null and row_count is not null)
  ),
  constraint exports_failure_check check ((status = 'failed') = (failure_code is not null))
);

create index exports_requester_created_idx on public.exports (requested_by, created_at desc, id desc);
create index exports_queue_idx on public.exports (created_at, id) where status = 'queued';
create index exports_class_idx on public.exports (class_id);
create index exports_session_idx on public.exports (session_id);

alter table public.exports enable row level security;
revoke all on table public.exports from public, anon, authenticated;
grant select on table public.exports to authenticated;

-- The requester reads their own exports while still teaching the class.
create policy exports_select_requester
on public.exports
for select
to authenticated
using (
  requested_by = (select auth.uid())
  and (select private.current_user_is_class_teacher(class_id))
);

create function private.guard_export_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'APPEND_ONLY';
  end if;
  if (new.id, new.requested_by, new.class_id, new.session_id, new.export_type, new.schema_version,
      new.idempotency_key, new.request_payload, new.created_at)
    is distinct from
     (old.id, old.requested_by, old.class_id, old.session_id, old.export_type, old.schema_version,
      old.idempotency_key, old.request_payload, old.created_at)
    or (old.status, new.status) not in (
      ('queued', 'queued'), ('queued', 'running'), ('running', 'running'), ('running', 'ready'),
      ('running', 'failed'), ('queued', 'failed'), ('ready', 'ready'), ('ready', 'expired'),
      ('failed', 'failed'), ('expired', 'expired'), ('running', 'queued')
    ) then
    raise exception using errcode = '42501', message = 'EXPORT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger exports_guard
before update or delete on public.exports
for each row execute function private.guard_export_update();

-- Private bucket for export artifacts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-exports', 'activity-exports', false, 20971520,
  array['text/csv', 'application/geo+json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Objects live at {class_id}/{session_id}/{export_id}.{csv|geojson}; access
-- comes from the export row, never from the path.
create function private.export_object_writable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exports as export_row
    where export_row.status = 'running'
      and export_row.requested_by = (select auth.uid())
      and private.is_active_class_teacher(export_row.requested_by, export_row.class_id)
      and object_name = export_row.class_id::text || '/' || export_row.session_id::text || '/'
        || export_row.id::text || case export_row.export_type when 'geojson' then '.geojson' else '.csv' end
  );
$$;

create function private.export_object_readable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exports as export_row
    where export_row.status = 'ready'
      and export_row.expires_at > now()
      and export_row.storage_path = object_name
      and export_row.requested_by = (select auth.uid())
      and private.is_active_class_teacher(export_row.requested_by, export_row.class_id)
  );
$$;

create policy activity_exports_select_requester
on storage.objects
for select
to authenticated
using (bucket_id = 'activity-exports' and (select private.export_object_readable(name)));

create policy activity_exports_insert_running
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'activity-exports'
  and owner_id = (select auth.uid())::text
  and private.export_object_writable(name)
);

create policy activity_exports_update_running
on storage.objects
for update
to authenticated
using (bucket_id = 'activity-exports' and private.export_object_writable(name))
with check (
  bucket_id = 'activity-exports'
  and owner_id = (select auth.uid())::text
  and private.export_object_writable(name)
);

-- Scope rows (export-v1) ------------------------------------------------------------

create function private.export_statuses(filters jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when filters ? 'statuses' then array(select jsonb_array_elements_text(filters -> 'statuses'))
    else array['submitted', 'teacher_review', 'revision_required', 'resubmitted', 'verified',
      'unable_to_verify', 'rejected']
  end;
$$;

create function private.export_scope_count(target_session_id uuid, filters jsonb)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.observations as observation
  where observation.session_id = target_session_id
    and observation.first_submitted_at is not null
    and observation.status = any (private.export_statuses(filters));
$$;

-- Requests ------------------------------------------------------------------------

create function public.request_export(
  target_class_id uuid,
  target_session_id uuid,
  requested_type text,
  requested_filters jsonb,
  request_idempotency_key uuid
)
returns table(outcome text, error_code text, error_details jsonb, export_id uuid, export_status text, row_estimate integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  existing public.exports%rowtype;
  filters jsonb := coalesce(requested_filters, '{}'::jsonb);
  payload jsonb;
  estimate integer;
  new_export_id uuid;
  allowed_statuses constant text[] := array['submitted', 'teacher_review', 'revision_required', 'resubmitted',
    'verified', 'unable_to_verify', 'rejected'];
begin
  actor_profile := private.require_active_verified_actor();

  if request_idempotency_key is null then
    return query select 'denied'::text, 'IDEMPOTENCY_KEY_REQUIRED'::text, null::jsonb, null::uuid, null::text, null::integer;
    return;
  end if;

  select * into session_row from public.exploration_sessions as candidate where candidate.id = target_session_id;
  if session_row.id is null or session_row.class_id is distinct from target_class_id
    or not private.is_active_class_teacher(actor_profile.id, target_class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into class_row from public.classes as class where class.id = target_class_id;
  if class_row.status <> 'active' then
    return query select 'denied'::text, 'CLASS_NOT_ACTIVE'::text, null::jsonb, null::uuid, null::text, null::integer;
    return;
  end if;

  -- research_csv waits for the approved study fields (DEC-Q005, P14-05A).
  if requested_type is null or requested_type not in ('csv', 'geojson') then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'type'),
      null::uuid, null::text, null::integer;
    return;
  end if;
  if jsonb_typeof(filters) <> 'object'
    or exists (select 1 from jsonb_object_keys(filters) as key where key <> 'statuses')
    or (filters ? 'statuses' and (
      jsonb_typeof(filters -> 'statuses') <> 'array'
      or jsonb_array_length(filters -> 'statuses') not between 1 and 7
      or exists (
        select 1 from jsonb_array_elements(filters -> 'statuses') as item
        where jsonb_typeof(item) <> 'string' or not ((item #>> '{}') = any (allowed_statuses))
      )
    )) then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, jsonb_build_object('field', 'filters'),
      null::uuid, null::text, null::integer;
    return;
  end if;

  payload := jsonb_build_object('classId', target_class_id, 'sessionId', target_session_id,
    'type', requested_type, 'filters', filters);

  select * into existing from public.exports as export_row
  where export_row.requested_by = actor_profile.id and export_row.idempotency_key = request_idempotency_key;
  if existing.id is not null then
    if existing.request_payload = payload then
      return query select 'existing'::text, null::text, null::jsonb, existing.id, existing.status, existing.row_count;
    else
      return query select 'denied'::text, 'IDEMPOTENCY_KEY_REUSE'::text, null::jsonb, null::uuid, null::text, null::integer;
    end if;
    return;
  end if;

  estimate := private.export_scope_count(target_session_id, filters);

  insert into public.exports (requested_by, class_id, session_id, export_type, idempotency_key, request_payload)
  values (actor_profile.id, target_class_id, target_session_id, requested_type, request_idempotency_key, payload)
  on conflict (requested_by, idempotency_key) do nothing
  returning id into new_export_id;

  if new_export_id is null then
    select * into existing from public.exports as export_row
    where export_row.requested_by = actor_profile.id and export_row.idempotency_key = request_idempotency_key;
    return query select 'existing'::text, null::text, null::jsonb, existing.id, existing.status, existing.row_count;
    return;
  end if;

  insert into public.research_events (
    event_name, schema_version, actor_id, school_id, class_id, activity_id, session_id, occurred_at, payload
  )
  values (
    'export_requested', 1, actor_profile.id, class_row.school_id, target_class_id,
    (select version_row.activity_id from public.activity_versions as version_row
      where version_row.id = session_row.activity_version_id),
    target_session_id, now(),
    jsonb_build_object('export_type', requested_type,
      'filter_count', case when filters ? 'statuses' then jsonb_array_length(filters -> 'statuses') else 0 end)
  );

  return query select 'requested'::text, null::text, null::jsonb, new_export_id, 'queued'::text, estimate;
end;
$$;

-- Worker claim: one caller moves a queued export to running (SKIP LOCKED). The
-- requester's session is the worker here; a scheduled worker uses the same RPC.
create function public.claim_export(target_export_id uuid)
returns table(outcome text, export_type text, class_id uuid, session_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  export_row public.exports%rowtype;
begin
  actor_profile := private.require_active_verified_actor();

  select * into export_row from public.exports as candidate
  where candidate.id = target_export_id
  for update skip locked;

  if export_row.id is null then
    -- Held by another worker, or missing: report without waiting.
    if exists (select 1 from public.exports as candidate where candidate.id = target_export_id
      and candidate.requested_by = actor_profile.id) then
      return query select 'busy'::text, null::text, null::uuid, null::uuid, null::text;
      return;
    end if;
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if export_row.requested_by <> actor_profile.id
    or not private.is_active_class_teacher(actor_profile.id, export_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if export_row.status <> 'queued' then
    return query select export_row.status, export_row.export_type, export_row.class_id, export_row.session_id,
      export_row.storage_path;
    return;
  end if;

  update public.exports as candidate
  set status = 'running', started_at = now()
  where candidate.id = export_row.id;

  return query select 'claimed'::text, export_row.export_type, export_row.class_id, export_row.session_id,
    export_row.class_id::text || '/' || export_row.session_id::text || '/' || export_row.id::text
      || case export_row.export_type when 'geojson' then '.geojson' else '.csv' end;
end;
$$;

-- The rows of a running export, reauthorized at generation (export-v1).
create function public.export_rows(target_export_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  export_row public.exports%rowtype;
  row_limit constant integer := 5000;
  rows_json jsonb;
begin
  actor_profile := private.require_active_verified_actor();
  select * into export_row from public.exports as candidate where candidate.id = target_export_id;
  if export_row.id is null or export_row.requested_by <> actor_profile.id
    or export_row.status <> 'running'
    or not private.is_active_class_teacher(actor_profile.id, export_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'captured_at', entry ->> 'observation_id'), '[]'::jsonb)
  into rows_json
  from (
    select jsonb_build_object(
      'schema_version', 'export-v1',
      'observation_id', observation.id,
      'status', observation.status,
      'submission_number', latest.submission_number,
      'submitted_at', latest.submitted_at,
      'captured_at', observation.captured_at,
      'location_status', observation.location_status,
      'latitude', case when observation.location_status = 'captured'
        then round(extensions.st_y(observation.capture_location::extensions.geometry)::numeric, 6) end,
      'longitude', case when observation.location_status = 'captured'
        then round(extensions.st_x(observation.capture_location::extensions.geometry)::numeric, 6) end,
      'accuracy_m', observation.capture_accuracy_m,
      'location_source', 'capture',
      'student_common_name', latest.common_name,
      'student_scientific_name', latest.scientific_name,
      'identity_source', latest.identity_source,
      'evidence_note', latest.evidence_note,
      'verified_common_name', observation.verified_common_name,
      'verified_scientific_name', observation.verified_scientific_name,
      'review_decision', review.decision,
      'reviewed_at', review.reviewed_at,
      'same_species_in_session', observation.same_species_in_session,
      'recorder_name', recorder.display_name,
      'group_name', grouped.name,
      'image_count', jsonb_array_length(latest.media_snapshot)
    ) as entry
    from public.observations as observation
    join public.profiles as recorder on recorder.id = observation.observer_id
    left join public.exploration_session_groups as session_group on session_group.id = observation.session_group_id
    left join public.groups as grouped on grouped.id = session_group.group_id
    left join public.teacher_reviews as review on review.id = observation.latest_review_id
    join lateral (
      select submission.* from public.observation_submissions as submission
      where submission.observation_id = observation.id
      order by submission.submission_number desc limit 1
    ) as latest on true
    where observation.session_id = export_row.session_id
      and observation.first_submitted_at is not null
      and observation.status = any (private.export_statuses(export_row.request_payload -> 'filters'))
    order by observation.captured_at, observation.id
    limit row_limit
  ) as scoped;

  return jsonb_build_object(
    'exportId', export_row.id,
    'type', export_row.export_type,
    'schemaVersion', export_row.schema_version,
    'rows', rows_json,
    'truncated', private.export_scope_count(export_row.session_id, export_row.request_payload -> 'filters') > row_limit
  );
end;
$$;

create function public.finish_export(
  target_export_id uuid,
  export_succeeded boolean,
  result_row_count integer,
  result_byte_size bigint,
  result_failure_code text
)
returns table(outcome text, export_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  export_row public.exports%rowtype;
  class_row public.classes%rowtype;
  expected_path text;
begin
  actor_profile := private.require_active_verified_actor();
  select * into export_row from public.exports as candidate where candidate.id = target_export_id for update;
  if export_row.id is null or export_row.requested_by <> actor_profile.id
    or not private.is_active_class_teacher(actor_profile.id, export_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if export_row.status in ('ready', 'failed') then
    return query select 'unchanged'::text, export_row.status;
    return;
  end if;
  if export_row.status <> 'running' then
    raise exception using errcode = '23514', message = 'INVALID_STATUS_TRANSITION';
  end if;

  if not coalesce(export_succeeded, false) then
    update public.exports as candidate
    set status = 'failed', failure_code = coalesce(nullif(result_failure_code, ''), 'generation_failed'),
        completed_at = now()
    where candidate.id = export_row.id;
    return query select 'failed'::text, 'failed'::text;
    return;
  end if;

  expected_path := export_row.class_id::text || '/' || export_row.session_id::text || '/' || export_row.id::text
    || case export_row.export_type when 'geojson' then '.geojson' else '.csv' end;
  if not exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'activity-exports' and object.name = expected_path
  ) or result_row_count is null or result_row_count < 0 then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;

  update public.exports as candidate
  set status = 'ready', storage_path = expected_path, row_count = result_row_count,
      byte_size = result_byte_size, completed_at = now()
  where candidate.id = export_row.id;

  select * into class_row from public.classes as class where class.id = export_row.class_id;
  insert into public.research_events (
    event_name, schema_version, actor_id, school_id, class_id, session_id, occurred_at, payload
  )
  values (
    'export_completed', 1, actor_profile.id, class_row.school_id, export_row.class_id, export_row.session_id, now(),
    jsonb_build_object('export_type', export_row.export_type, 'row_count', result_row_count,
      'duration_ms', greatest(0, floor(extract(epoch from (now() - coalesce(export_row.started_at, now()))) * 1000))::bigint)
  );

  -- In the same transaction as the ready status: delivered only on commit.
  insert into public.notifications (
    recipient_id, type, title, message, entity_type, entity_id, payload, class_id, session_id, export_id, actor_id
  )
  values (
    export_row.requested_by, 'export_ready', 'ไฟล์ส่งออกพร้อมแล้ว',
    'ไฟล์ส่งออก ' || upper(export_row.export_type) || ' พร้อมดาวน์โหลดแล้ว',
    'export', export_row.id,
    jsonb_build_object('exportId', export_row.id, 'exportType', export_row.export_type, 'rowCount', result_row_count),
    export_row.class_id, export_row.session_id, export_row.id, actor_profile.id
  );

  return query select 'ready'::text, 'ready'::text;
end;
$$;

-- Status read model; an elapsed export reads as expired.
create function public.get_export(target_export_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  export_row public.exports%rowtype;
begin
  actor_profile := private.require_active_verified_actor();
  select * into export_row from public.exports as candidate where candidate.id = target_export_id;
  if export_row.id is null or export_row.requested_by <> actor_profile.id
    or not private.is_active_class_teacher(actor_profile.id, export_row.class_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return jsonb_build_object(
    'id', export_row.id,
    'classId', export_row.class_id,
    'sessionId', export_row.session_id,
    'sessionTitle', (select session_row.title from public.exploration_sessions as session_row
      where session_row.id = export_row.session_id),
    'type', export_row.export_type,
    'schemaVersion', export_row.schema_version,
    'status', case when export_row.status = 'ready' and export_row.expires_at <= now() then 'expired'
      else export_row.status end,
    'filters', export_row.request_payload -> 'filters',
    'rowCount', export_row.row_count,
    'byteSize', export_row.byte_size,
    'failureCode', export_row.failure_code,
    'createdAt', export_row.created_at,
    'completedAt', export_row.completed_at,
    'expiresAt', export_row.expires_at,
    'storagePath', case when export_row.status = 'ready' and export_row.expires_at > now()
      then export_row.storage_path end,
    'refreshedAt', now()
  );
end;
$$;

revoke execute on function private.guard_export_update() from public, anon, authenticated;
revoke execute on function private.export_object_writable(text) from public, anon;
revoke execute on function private.export_object_readable(text) from public, anon;
grant execute on function private.export_object_writable(text) to authenticated;
grant execute on function private.export_object_readable(text) to authenticated;
revoke execute on function private.export_statuses(jsonb) from public, anon, authenticated;
revoke execute on function private.export_scope_count(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.request_export(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.request_export(uuid, uuid, text, jsonb, uuid) to authenticated;
revoke execute on function public.claim_export(uuid) from public, anon;
grant execute on function public.claim_export(uuid) to authenticated;
revoke execute on function public.export_rows(uuid) from public, anon;
grant execute on function public.export_rows(uuid) to authenticated;
revoke execute on function public.finish_export(uuid, boolean, integer, bigint, text) from public, anon;
grant execute on function public.finish_export(uuid, boolean, integer, bigint, text) to authenticated;
revoke execute on function public.get_export(uuid) from public, anon;
grant execute on function public.get_export(uuid) to authenticated;

comment on table public.exports is
  'P14-03/P14-04 export jobs: idempotent per requester key, claimed with SKIP LOCKED, ready only with an artifact, expiring after seven days.';

commit;
