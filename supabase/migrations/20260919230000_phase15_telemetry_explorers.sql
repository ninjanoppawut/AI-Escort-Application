begin;

-- P15-03/P15-04: redacted operational error events, the flow-health read
-- model, and the audit/error explorers (ADM-004..ADM-007, ADM-009,
-- ADM-010, ADM-012). Error events carry only low-cardinality flow/stage/code
-- fields, correlation IDs, and allowlisted numeric/category context; they
-- never carry tokens, URLs, coordinates, or free text.

create table public.operational_error_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null
    check (environment in ('local', 'development', 'preview', 'staging', 'production')),
  release_version text check (release_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  flow text not null,
  stage text not null check (stage ~ '^[a-z][a-z0-9_]{1,40}$'),
  error_code text not null check (error_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  source text not null check (source in ('client', 'server', 'database')),
  request_id uuid,
  trace_id text check (trace_id ~ '^[A-Za-z0-9-]{1,64}$'),
  actor_id uuid references public.profiles (id) on delete set null,
  fingerprint text not null,
  redacted_context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint operational_error_events_flow_check check (flow in (
    'auth', 'class_join', 'group_formation', 'session_control', 'observation',
    'upload', 'ai', 'submission_review', 'realtime', 'export', 'offline_sync', 'admin'
  )),
  constraint operational_error_events_context_check check (jsonb_typeof(redacted_context) = 'object')
);

create index operational_errors_time_idx
  on public.operational_error_events (occurred_at desc, id desc);
create index operational_errors_flow_time_idx
  on public.operational_error_events (flow, occurred_at desc, id desc);
create index operational_errors_code_time_idx
  on public.operational_error_events (error_code, occurred_at desc, id desc);
create index operational_errors_request_idx
  on public.operational_error_events (request_id)
  where request_id is not null;
create index operational_errors_actor_idx
  on public.operational_error_events (actor_id, received_at desc)
  where actor_id is not null;

alter table public.operational_error_events enable row level security;
revoke all on table public.operational_error_events from anon, authenticated;

comment on table public.operational_error_events is
  'P15: redacted operational failures by flow/stage/code for the admin error explorer and flow health. Written only through record_operational_error.';

-- Only these context keys survive, and only as bounded numbers or short
-- category slugs.
create function private.redact_error_context(context jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  from jsonb_each(coalesce(context, '{}'::jsonb)) as item
  where (
      item.key in ('http_status', 'attempt', 'duration_ms', 'bytes', 'queue_age_s')
      and jsonb_typeof(item.value) = 'number'
      and (item.value #>> '{}')::numeric between 0 and 1000000000
    )
    or (
      item.key in ('category', 'method', 'route')
      and jsonb_typeof(item.value) = 'string'
      and (item.value #>> '{}') ~ '^[a-z0-9_/:.\[\]-]{1,80}$'
    );
$$;

revoke all on function private.redact_error_context(jsonb) from public, anon, authenticated;

-- Records one redacted failure for the signed-in caller (browser upload and
-- sync failures that never reach the server, and server route failures).
-- At most 60 events per caller per 10 minutes; extra events are dropped so
-- telemetry never slows the classroom path.
create function public.record_operational_error(
  error_flow text,
  error_stage text,
  code text,
  error_severity text,
  error_environment text,
  error_source text,
  release text default null,
  correlation_request_id uuid default null,
  correlation_trace_id text default null,
  context jsonb default '{}'::jsonb,
  occurred timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    return false;
  end if;

  if (
    select count(*)
    from public.operational_error_events as event
    where event.actor_id = actor
      and event.received_at > now() - interval '10 minutes'
  ) >= 60 then
    return false;
  end if;

  begin
    insert into public.operational_error_events (
      environment, release_version, flow, stage, error_code, severity, source,
      request_id, trace_id, actor_id, fingerprint, redacted_context, occurred_at
    )
    values (
      error_environment, release, error_flow, error_stage, code, error_severity,
      error_source, correlation_request_id, correlation_trace_id, actor,
      md5(error_flow || ':' || error_stage || ':' || code),
      private.redact_error_context(context),
      -- Device time is kept only when plausible.
      case
        when occurred between now() - interval '1 day' and now() + interval '5 minutes' then occurred
        else now()
      end
    );
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end;
  return true;
end;
$$;

revoke all on function public.record_operational_error(text, text, text, text, text, text, text, uuid, text, jsonb, timestamptz) from public, anon;
grant execute on function public.record_operational_error(text, text, text, text, text, text, text, uuid, text, jsonb, timestamptz) to authenticated;

create function private.admin_time_range(
  range_from timestamptz,
  range_to timestamptz,
  max_range interval
)
returns table (from_at timestamptz, to_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  resolved_to timestamptz := coalesce(range_to, now());
  resolved_from timestamptz := coalesce(range_from, coalesce(range_to, now()) - interval '24 hours');
begin
  if resolved_from > resolved_to then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;
  if resolved_to - resolved_from > max_range then
    raise exception using errcode = '23514', message = 'TIME_RANGE_TOO_LARGE';
  end if;
  return query select resolved_from, resolved_to;
end;
$$;

revoke all on function private.admin_time_range(timestamptz, timestamptz, interval) from public, anon, authenticated;

-- ADM-004: append-only audit explorer. Default 24 hours, at most 31 days.
create function public.admin_list_audit_events(
  range_from timestamptz default null,
  range_to timestamptz default null,
  actor_filter uuid default null,
  action_filter text default null,
  resource_type_filter text default null,
  outcome_filter text default null,
  request_filter uuid default null,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 50
)
returns table (
  event_id uuid,
  created_at timestamptz,
  actor_id uuid,
  actor_kind text,
  action text,
  resource_type text,
  resource_id uuid,
  school_id uuid,
  class_id uuid,
  outcome text,
  request_id uuid,
  trace_id text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  window_from timestamptz;
  window_to timestamptz;
begin
  select range.from_at, range.to_at into window_from, window_to
  from private.admin_time_range(range_from, range_to, interval '31 days') as range;
  if not private.admin_cursor_pair_valid(cursor_created_at, cursor_id) then
    raise exception using errcode = '23514', message = 'INVALID_CURSOR';
  end if;
  if outcome_filter is not null and outcome_filter not in ('succeeded', 'denied', 'failed') then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;
  if (action_filter is not null and action_filter !~ '^[a-z_.]{1,80}$')
    or (resource_type_filter is not null and resource_type_filter !~ '^[a-z_]{1,64}$')
  then
    raise exception using errcode = '23514', message = 'VALIDATION_FAILED';
  end if;

  perform private.insert_audit_log(
    actor, 'admin.audit.listed', 'admin_view', null, null, null, 'succeeded',
    jsonb_build_object(
      'range_hours', round(extract(epoch from window_to - window_from) / 3600),
      'filters', (
        (actor_filter is not null)::int + (action_filter is not null)::int
        + (resource_type_filter is not null)::int + (outcome_filter is not null)::int
        + (request_filter is not null)::int
      ),
      'paged', cursor_id is not null
    )
  );

  return query
  select
    log.id, log.created_at, log.actor_id, log.actor_kind, log.action,
    log.resource_type, log.resource_id, log.school_id, log.class_id,
    log.outcome, log.request_id, log.trace_id, log.payload
  from public.audit_logs as log
  where log.created_at >= window_from
    and log.created_at <= window_to
    and (actor_filter is null or log.actor_id = actor_filter)
    and (action_filter is null or log.action = action_filter or log.action like action_filter || '.%')
    and (resource_type_filter is null or log.resource_type = resource_type_filter)
    and (outcome_filter is null or log.outcome = outcome_filter)
    and (request_filter is null or log.request_id = request_filter)
    and (cursor_id is null or (log.created_at, log.id) < (cursor_created_at, cursor_id))
  order by log.created_at desc, log.id desc
  limit private.admin_page_size(page_size);
end;
$$;

-- ADM-005: redacted error explorer. Default 24 hours, at most 31 days.
create function public.admin_list_error_events(
  range_from timestamptz default null,
  range_to timestamptz default null,
  flow_filter text default null,
  stage_filter text default null,
  code_filter text default null,
  release_filter text default null,
  environment_filter text default null,
  request_filter uuid default null,
  trace_filter text default null,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 50
)
returns table (
  event_id uuid,
  occurred_at timestamptz,
  received_at timestamptz,
  environment text,
  release_version text,
  flow text,
  stage text,
  error_code text,
  severity text,
  source text,
  fingerprint text,
  request_id uuid,
  trace_id text,
  redacted_context jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  window_from timestamptz;
  window_to timestamptz;
begin
  select range.from_at, range.to_at into window_from, window_to
  from private.admin_time_range(range_from, range_to, interval '31 days') as range;
  if not private.admin_cursor_pair_valid(cursor_created_at, cursor_id) then
    raise exception using errcode = '23514', message = 'INVALID_CURSOR';
  end if;

  perform private.insert_audit_log(
    actor, 'admin.errors.listed', 'admin_view', null, null, null, 'succeeded',
    jsonb_build_object(
      'range_hours', round(extract(epoch from window_to - window_from) / 3600),
      'flow', flow_filter,
      'paged', cursor_id is not null
    )
  );

  return query
  select
    event.id, event.occurred_at, event.received_at, event.environment,
    event.release_version, event.flow, event.stage, event.error_code,
    event.severity, event.source, event.fingerprint, event.request_id,
    event.trace_id, event.redacted_context
  from public.operational_error_events as event
  where event.occurred_at >= window_from
    and event.occurred_at <= window_to
    and (flow_filter is null or event.flow = flow_filter)
    and (stage_filter is null or event.stage = stage_filter)
    and (code_filter is null or event.error_code = code_filter)
    and (release_filter is null or event.release_version = release_filter)
    and (environment_filter is null or event.environment = environment_filter)
    and (request_filter is null or event.request_id = request_filter)
    and (trace_filter is null or event.trace_id = trace_filter)
    and (cursor_id is null or (event.occurred_at, event.id) < (cursor_created_at, cursor_id))
  order by event.occurred_at desc, event.id desc
  limit private.admin_page_size(page_size);
end;
$$;

-- ADM-006/ADM-007: low-cardinality flow health for one window (default 24
-- hours, at most 7 days). Request volume and latency are not recorded yet,
-- and AI and Realtime have no server telemetry, so those are reported as
-- partial rather than healthy.
create function public.admin_flow_health(window_hours integer default 24)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_current_admin_aal2();
  window_from timestamptz;
  result jsonb;
begin
  if window_hours is null or window_hours < 1 or window_hours > 168 then
    raise exception using errcode = '23514', message = 'TIME_RANGE_TOO_LARGE';
  end if;
  window_from := now() - make_interval(hours => window_hours);

  perform private.insert_audit_log(
    actor, 'admin.health.viewed', 'admin_view', null, null, null, 'succeeded',
    jsonb_build_object('window_hours', window_hours)
  );

  select jsonb_build_object(
    'window', jsonb_build_object('from', window_from, 'to', now()),
    'freshAt', now(),
    'flows', coalesce((
      select jsonb_agg(flow_row order by flow_row ->> 'flow')
      from (
        select jsonb_build_object(
          'flow', flow_name.flow,
          'errorCount', count(event.id),
          'criticalCount', count(event.id) filter (where event.severity in ('error', 'critical')),
          'lastErrorAt', max(event.occurred_at),
          'topErrorCodes', coalesce((
            select jsonb_agg(jsonb_build_object('code', top.error_code, 'stage', top.stage, 'count', top.total) order by top.total desc, top.error_code)
            from (
              select inner_event.error_code, inner_event.stage, count(*) as total
              from public.operational_error_events as inner_event
              where inner_event.flow = flow_name.flow
                and inner_event.occurred_at >= window_from
              group by inner_event.error_code, inner_event.stage
              order by total desc, inner_event.error_code
              limit 3
            ) as top
          ), '[]'::jsonb),
          'telemetry', case
            when flow_name.flow in ('ai', 'realtime') then 'unavailable'
            else 'errors_only'
          end
        ) as flow_row
        from unnest(array[
          'auth', 'class_join', 'group_formation', 'session_control', 'observation',
          'upload', 'ai', 'submission_review', 'realtime', 'export', 'offline_sync'
        ]) as flow_name(flow)
        left join public.operational_error_events as event
          on event.flow = flow_name.flow and event.occurred_at >= window_from
        group by flow_name.flow
      ) as flows
    ), '[]'::jsonb),
    'queues', jsonb_build_object(
      'export', (
        select jsonb_build_object(
          'queued', count(*) filter (where export.status = 'queued'),
          'running', count(*) filter (where export.status = 'running'),
          'oldestQueuedAgeSeconds', coalesce(floor(extract(epoch from now() - min(export.created_at) filter (where export.status = 'queued')))::bigint, 0),
          'stuckRunning', count(*) filter (where export.status = 'running' and export.started_at < now() - interval '15 minutes'),
          'failedInWindow', count(*) filter (where export.status = 'failed' and export.created_at >= window_from),
          'readyInWindow', count(*) filter (where export.status = 'ready' and export.created_at >= window_from)
        )
        from public.exports as export
      ),
      'upload', (
        select jsonb_build_object(
          'pending', count(*) filter (where media.status = 'pending'),
          'stalePending', count(*) filter (where media.status = 'pending' and media.created_at < now() - interval '30 minutes'),
          'uploadedInWindow', count(*) filter (where media.status = 'uploaded' and media.uploaded_at >= window_from)
        )
        from public.observation_media as media
      ),
      'ai', jsonb_build_object('status', 'not_enabled')
    ),
    'sessions', (
      select jsonb_build_object(
        'open', count(*) filter (where session.status = 'open'),
        'paused', count(*) filter (where session.status = 'paused')
      )
      from public.exploration_sessions as session
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.admin_list_audit_events(timestamptz, timestamptz, uuid, text, text, text, uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.admin_list_error_events(timestamptz, timestamptz, text, text, text, text, text, uuid, text, timestamptz, uuid, integer) from public, anon;
revoke all on function public.admin_flow_health(integer) from public, anon;
grant execute on function public.admin_list_audit_events(timestamptz, timestamptz, uuid, text, text, text, uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.admin_list_error_events(timestamptz, timestamptz, text, text, text, text, text, uuid, text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.admin_flow_health(integer) to authenticated;

commit;
