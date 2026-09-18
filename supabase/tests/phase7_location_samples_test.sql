begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(19);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000007401', 'p7-03s.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007402', 'p7-03s.other.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007403', 'p7-03s.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007404', 'p7-03s.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007405', 'p7-03s.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007406', 'p7-03s.u1@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000007401', '00000000-0000-0000-0000-000000007402');

update public.profiles as profile
set display_name = names.display_name
from (
  values
    ('00000000-0000-0000-0000-000000007403'::uuid, 'Ada Leader'),
    ('00000000-0000-0000-0000-000000007404'::uuid, 'Bo Member'),
    ('00000000-0000-0000-0000-000000007405'::uuid, 'Cy Leader'),
    ('00000000-0000-0000-0000-000000007406'::uuid, 'Di Solo')
) as names(id, display_name)
where profile.id = names.id;

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000007401', 'P7-03s School', '00000000-0000-0000-0000-000000007401'),
  ('10000000-0000-0000-0000-000000007402', 'P7-03s Other School', '00000000-0000-0000-0000-000000007402');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000007401', user_id,
  case when user_id = '00000000-0000-0000-0000-000000007401'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000007401', '00000000-0000-0000-0000-000000007403',
  '00000000-0000-0000-0000-000000007404', '00000000-0000-0000-0000-000000007405',
  '00000000-0000-0000-0000-000000007406'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000007402', '00000000-0000-0000-0000-000000007402', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000007401', '10000000-0000-0000-0000-000000007401', 'P7-03s Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000007401'),
  ('20000000-0000-0000-0000-000000007402', '10000000-0000-0000-0000-000000007402', 'P7-03s Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000007402');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000007401', user_id,
  case when user_id = '00000000-0000-0000-0000-000000007401'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000007401', '00000000-0000-0000-0000-000000007403',
  '00000000-0000-0000-0000-000000007404', '00000000-0000-0000-0000-000000007405',
  '00000000-0000-0000-0000-000000007406'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000007402', '00000000-0000-0000-0000-000000007402', 'teacher');

create temporary table p7_03s_results (label text primary key, row jsonb not null);
grant all on table p7_03s_results to authenticated, anon;

create function pg_temp.act_as(actor uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', actor, 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );
$$;

create function pg_temp.call(label_value text, statement text)
returns void
language plpgsql
as $$
begin
  execute format('insert into p7_03s_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p7_03s_results where label = label_value;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000007401' and name = group_name;
$$;

create function pg_temp.session_id()
returns uuid
language sql
as $$
  select (row ->> 'session_id')::uuid from p7_03s_results where label = 'session';
$$;

-- Records a sample as a student and stores the RPC row under a label.
create function pg_temp.sample_as(
  label_value text,
  actor uuid,
  client_id uuid,
  lat double precision,
  lng double precision,
  accuracy double precision,
  recorded timestamptz
)
returns void
language plpgsql
as $$
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  perform pg_temp.call(label_value, format(
    $sql$select * from public.record_live_location_sample(%L, %L, %s, %s, %s, %L)$sql$,
    pg_temp.session_id(), client_id, lat, lng, accuracy, recorded
  ));
  reset role;
end;
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000007403');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000007401', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000007401', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000007404', 'member', '00000000-0000-0000-0000-000000007403');

select pg_temp.act_as('00000000-0000-0000-0000-000000007405');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000007401', 'Root', null);
reset role;

insert into public.activities (id, class_id, title, status, created_by)
values ('60000000-0000-0000-0000-000000007401', '20000000-0000-0000-0000-000000007401', 'Garden survey', 'published', '00000000-0000-0000-0000-000000007401');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000007401', '60000000-0000-0000-0000-000000007401', '20000000-0000-0000-0000-000000007401', 1, 'Garden survey', '00000000-0000-0000-0000-000000007401');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000007401', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000007401'
where id = '61000000-0000-0000-0000-000000007401';

select pg_temp.act_as('00000000-0000-0000-0000-000000007401');
set local role authenticated;
select pg_temp.call('session', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000007401', 'Morning round')$$);
select pg_temp.call('open', format(
  $$select * from public.open_exploration_session(%L, array[%L, %L]::uuid[])$$,
  pg_temp.session_id(), pg_temp.group_named('Leaf'), pg_temp.group_named('Root')
));
select pg_temp.call('activate', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
reset role;

create temporary table p7_03s_event_counts as
select
  (select count(*) from public.research_events) as research,
  (select count(*) from public.audit_logs) as audit,
  (select count(*) from public.session_events) as session_events;

-- Table posture -------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.location_events'::regclass)
    and not has_table_privilege('authenticated', 'public.location_events', 'SELECT')
    and not has_table_privilege('authenticated', 'public.location_events', 'INSERT')
    and not has_table_privilege('anon', 'public.location_events', 'SELECT')
    and not has_table_privilege('anon', 'public.location_events', 'INSERT'),
  'location_events has RLS and no direct client privileges'
);

select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'location_events'),
  0::bigint,
  'location_events has no policies, so only trusted RPCs reach it'
);

