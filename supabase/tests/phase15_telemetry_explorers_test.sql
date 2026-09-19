begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(17);

-- P15-03/P15-04: redacted error intake, flow health, and the explorers.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000153001', 'p153.admin@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000153002', 'p153.student@example.edu', now(), '{}'::jsonb);

insert into public.platform_admins (user_id, status, reason)
values ('00000000-0000-0000-0000-000000153001', 'active', 'P15 test bootstrap');

create function pg_temp.act_as(user_id uuid, aal text)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', 'authenticated', 'aal', aal)::text,
    true
  );
  select set_config('role', 'authenticated', true);
$$;

-- Intake as a student: context is redacted to allowlisted keys.
select pg_temp.act_as('00000000-0000-0000-0000-000000153002', 'aal1');
select ok(
  public.record_operational_error(
    'upload', 'storage_put', 'IMAGE_UPLOAD_INCOMPLETE', 'error', 'local', 'client',
    'v1.2.3', '90000000-0000-4000-8000-000000153001', null,
    jsonb_build_object(
      'http_status', 503, 'attempt', 2, 'category', 'network',
      'signed_url', 'https://example.test/storage/v1/object/sign/x?token=secret',
      'lat', 13.75, 'note', 'free text from a student',
      'route', '/api/observations/[id]/media'
    )
  ),
  'a signed-in caller records a failure'
);
select throws_ok(
  $$select public.record_operational_error('payments', 'x_y', 'BAD_CODE', 'error', 'local', 'client')$$,
  '23514',
  'VALIDATION_FAILED',
  'unknown flows are refused'
);
select throws_ok(
  $$select public.record_operational_error('upload', 'storage_put', 'lower case', 'error', 'local', 'client')$$,
  '23514',
  'VALIDATION_FAILED',
  'codes must be stable upper-case identifiers'
);
select throws_ok(
  $$select * from public.operational_error_events$$,
  '42501',
  null,
  'clients cannot read error events directly'
);

-- The rate limit drops extra events instead of failing the caller.
select is(
  (select count(*) filter (where recorded) from (
    select public.record_operational_error('offline_sync', 'outbox_send', 'NETWORK_ERROR', 'warning', 'local', 'client') as recorded
    from generate_series(1, 70)
  ) as attempts),
  59::bigint,
  'at most 60 events per caller per 10 minutes are kept'
);

reset role;
select is(
  (select redacted_context from public.operational_error_events where stage = 'storage_put'),
  '{"http_status": 503, "attempt": 2, "category": "network", "route": "/api/observations/[id]/media"}'::jsonb,
  'signed URLs, coordinates, and free text are dropped from context'
);
select is(
  (select fingerprint from public.operational_error_events where stage = 'storage_put'),
  md5('upload:storage_put:IMAGE_UPLOAD_INCOMPLETE'),
  'the fingerprint groups by flow, stage, and code'
);

-- Explorers need an aal2 admin.
select pg_temp.act_as('00000000-0000-0000-0000-000000153002', 'aal2');
select throws_ok($$select * from public.admin_list_error_events()$$, '42501', 'ADMIN_REQUIRED', 'students cannot open the error explorer');
select throws_ok($$select public.admin_flow_health()$$, '42501', 'ADMIN_REQUIRED', 'students cannot open flow health');

select pg_temp.act_as('00000000-0000-0000-0000-000000153001', 'aal1');
select throws_ok($$select * from public.admin_list_audit_events()$$, '42501', 'MFA_REQUIRED', 'the audit explorer needs aal2');

select pg_temp.act_as('00000000-0000-0000-0000-000000153001', 'aal2');
select is(
  (select count(*) from public.admin_list_error_events(flow_filter => 'upload')),
  1::bigint,
  'the error explorer filters by flow'
);
select is(
  (select error_code from public.admin_list_error_events(request_filter => '90000000-0000-4000-8000-000000153001')),
  'IMAGE_UPLOAD_INCOMPLETE',
  'the error explorer finds an event by request ID'
);
select throws_ok(
  $$select * from public.admin_list_error_events(range_from => now() - interval '40 days')$$,
  '23514',
  'TIME_RANGE_TOO_LARGE',
  'ranges beyond 31 days are refused'
);
select throws_ok(
  $$select * from public.admin_list_audit_events(range_from => now(), range_to => now() - interval '1 hour')$$,
  '23514',
  'VALIDATION_FAILED',
  'a reversed range is refused'
);

select is(
  (select (flow ->> 'errorCount')::int
   from jsonb_array_elements(public.admin_flow_health(24) -> 'flows') as flow
   where flow ->> 'flow' = 'offline_sync'),
  59,
  'flow health counts errors per flow in the window'
);
select is(
  (select flow ->> 'telemetry'
   from jsonb_array_elements(public.admin_flow_health(24) -> 'flows') as flow
   where flow ->> 'flow' = 'ai'),
  'unavailable',
  'flows without server telemetry are reported as partial, not healthy'
);

select is(
  (select count(*) from public.admin_list_audit_events(action_filter => 'admin.health'))::int >= 2,
  true,
  'the audit explorer shows the admin reads it audited'
);

select * from finish();
rollback;
