begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(16);

-- P14-05A: the registry is enforced on every research event insert, and the
-- study-scoped export returns only pseudonyms and allowlisted keys.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000145001', 'p145.student@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000145002', 'p145.other@example.edu', now(), '{}'::jsonb);

select is(
  (select count(*) from private.research_event_registry where schema_version = 1),
  44::bigint,
  'every dictionary event is registered at version 1'
);

insert into private.runtime_flags (key, value)
values ('research_events_strict', 'on')
on conflict (key) do update set value = excluded.value;

select throws_ok(
  $$insert into public.research_events (event_name, schema_version, occurred_at, payload)
    values ('invented_event', 1, now(), '{}'::jsonb)$$,
  '22023',
  'research event invented_event.v1 is not registered',
  'strict mode refuses an unregistered event'
);

select throws_ok(
  $$insert into public.research_events (event_name, schema_version, occurred_at, payload)
    values ('observation_started', 1, now(), '{"location_status":"captured","email":"x@example.edu"}'::jsonb)$$,
  '22023',
  null,
  'strict mode refuses an unregistered payload key'
);

select throws_ok(
  $$insert into public.research_events (event_name, schema_version, occurred_at, payload)
    values ('observation_started', 2, now(), '{}'::jsonb)$$,
  '22023',
  null,
  'strict mode refuses an unregistered version'
);

select lives_ok(
  $$insert into public.research_events (event_name, schema_version, occurred_at, payload)
    values ('observation_started', 1, now(), '{"location_status":"captured","offline_at_start":true,"offline_delay_s":40}'::jsonb)$$,
  'a registered event with registered keys is accepted'
);

-- Hosted projects have no strict flag: the row is kept, minimized.
delete from private.runtime_flags where key = 'research_events_strict';

insert into public.research_events (id, event_name, schema_version, actor_id, occurred_at, payload)
values (
  '90000000-0000-0000-0000-000000145001', 'observation_started', 1,
  '00000000-0000-0000-0000-000000145001', now(),
  '{"location_status":"captured","display_name":"Ada","lat":13.7}'::jsonb
);
select is(
  (select payload from public.research_events where id = '90000000-0000-0000-0000-000000145001'),
  '{"location_status":"captured"}'::jsonb,
  'outside strict mode unregistered keys are dropped, never stored'
);

insert into public.research_events (id, event_name, schema_version, occurred_at, payload)
values ('90000000-0000-0000-0000-000000145002', 'invented_event', 1, now(), '{"note":"free text"}'::jsonb);
select is(
  (select payload from public.research_events where id = '90000000-0000-0000-0000-000000145002'),
  '{}'::jsonb,
  'outside strict mode an unregistered event keeps no payload'
);

-- Studies and allowlists.
insert into private.research_studies (id, code, status, starts_on)
values
  ('a0000000-0000-0000-0000-000000145001', 'p145-study-a', 'draft', current_date - 1),
  ('a0000000-0000-0000-0000-000000145002', 'p145-study-b', 'draft', current_date - 1);

select throws_ok(
  $$insert into private.research_export_allowlist (study_id, event_name, schema_version, payload_keys)
    values ('a0000000-0000-0000-0000-000000145001', 'observation_started', 1, array['location_status', 'lat'])$$,
  '22023',
  null,
  'an allowlist cannot name a key the event version does not register'
);

insert into private.research_export_allowlist (study_id, event_name, schema_version, payload_keys)
values
  ('a0000000-0000-0000-0000-000000145001', 'observation_started', 1, array['location_status']),
  ('a0000000-0000-0000-0000-000000145002', 'observation_started', 1, array['location_status']);

select throws_ok(
  $$select * from private.research_export_rows('a0000000-0000-0000-0000-000000145001')$$,
  '42501',
  'study is not approved for export',
  'a draft study cannot be exported'
);

select throws_ok(
  $$update private.research_studies set status = 'approved' where id = 'a0000000-0000-0000-0000-000000145001'$$,
  '23514',
  null,
  'approval needs a protocol reference and time'
);

update private.research_studies
set status = 'approved', protocol_reference = 'TEST-PROTOCOL', approved_at = now()
where id in ('a0000000-0000-0000-0000-000000145001', 'a0000000-0000-0000-0000-000000145002');

insert into public.research_events (event_name, schema_version, actor_id, occurred_at, payload)
values
  ('observation_started', 1, '00000000-0000-0000-0000-000000145001', now(), '{"location_status":"captured","offline_at_start":false}'::jsonb),
  ('observation_started', 1, '00000000-0000-0000-0000-000000145002', now(), '{"location_status":"unavailable","offline_at_start":true}'::jsonb),
  ('export_requested', 1, '00000000-0000-0000-0000-000000145001', now(), '{"export_type":"csv","filter_count":0}'::jsonb);

create temporary table export_a on commit drop as
select * from private.research_export_rows('a0000000-0000-0000-0000-000000145001');
create temporary table export_b on commit drop as
select * from private.research_export_rows('a0000000-0000-0000-0000-000000145002');

select is(
  (select count(*) from export_a where event_name <> 'observation_started'),
  0::bigint,
  'only allowlisted events are exported'
);

select is(
  (select count(*) from export_a where payload <> '{}'::jsonb and not (payload ?& array['location_status'] and (select count(*) from jsonb_object_keys(payload)) = 1)),
  0::bigint,
  'only allowlisted payload keys are exported'
);

select ok(
  not exists (
    select 1 from export_a
    where study_subject_id in (
      '00000000-0000-0000-0000-000000145001',
      '00000000-0000-0000-0000-000000145002'
    )
  )
  and (select count(distinct study_subject_id) from export_a where study_subject_id is not null) >= 2,
  'subjects are pseudonymous and distinct'
);

select ok(
  (select count(*) from export_a join export_b using (study_subject_id)) = 0,
  'pseudonyms from two studies cannot be joined'
);

select is(
  (select count(distinct study_subject_id) from (
    select study_subject_id from export_a
    union all
    select study_subject_id from private.research_export_rows('a0000000-0000-0000-0000-000000145001')
  ) as rerun where study_subject_id is not null),
  (select count(distinct study_subject_id) from export_a where study_subject_id is not null),
  'pseudonyms are stable within a study'
);

select ok(
  not has_function_privilege('authenticated', 'private.research_export_rows(uuid)', 'execute')
  and not has_table_privilege('authenticated', 'private.research_studies', 'select')
  and not has_table_privilege('authenticated', 'private.research_event_registry', 'select'),
  'signed-in users cannot read studies, the registry, or run the export'
);

select * from finish();
rollback;