-- Recording -----------------------------------------------------------------------

select pg_temp.sample_as('a1_first', '00000000-0000-0000-0000-000000007403',
  '80000000-0000-0000-0000-000000007401', 13.755123456, 100.505987654, 8.5, now());

select ok(
  pg_temp.result('a1_first', '{outcome}') = 'recorded'
    and pg_temp.result('a1_first', '{sample_id}') is not null,
  'an active participant records a durable sample'
);

select ok(
  (
    select round(extensions.st_y(event.location::extensions.geometry)::numeric, 6) = 13.755123
      and round(extensions.st_x(event.location::extensions.geometry)::numeric, 6) = 100.505988
      and event.accuracy_m = 8.5
      and event.class_id = '20000000-0000-0000-0000-000000007401'
      and event.session_id = pg_temp.session_id()
      and event.event_type = 'sample'
      and event.device_context = '{}'::jsonb
    from public.location_events as event
    where event.id = pg_temp.result('a1_first', '{sample_id}')::uuid
  ),
  'the stored sample keeps position, accuracy, class, session, and an empty device context'
);

select pg_temp.sample_as('a1_replay', '00000000-0000-0000-0000-000000007403',
  '80000000-0000-0000-0000-000000007401', 13.7, 100.5, 8.5, now());

select ok(
  pg_temp.result('a1_replay', '{outcome}') = 'duplicate'
    and pg_temp.result('a1_replay', '{sample_id}') = pg_temp.result('a1_first', '{sample_id}')
    and (select count(*) from public.location_events) = 1,
  'replaying a client sample ID returns the original sample without a second row'
);

select pg_temp.sample_as('a1_fast', '00000000-0000-0000-0000-000000007403',
  '80000000-0000-0000-0000-000000007402', 13.7551, 100.5059, 8, now());

select ok(
  pg_temp.result('a1_fast', '{error_code}') = 'RATE_LIMITED'
    and pg_temp.result('a1_fast', '{retry_after_s}')::integer between 1 and 8,
  'samples closer than eight seconds apart are rate limited with a retry delay'
);

select pg_temp.sample_as('a2_first', '00000000-0000-0000-0000-000000007404',
  '80000000-0000-0000-0000-000000007403', 13.7552, 100.5058, 12, now());

select is(pg_temp.result('a2_first', '{outcome}'), 'recorded', 'rate limits are per participant');

select pg_temp.sample_as('a3_waiting', '00000000-0000-0000-0000-000000007405',
  '80000000-0000-0000-0000-000000007404', 13.7552, 100.5058, 12, now());

select is(pg_temp.result('a3_waiting', '{error_code}'), 'GROUP_NOT_ACTIVE', 'a waiting group cannot record samples');

