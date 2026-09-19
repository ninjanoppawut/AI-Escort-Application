begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(14);

-- P15-05: incident acknowledgement, append-only idempotent notes, and
-- resolution; source events are never edited.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000155001', 'p155.admin@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000155002', 'p155.teacher@example.edu', now(), '{}'::jsonb);
update public.profiles set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000155002';
insert into public.platform_admins (user_id, status, reason)
values ('00000000-0000-0000-0000-000000155001', 'active', 'P15 test bootstrap');

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

select pg_temp.act_as('00000000-0000-0000-0000-000000155002', 'aal2');
select throws_ok(
  $$select public.admin_open_incident('Uploads failing', 'sev2', 'upload')$$,
  '42501', 'ADMIN_REQUIRED', 'a teacher cannot open incidents'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000155001', 'aal2');
create temporary table p155 on commit drop as
select (public.admin_open_incident('Uploads failing at school A', 'sev2', 'upload') ->> 'id')::uuid as id;
grant select on p155 to authenticated;

select is(
  public.admin_get_incident((select id from p155)) ->> 'status',
  'open',
  'an admin opens an incident'
);
select throws_ok(
  $$select public.admin_open_incident('x', 'sev9')$$,
  '23514', 'VALIDATION_FAILED', 'invalid severity and short titles are refused'
);

select is(
  public.acknowledge_operational_incident((select id from p155)) ->> 'status',
  'acknowledged',
  'the incident is acknowledged'
);
select is(
  public.acknowledge_operational_incident((select id from p155)) ->> 'status',
  'acknowledged',
  'acknowledging again is idempotent'
);

select is(
  jsonb_array_length(public.append_operational_incident_note(
    (select id from p155), 'Storage 503s since 09:10', 'c0000000-0000-4000-8000-000000155001') -> 'notes'),
  1,
  'a note is appended'
);
select is(
  jsonb_array_length(public.append_operational_incident_note(
    (select id from p155), 'Storage 503s since 09:10', 'c0000000-0000-4000-8000-000000155001') -> 'notes'),
  1,
  'retrying the same client note ID does not duplicate it'
);
select is(
  jsonb_array_length(public.append_operational_incident_note(
    (select id from p155), 'Provider confirmed an outage', 'c0000000-0000-4000-8000-000000155002') -> 'notes'),
  2,
  'a second note is appended in order'
);

select throws_ok(
  $$select public.admin_resolve_incident((select id from p155), 'ok')$$,
  '23514', 'VALIDATION_FAILED', 'a resolution needs a real description'
);
select is(
  public.admin_resolve_incident((select id from p155), 'Provider recovered; uploads retried') ->> 'status',
  'resolved',
  'the incident is resolved with a resolution'
);

select is(
  (select count(*) from public.admin_list_incidents('active')),
  0::bigint,
  'resolved incidents leave the active list'
);

reset role;
select throws_ok(
  $$update public.operational_incident_notes set note = 'rewritten'$$,
  '42501', 'INCIDENT_NOTES_APPEND_ONLY', 'notes cannot be edited'
);
select throws_ok(
  $$delete from public.operational_incident_notes$$,
  '42501', 'INCIDENT_NOTES_APPEND_ONLY', 'notes cannot be deleted'
);
select is(
  (select count(*) from public.research_events
   where event_name = 'admin_incident_acknowledged'
     and actor_id = '00000000-0000-0000-0000-000000155001'),
  1::bigint,
  'one acknowledgement research event is recorded'
);

select * from finish();
rollback;
