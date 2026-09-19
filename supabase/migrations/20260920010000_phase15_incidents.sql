begin;

-- P15-05: incidents with acknowledgement, append-only notes, and resolution
-- (ADM-008, ADM-009). Source audit and error events are never edited; an
-- incident only references a flow. Writes are idempotent: acknowledging
-- twice returns the same incident, and a note carries a client note ID.

create table public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  severity text not null check (severity in ('sev1', 'sev2', 'sev3', 'sev4')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved')),
  flow text check (flow in (
    'auth', 'class_join', 'group_formation', 'session_control', 'observation',
    'upload', 'ai', 'submission_review', 'realtime', 'export', 'offline_sync', 'admin'
  )),
  opened_by uuid not null references public.profiles (id) on delete restrict,
  acknowledged_by uuid references public.profiles (id) on delete restrict,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete restrict,
  resolved_at timestamptz,
  resolution text check (resolution is null or char_length(btrim(resolution)) between 3 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_incidents_state_check check (
    (status = 'open' and acknowledged_at is null and resolved_at is null)
    or (status = 'acknowledged' and acknowledged_at is not null and resolved_at is null)
    or (status = 'resolved' and acknowledged_at is not null and resolved_at is not null
        and resolved_by is not null and resolution is not null)
  )
);

create index operational_incidents_created_idx
  on public.operational_incidents (created_at desc, id desc);
create index operational_incidents_status_created_idx
  on public.operational_incidents (status, created_at desc, id desc);
create index operational_incidents_opened_by_idx on public.operational_incidents (opened_by);
create index operational_incidents_acknowledged_by_idx
  on public.operational_incidents (acknowledged_by) where acknowledged_by is not null;
create index operational_incidents_resolved_by_idx
  on public.operational_incidents (resolved_by) where resolved_by is not null;

create table public.operational_incident_notes (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.operational_incidents (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete restrict,
  client_note_id uuid not null,
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint operational_incident_notes_client_unique unique (incident_id, client_note_id)
);

create index operational_incident_notes_incident_time_idx
  on public.operational_incident_notes (incident_id, created_at, id);
create index operational_incident_notes_author_idx
  on public.operational_incident_notes (author_id);

alter table public.operational_incidents enable row level security;
alter table public.operational_incident_notes enable row level security;
revoke all on table public.operational_incidents from anon, authenticated;
revoke all on table public.operational_incident_notes from anon, authenticated;

create function private.block_incident_note_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'INCIDENT_NOTES_APPEND_ONLY';
end;
$$;

create trigger operational_incident_notes_append_only
before update or delete on public.operational_incident_notes
for each row execute function private.block_incident_note_change();

revoke all on function private.block_incident_note_change() from public, anon, authenticated;

create function private.incident_json(target_incident_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', incident.id,
    'title', incident.title,
    'severity', incident.severity,
    'status', incident.status,
    'flow', incident.flow,
    'createdAt', incident.created_at,
    'acknowledgedAt', incident.acknowledged_at,
    'resolvedAt', incident.resolved_at,
    'resolution', incident.resolution,
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', note.id,
        'note', note.note,
        'createdAt', note.created_at,
        'byMe', note.author_id = (select auth.uid())
      ) order by note.created_at, note.id)
      from public.operational_incident_notes as note
      where note.incident_id = incident.id
    ), '[]'::jsonb)
  )
  from public.operational_incidents as incident
  where incident.id = target_incident_id;
$$;

revoke all on function private.incident_json(uuid) from public, anon, authenticated;