select is(
  array[
    (select pg_temp.result('bad_lat', '{error_details,field}') from (select pg_temp.sample_as('bad_lat', '00000000-0000-0000-0000-000000007404', '80000000-0000-0000-0000-000000007405', 91, 100.5, 5, now())) as done),
    (select pg_temp.result('bad_lng', '{error_details,field}') from (select pg_temp.sample_as('bad_lng', '00000000-0000-0000-0000-000000007404', '80000000-0000-0000-0000-000000007406', 13.7, -181, 5, now())) as done),
    (select pg_temp.result('bad_accuracy', '{error_details,field}') from (select pg_temp.sample_as('bad_accuracy', '00000000-0000-0000-0000-000000007404', '80000000-0000-0000-0000-000000007407', 13.7, 100.5, 0, now())) as done),
    (select pg_temp.result('bad_time', '{error_details,field}') from (select pg_temp.sample_as('bad_time', '00000000-0000-0000-0000-000000007404', '80000000-0000-0000-0000-000000007408', 13.7, 100.5, 5, now() - interval '10 minutes')) as done)
  ],
  array['lat', 'lng', 'accuracyM', 'recordedAt'],
  'out-of-range latitude, longitude, accuracy, and stale capture times are rejected by field'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007406');
set local role authenticated;
select throws_ok(
  format($$select * from public.record_live_location_sample(%L, %L, 13.7, 100.5, 5, now())$$,
    pg_temp.session_id(), '80000000-0000-0000-0000-000000007409'),
  '42501', 'FORBIDDEN', 'a classmate outside the session cannot record samples'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000007401');
set local role authenticated;
select throws_ok(
  format($$select * from public.record_live_location_sample(%L, %L, 13.7, 100.5, 5, now())$$,
    pg_temp.session_id(), '80000000-0000-0000-0000-00000000740a'),
  '42501', 'FORBIDDEN', 'the teacher cannot record samples'
);
reset role;

select ok(
  (select count(*) from public.research_events) = (select research from p7_03s_event_counts)
    and (select count(*) from public.audit_logs) = (select audit from p7_03s_event_counts)
    and (select count(*) from public.session_events) = (select session_events from p7_03s_event_counts),
  'samples write no research, audit, or session events'
);

-- Teacher live read model ------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-000000007401');
set local role authenticated;
insert into p7_03s_results select 'live', public.get_session_live_locations(pg_temp.session_id());
reset role;

select ok(
  pg_temp.result('live', '{publishing}') = 'true'
    and pg_temp.result('live', '{activeGroupId}') = pg_temp.group_named('Leaf')::text
    and (select jsonb_array_length(row -> 'items') from p7_03s_results where label = 'live') = 2
    and pg_temp.result('live', '{items,0,displayName}') = 'Ada Leader'
    and pg_temp.result('live', '{items,0,latestSample,lat}') = '13.755123'
    and pg_temp.result('live', '{items,0,latestSample,lng}') = '100.505988'
    and pg_temp.result('live', '{items,1,latestSample,accuracyM}') = '12',
  'the teacher reads each active participant''s latest sample by name'
);

select ok(
  not (select (row -> 'items')::text ~ 'Cy Leader' from p7_03s_results where label = 'live'),
  'waiting groups are absent from the live read model'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007403');
set local role authenticated;
select throws_ok(
  format($$select public.get_session_live_locations(%L)$$, pg_temp.session_id()),
  '42501', 'FORBIDDEN', 'students cannot read the live location model'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000007402');
set local role authenticated;
select throws_ok(
  format($$select public.get_session_live_locations(%L)$$, pg_temp.session_id()),
  '42501', 'FORBIDDEN', 'teachers of other classes cannot read the live location model'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000007403');
set local role authenticated;
insert into p7_03s_results select 'view_active', public.get_session_participant_view(pg_temp.session_id());
reset role;

select ok(
  pg_temp.result('view_active', '{permissions,canPublishLocation}') = 'true'
    and (select row::text !~ '"(lat|lng|latestSample|location)"' from p7_03s_results where label = 'view_active'),
  'the participant view allows publishing and exposes no coordinates'
);

-- Publish stop ----------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-000000007401');
set local role authenticated;
select pg_temp.call('pause', format($$select * from public.pause_exploration_session(%L)$$, pg_temp.session_id()));
insert into p7_03s_results select 'live_paused', public.get_session_live_locations(pg_temp.session_id());
reset role;

select pg_temp.sample_as('a1_paused', '00000000-0000-0000-0000-000000007403',
  '80000000-0000-0000-0000-00000000740b', 13.7, 100.5, 5, now());

select pg_temp.act_as('00000000-0000-0000-0000-000000007403');
set local role authenticated;
insert into p7_03s_results select 'view_paused', public.get_session_participant_view(pg_temp.session_id());
reset role;

select ok(
  pg_temp.result('a1_paused', '{error_code}') = 'SESSION_PAUSED'
    and pg_temp.result('live_paused', '{publishing}') = 'false'
    and pg_temp.result('live_paused', '{items}') = '[]'
    and pg_temp.result('view_paused', '{permissions,canPublishLocation}') = 'false',
  'pausing stops recording, clears the teacher positions, and withdraws the publish permission'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007401');
set local role authenticated;
select pg_temp.call('complete', format($$select * from public.complete_exploration_session(%L)$$, pg_temp.session_id()));
reset role;

select pg_temp.sample_as('a1_done', '00000000-0000-0000-0000-000000007403',
  '80000000-0000-0000-0000-00000000740c', 13.7, 100.5, 5, now());

select is(pg_temp.result('a1_done', '{error_code}'), 'SESSION_NOT_OPEN', 'a completed session records nothing');

select * from finish();
rollback;