create function public.admin_open_incident(incident_title text, incident_severity text, incident_flow text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  created_id uuid;
begin
  begin
    insert into public.operational_incidents (title, severity, flow, opened_by)
    values (btrim(coalesce(incident_title, '')), incident_severity, incident_flow, actor)
    returning id into created_id;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end;

  perform private.insert_audit_log(
    actor, 'admin.incident.opened', 'operational_incident', created_id, null, null,
    'succeeded', jsonb_build_object('severity', incident_severity, 'flow', incident_flow)
  );
  return private.incident_json(created_id);
end;
$$;

create function public.acknowledge_operational_incident(target_incident_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  incident public.operational_incidents%rowtype;
begin
  select * into incident
  from public.operational_incidents as row_incident
  where row_incident.id = target_incident_id
  for update;
  if incident.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if incident.status = 'open' then
    update public.operational_incidents as row_incident
    set status = 'acknowledged', acknowledged_by = actor, acknowledged_at = now(), updated_at = now()
    where row_incident.id = target_incident_id;

    perform private.insert_audit_log(
      actor, 'admin.incident.acknowledged', 'operational_incident', target_incident_id,
      null, null, 'succeeded', jsonb_build_object('severity', incident.severity)
    );
    insert into public.research_events (event_name, schema_version, actor_id, occurred_at, payload)
    values (
      'admin_incident_acknowledged', 1, actor, now(),
      jsonb_build_object('severity', incident.severity, 'flow', coalesce(incident.flow, 'none'))
    );
  end if;
  return private.incident_json(target_incident_id);
end;
$$;

create function public.append_operational_incident_note(
  target_incident_id uuid,
  note_text text,
  client_note_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  inserted_id uuid;
begin
  if client_note_id is null or char_length(btrim(coalesce(note_text, ''))) not between 1 and 2000 then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;
  perform 1 from public.operational_incidents as incident
  where incident.id = target_incident_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  insert into public.operational_incident_notes (incident_id, author_id, client_note_id, note)
  values (target_incident_id, actor, client_note_id, btrim(note_text))
  on conflict on constraint operational_incident_notes_client_unique do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    update public.operational_incidents as incident
    set updated_at = now()
    where incident.id = target_incident_id;
    perform private.insert_audit_log(
      actor, 'admin.incident.note_appended', 'operational_incident', target_incident_id,
      null, null, 'succeeded', jsonb_build_object('note_length', char_length(btrim(note_text)))
    );
  end if;
  return private.incident_json(target_incident_id);
end;
$$;

create function public.admin_resolve_incident(target_incident_id uuid, resolution_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  incident public.operational_incidents%rowtype;
begin
  if char_length(btrim(coalesce(resolution_text, ''))) not between 3 and 2000 then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;
  select * into incident
  from public.operational_incidents as row_incident
  where row_incident.id = target_incident_id
  for update;
  if incident.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if incident.status = 'resolved' then
    return private.incident_json(target_incident_id);
  end if;

  update public.operational_incidents as row_incident
  set status = 'resolved',
      acknowledged_by = coalesce(row_incident.acknowledged_by, actor),
      acknowledged_at = coalesce(row_incident.acknowledged_at, now()),
      resolved_by = actor,
      resolved_at = now(),
      resolution = btrim(resolution_text),
      updated_at = now()
  where row_incident.id = target_incident_id;

  perform private.insert_audit_log(
    actor, 'admin.incident.resolved', 'operational_incident', target_incident_id,
    null, null, 'succeeded', jsonb_build_object('severity', incident.severity)
  );
  return private.incident_json(target_incident_id);
end;
$$;

create function public.admin_list_incidents(
  status_filter text default null,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 50
)
returns table (
  incident_id uuid,
  title text,
  severity text,
  status text,
  flow text,
  created_at timestamptz,
  note_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
begin
  if status_filter is not null and status_filter not in ('open', 'acknowledged', 'resolved', 'active') then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;
  if not private.admin_cursor_pair_valid(cursor_created_at, cursor_id) then
    raise exception using errcode = '23514', message = 'INVALID_CURSOR';
  end if;

  perform private.insert_audit_log(
    actor, 'admin.incidents.listed', 'admin_view', null, null, null, 'succeeded',
    jsonb_build_object('status_filter', status_filter, 'paged', cursor_id is not null)
  );

  return query
  select
    incident.id, incident.title, incident.severity, incident.status, incident.flow,
    incident.created_at,
    (select count(*) from public.operational_incident_notes as note where note.incident_id = incident.id)
  from public.operational_incidents as incident
  where (
      status_filter is null
      or (status_filter = 'active' and incident.status in ('open', 'acknowledged'))
      or incident.status = status_filter
    )
    and (cursor_id is null or (incident.created_at, incident.id) < (cursor_created_at, cursor_id))
  order by incident.created_at desc, incident.id desc
  limit private.admin_page_size(page_size);
end;
$$;

create function public.admin_get_incident(target_incident_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  result jsonb := private.incident_json(target_incident_id);
begin
  if result is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform private.insert_audit_log(
    actor, 'admin.incident.viewed', 'operational_incident', target_incident_id,
    null, null, 'succeeded', '{}'::jsonb
  );
  return result;
end;
$$;

revoke all on function public.admin_open_incident(text, text, text) from public, anon;
revoke all on function public.acknowledge_operational_incident(uuid) from public, anon;
revoke all on function public.append_operational_incident_note(uuid, text, uuid) from public, anon;
revoke all on function public.admin_resolve_incident(uuid, text) from public, anon;
revoke all on function public.admin_list_incidents(text, timestamptz, uuid, integer) from public, anon;
revoke all on function public.admin_get_incident(uuid) from public, anon;
grant execute on function public.admin_open_incident(text, text, text) to authenticated;
grant execute on function public.acknowledge_operational_incident(uuid) to authenticated;
grant execute on function public.append_operational_incident_note(uuid, text, uuid) to authenticated;
grant execute on function public.admin_resolve_incident(uuid, text) to authenticated;
grant execute on function public.admin_list_incidents(text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.admin_get_incident(uuid) to authenticated;

commit;
