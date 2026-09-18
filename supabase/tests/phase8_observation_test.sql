begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(37);

-- Identities: teacher, other-school teacher, Leaf leader a1 and member a2,
-- Root leader a3, unassigned classmate u1.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000008001', 'p8.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000008002', 'p8.other.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000008003', 'p8.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000008004', 'p8.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000008005', 'p8.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000008006', 'p8.u1@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008002');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000008001', 'P8 School', '00000000-0000-0000-0000-000000008001'),
  ('10000000-0000-0000-0000-000000008002', 'P8 Other School', '00000000-0000-0000-0000-000000008002');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000008001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000008001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008003',
  '00000000-0000-0000-0000-000000008004', '00000000-0000-0000-0000-000000008005',
  '00000000-0000-0000-0000-000000008006'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000008002', '00000000-0000-0000-0000-000000008002', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000008001', '10000000-0000-0000-0000-000000008001', 'P8 Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000008001'),
  ('20000000-0000-0000-0000-000000008002', '10000000-0000-0000-0000-000000008002', 'P8 Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000008002');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000008001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000008001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008003',
  '00000000-0000-0000-0000-000000008004', '00000000-0000-0000-0000-000000008005',
  '00000000-0000-0000-0000-000000008006'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000008002', '00000000-0000-0000-0000-000000008002', 'teacher');

create temporary table p8_results (label text primary key, row jsonb not null);
grant all on table p8_results to authenticated, anon;

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
  execute format('insert into p8_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p8_results where label = label_value;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000008001' and name = group_name;
$$;

create function pg_temp.session_id()
returns uuid
language sql
as $$
  select (row ->> 'session_id')::uuid from p8_results where label = 'session';
$$;

-- Starts an observation as a student and stores the RPC row under a label.
create function pg_temp.start_as(
  label_value text,
  actor uuid,
  client_id uuid,
  location_status text,
  lat double precision,
  lng double precision,
  accuracy double precision,
  captured timestamptz,
  reason text
)
returns void
language plpgsql
as $$
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  perform pg_temp.call(label_value, format(
    $sql$select * from public.start_observation(%L, %L, %L, %L, %L, %L, %L, %L)$sql$,
    pg_temp.session_id(), client_id, location_status, lat, lng, accuracy, captured, reason
  ));
  reset role;
end;
$$;

create function pg_temp.update_as(
  label_value text,
  actor uuid,
  observation uuid,
  expected integer,
  common_name text,
  scientific_name text,
  note text
)
returns void
language plpgsql
as $$
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  perform pg_temp.call(label_value, format(
    $sql$select * from public.update_observation_draft(%L, %L, %L, %L, %L)$sql$,
    observation, expected, common_name, scientific_name, note
  ));
  reset role;
end;
$$;

create function pg_temp.observation_of(label_value text)
returns uuid
language sql
as $$
  select (row ->> 'observation_id')::uuid from p8_results where label = label_value;
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000008003');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000008001', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000008001', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000008004', 'member', '00000000-0000-0000-0000-000000008003');

select pg_temp.act_as('00000000-0000-0000-0000-000000008005');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000008001', 'Root', null);
reset role;

insert into public.activities (id, class_id, title, status, created_by)
values ('60000000-0000-0000-0000-000000008001', '20000000-0000-0000-0000-000000008001', 'Garden survey', 'published', '00000000-0000-0000-0000-000000008001');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000008001', '60000000-0000-0000-0000-000000008001', '20000000-0000-0000-0000-000000008001', 1, 'Garden survey', '00000000-0000-0000-0000-000000008001');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000008001', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000008001'
where id = '61000000-0000-0000-0000-000000008001';

select pg_temp.act_as('00000000-0000-0000-0000-000000008001');
set local role authenticated;
select pg_temp.call('session', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000008001', 'Morning round')$$);
select pg_temp.call('open', format(
  $$select * from public.open_exploration_session(%L, array[%L, %L]::uuid[])$$,
  pg_temp.session_id(), pg_temp.group_named('Leaf'), pg_temp.group_named('Root')
));
select pg_temp.call('activate', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
reset role;

-- Posture ----------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.observations'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.observation_status_history'::regclass)
    and has_table_privilege('authenticated', 'public.observations', 'SELECT')
    and not has_table_privilege('authenticated', 'public.observations', 'INSERT')
    and not has_table_privilege('authenticated', 'public.observations', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.observations', 'DELETE')
    and not has_table_privilege('anon', 'public.observations', 'SELECT')
    and not has_table_privilege('anon', 'public.observation_status_history', 'SELECT'),
  'observations have RLS, read-only grants for authenticated users, and nothing for anon'
);

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where (namespace.nspname, function_row.proname) in (
      ('public', 'start_observation'), ('public', 'update_observation_draft'),
      ('public', 'get_observation_draft'), ('public', 'list_my_session_observations'),
      ('private', 'observation_start_denial'), ('private', 'observation_edit_denial'),
      ('private', 'observation_owner_payload'), ('private', 'current_user_owns_observation')
    )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  8::bigint,
  'observation functions are security definer with empty search paths'
);

select ok(
  has_function_privilege('authenticated', 'public.start_observation(uuid,uuid,text,double precision,double precision,double precision,timestamp with time zone,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.update_observation_draft(uuid,integer,text,text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.start_observation(uuid,uuid,text,double precision,double precision,double precision,timestamp with time zone,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_observation_draft(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.observation_start_denial(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.observation_owner_payload(uuid)', 'EXECUTE'),
  'observation RPCs are authenticated-only and helpers stay private'
);

select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('observations', 'observation_status_history')),
  2::bigint,
  'only the two owner read policies exist, so drafts are invisible to teachers and peers'
);

select throws_ok(
  format($$
    insert into public.observations (
      client_generated_id, observer_id, class_id, activity_id, session_id, session_group_id,
      session_participant_id, location_status, captured_at, location_unavailable_reason
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000008003', participant.class_id,
      '60000000-0000-0000-0000-000000008001', participant.session_id, participant.session_group_id,
      participant.id, 'unavailable', now(), 'timeout'
    from public.session_participants as participant
    where participant.session_id = %L and participant.user_id = '00000000-0000-0000-0000-000000008004'
  $$, pg_temp.session_id()),
  '23503',
  null,
  'an observation cannot claim another participant''s snapshot row'
);

select throws_ok(
  format($$
    insert into public.observations (
      client_generated_id, observer_id, class_id, activity_id, session_id, session_group_id,
      session_participant_id, location_status, captured_at
    )
    select gen_random_uuid(), participant.user_id, participant.class_id,
      '60000000-0000-0000-0000-000000008001', participant.session_id, participant.session_group_id,
      participant.id, 'captured', now()
    from public.session_participants as participant
    where participant.session_id = %L and participant.user_id = '00000000-0000-0000-0000-000000008003'
  $$, pg_temp.session_id()),
  '23514',
  null,
  'a captured location status requires a stored location'
);

-- Start ------------------------------------------------------------------------------

select pg_temp.start_as('a1_first', '00000000-0000-0000-0000-000000008003',
  '80000000-0000-0000-0000-000000008001', 'captured', 13.755123456, 100.505987654, 8.5, now(), null);

select ok(
  pg_temp.result('a1_first', '{outcome}') = 'created'
    and pg_temp.result('a1_first', '{observation_version}') = '1'
    and (select status from public.observations where id = pg_temp.observation_of('a1_first')) = 'draft',
  'an active participant starts a draft at version 1'
);

select is(
  (
    select string_agg(coalesce(from_status, 'null') || '>' || to_status || ':' || reason || ':' || changed_by::text, ',')
    from public.observation_status_history
    where observation_id = pg_temp.observation_of('a1_first')
  ),
  'null>draft:observation_started:00000000-0000-0000-0000-000000008003',
  'starting writes one status-history row for the student'
);

select ok(
  (
    select count(*) = 1
      and bool_and(payload = jsonb_build_object('location_status', 'captured', 'offline_at_start', false))
      and bool_and(group_id = pg_temp.group_named('Leaf'))
      and bool_and(session_id = pg_temp.session_id())
      and bool_and(actor_id = '00000000-0000-0000-0000-000000008003')
    from public.research_events
    where event_name = 'observation_started' and observation_id = pg_temp.observation_of('a1_first')
  ),
  'starting emits one observation_started event with only location status and offline flag'
);

select pg_temp.start_as('a1_replay', '00000000-0000-0000-0000-000000008003',
  '80000000-0000-0000-0000-000000008001', 'captured', 13.755123456, 100.505987654, 8.5, now(), null);

select ok(
  pg_temp.result('a1_replay', '{outcome}') = 'existing'
    and pg_temp.observation_of('a1_replay') = pg_temp.observation_of('a1_first')
    and (select count(*) from public.observations where observer_id = '00000000-0000-0000-0000-000000008003') = 1
    and (select count(*) from public.observation_status_history) = 1
    and (select count(*) from public.research_events where event_name = 'observation_started') = 1,
  'replaying a start returns the same draft without new rows, history, or events'
);

select pg_temp.start_as('a1_reuse', '00000000-0000-0000-0000-000000008003',
  '80000000-0000-0000-0000-000000008001', 'captured', 13.7, 100.5, 8.5, now(), null);

select is(pg_temp.result('a1_reuse', '{error_code}'), 'IDEMPOTENCY_KEY_REUSE', 'reusing a client ID for different capture data is refused');

select pg_temp.start_as('a2_same_client', '00000000-0000-0000-0000-000000008004',
  '80000000-0000-0000-0000-000000008001', 'captured', 13.7556, 100.5056, 12, now(), null);

select ok(
  pg_temp.result('a2_same_client', '{outcome}') = 'created'
    and pg_temp.observation_of('a2_same_client') <> pg_temp.observation_of('a1_first'),
  'client IDs are scoped per student'
);

select pg_temp.start_as('a1_unavailable', '00000000-0000-0000-0000-000000008003',
  '80000000-0000-0000-0000-000000008002', 'unavailable', null, null, null, now(), 'timeout');

select ok(
  pg_temp.result('a1_unavailable', '{outcome}') = 'created'
    and (
      select capture_location is null and capture_accuracy_m is null
        and location_status = 'unavailable' and location_unavailable_reason = 'timeout'
      from public.observations where id = pg_temp.observation_of('a1_unavailable')
    ),
  'a start without a fix is recorded with an explicit reason and no coordinates'
);

select pg_temp.start_as('a1_poor', '00000000-0000-0000-0000-000000008003',
  '80000000-0000-0000-0000-000000008003', 'captured', 13.7557, 100.5057, 250, now(), null);

select is(pg_temp.result('a1_poor', '{outcome}'), 'created', 'poor accuracy never blocks a start');

select is(
  array[
    (select pg_temp.result('bad_mixed', '{error_details,field}') from (select pg_temp.start_as('bad_mixed', '00000000-0000-0000-0000-000000008003', '80000000-0000-0000-0000-000000008010', 'unavailable', 13.7, 100.5, 5, now(), 'timeout')) as done),
    (select pg_temp.result('bad_reason', '{error_details,field}') from (select pg_temp.start_as('bad_reason', '00000000-0000-0000-0000-000000008003', '80000000-0000-0000-0000-000000008011', 'unavailable', null, null, null, now(), null)) as done),
    (select pg_temp.result('bad_lat', '{error_details,field}') from (select pg_temp.start_as('bad_lat', '00000000-0000-0000-0000-000000008003', '80000000-0000-0000-0000-000000008012', 'captured', 91, 100.5, 5, now(), null)) as done),
    (select pg_temp.result('bad_accuracy', '{error_details,field}') from (select pg_temp.start_as('bad_accuracy', '00000000-0000-0000-0000-000000008003', '80000000-0000-0000-0000-000000008013', 'captured', 13.7, 100.5, 0, now(), null)) as done),
    (select pg_temp.result('bad_time', '{error_details,field}') from (select pg_temp.start_as('bad_time', '00000000-0000-0000-0000-000000008003', '80000000-0000-0000-0000-000000008014', 'captured', 13.7, 100.5, 5, now() - interval '1 hour', null)) as done),
    (select pg_temp.result('bad_status', '{error_details,field}') from (select pg_temp.start_as('bad_status', '00000000-0000-0000-0000-000000008003', '80000000-0000-0000-0000-000000008015', 'guessed', 13.7, 100.5, 5, now(), null)) as done)
  ],
  array['lat', 'unavailableReason', 'lat', 'accuracyM', 'capturedAt', 'locationStatus'],
  'invalid capture data is refused by field'
);

select pg_temp.start_as('a3_waiting', '00000000-0000-0000-0000-000000008005',
  '80000000-0000-0000-0000-000000008020', 'captured', 13.7, 100.5, 5, now(), null);

select is(
  pg_temp.result('a3_waiting', '{error_code}') || ':' || pg_temp.result('a3_waiting', '{error_details,reason}'),
  'GROUP_NOT_ACTIVE:group_waiting',
  'a waiting group cannot start observations'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000008006');
set local role authenticated;
select throws_ok(
  format($$select * from public.start_observation(%L, %L, 'captured', 13.7, 100.5, 5, now(), null)$$,
    pg_temp.session_id(), '80000000-0000-0000-0000-000000008021'),
  '42501', 'FORBIDDEN', 'a classmate outside the snapshot cannot start observations'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000008001');
set local role authenticated;
select throws_ok(
  format($$select * from public.start_observation(%L, %L, 'captured', 13.7, 100.5, 5, now(), null)$$,
    pg_temp.session_id(), '80000000-0000-0000-0000-000000008022'),
  '42501', 'FORBIDDEN', 'the teacher cannot start observations'
);
reset role;

-- Ownership and RLS ------------------------------------------------------------------------

create function pg_temp.visible_observations(actor uuid)
returns bigint
language plpgsql
as $$
declare
  visible bigint;
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  select count(*) into visible from public.observations;
  reset role;
  return visible;
end;
$$;

select is(
  array[
    pg_temp.visible_observations('00000000-0000-0000-0000-000000008003'),
    pg_temp.visible_observations('00000000-0000-0000-0000-000000008004'),
    pg_temp.visible_observations('00000000-0000-0000-0000-000000008001'),
    pg_temp.visible_observations('00000000-0000-0000-0000-000000008002'),
    pg_temp.visible_observations('00000000-0000-0000-0000-000000008006')
  ],
  array[3, 1, 0, 0, 0]::bigint[],
  'owners see only their drafts; the teacher, other teachers, and classmates see none'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000008003');
set local role authenticated;
select throws_ok(
  $$update public.observations set student_common_name = 'x'$$,
  '42501',
  null,
  'students cannot write observations directly'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000008004');
set local role authenticated;
select throws_ok(
  format($$select public.get_observation_draft(%L)$$, pg_temp.observation_of('a1_first')),
  '42501', 'FORBIDDEN', 'a groupmate cannot read another student''s draft'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000008001');
set local role authenticated;
select throws_ok(
  format($$select public.get_observation_draft(%L)$$, pg_temp.observation_of('a1_first')),
  '42501', 'FORBIDDEN', 'the teacher cannot read a draft before submission'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000008003');
set local role authenticated;
insert into p8_results select 'draft', public.get_observation_draft(pg_temp.observation_of('a1_first'));
insert into p8_results select 'list', public.list_my_session_observations(pg_temp.session_id());
reset role;

select ok(
  pg_temp.result('draft', '{capture,lat}') = '13.755123'
    and pg_temp.result('draft', '{capture,lng}') = '100.505988'
    and pg_temp.result('draft', '{capture,accuracyM}') = '8.5'
    and pg_temp.result('draft', '{permissions,canEdit}') = 'true'
    and pg_temp.result('draft', '{status}') = 'draft',
  'the owner reads the draft with rounded capture metadata and edit permission'
);

select ok(
  pg_temp.result('list', '{canStart}') = 'true'
    and (select jsonb_array_length(row -> 'items') from p8_results where label = 'list') = 3
    and pg_temp.result('list', '{hasMore}') = 'false',
  'the owner lists their own session drafts and may start another'
);

-- Draft edits --------------------------------------------------------------------------------

select pg_temp.update_as('edit_one', '00000000-0000-0000-0000-000000008003',
  pg_temp.observation_of('a1_first'), 1, ' Golden shower ', 'Cassia fistula', 'Yellow flowers');

select ok(
  pg_temp.result('edit_one', '{outcome}') = 'updated'
    and pg_temp.result('edit_one', '{observation_version}') = '2'
    and (select student_common_name from public.observations where id = pg_temp.observation_of('a1_first')) = 'Golden shower',
  'an edit with the current version saves trimmed values and bumps the version'
);

select pg_temp.update_as('edit_stale', '00000000-0000-0000-0000-000000008003',
  pg_temp.observation_of('a1_first'), 1, 'Other name', null, null);

select ok(
  pg_temp.result('edit_stale', '{error_code}') = 'OBSERVATION_VERSION_CONFLICT'
    and pg_temp.result('edit_stale', '{error_details,currentVersion}') = '2'
    and pg_temp.result('edit_stale', '{error_details,observation,draft,commonName}') = 'Golden shower'
    and (select student_common_name from public.observations where id = pg_temp.observation_of('a1_first')) = 'Golden shower',
  'a stale edit is refused with the current version and refreshed record, and nothing changes'
);

select pg_temp.update_as('edit_noop', '00000000-0000-0000-0000-000000008003',
  pg_temp.observation_of('a1_first'), 1, 'Golden shower', 'Cassia fistula', 'Yellow flowers');

select is(pg_temp.result('edit_noop', '{outcome}'), 'unchanged', 'a retried identical edit never conflicts');

select pg_temp.act_as('00000000-0000-0000-0000-000000008004');
set local role authenticated;
select throws_ok(
  format($$select * from public.update_observation_draft(%L, 2, 'x', null, null)$$, pg_temp.observation_of('a1_first')),
  '42501', 'FORBIDDEN', 'a groupmate cannot edit another student''s draft'
);
reset role;

-- Guards -------------------------------------------------------------------------------------

select throws_ok(
  format($$update public.observations set capture_accuracy_m = 1 where id = %L$$, pg_temp.observation_of('a1_first')),
  '42501', 'OBSERVATION_CAPTURE_IMMUTABLE', 'capture metadata cannot change after start'
);

select throws_ok(
  format($$update public.observations set version = version + 2 where id = %L$$, pg_temp.observation_of('a1_first')),
  '23514', 'OBSERVATION_VERSION_STEP', 'versions advance one step at a time'
);

select throws_ok(
  format($$update public.observations set status = 'submitted' where id = %L$$, pg_temp.observation_of('a1_first')),
  '23514', 'INVALID_STATUS_TRANSITION', 'no status transition is allowed in the foundation phase'
);

select ok(
  (select count(*) from public.observation_status_history) = 4,
  'draft edits add no status history'
);

select throws_ok(
  format($$delete from public.observations where id = %L$$, pg_temp.observation_of('a1_first')),
  '42501', 'OBSERVATIONS_ARE_NOT_DELETED', 'observations are never deleted'
);

select throws_ok(
  $$update public.observation_status_history set reason = 'rewritten'$$,
  '42501', 'OBSERVATION_HISTORY_APPEND_ONLY', 'status history is append-only'
);

-- Pause and completion -------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-000000008001');
set local role authenticated;
select pg_temp.call('pause', format($$select * from public.pause_exploration_session(%L)$$, pg_temp.session_id()));
reset role;

select pg_temp.start_as('a1_paused', '00000000-0000-0000-0000-000000008003',
  '80000000-0000-0000-0000-000000008030', 'captured', 13.7, 100.5, 5, now(), null);
select pg_temp.update_as('edit_paused', '00000000-0000-0000-0000-000000008003',
  pg_temp.observation_of('a1_first'), 2, 'Golden shower tree', 'Cassia fistula', 'Yellow flowers');
select pg_temp.start_as('a1_replay_paused', '00000000-0000-0000-0000-000000008003',
  '80000000-0000-0000-0000-000000008001', 'captured', 13.755123456, 100.505987654, 8.5, now(), null);

select ok(
  pg_temp.result('a1_paused', '{error_code}') = 'SESSION_PAUSED'
    and pg_temp.result('edit_paused', '{outcome}') = 'updated'
    and pg_temp.result('a1_replay_paused', '{outcome}') = 'existing',
  'while paused, new starts are refused but drafts stay editable and replays still resolve'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000008003');
set local role authenticated;
insert into p8_results select 'list_paused', public.list_my_session_observations(pg_temp.session_id());
reset role;

select is(
  pg_temp.result('list_paused', '{canStart}') || ':' || pg_temp.result('list_paused', '{startBlockedCode}'),
  'false:SESSION_PAUSED',
  'the list reports why starting is blocked'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000008001');
set local role authenticated;
select pg_temp.call('resume', format($$select * from public.resume_exploration_session(%L)$$, pg_temp.session_id()));
select pg_temp.call('complete_leaf', format(
  $$select * from public.complete_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
reset role;

select pg_temp.update_as('edit_done', '00000000-0000-0000-0000-000000008003',
  pg_temp.observation_of('a1_first'), 3, 'Late edit', null, null);
select pg_temp.start_as('a1_done', '00000000-0000-0000-0000-000000008003',
  '80000000-0000-0000-0000-000000008031', 'captured', 13.7, 100.5, 5, now(), null);

select ok(
  pg_temp.result('edit_done', '{error_code}') || ':' || pg_temp.result('edit_done', '{error_details,reason}')
    = 'INVALID_STATUS_TRANSITION:group_completed'
    and pg_temp.result('a1_done', '{error_code}') || ':' || pg_temp.result('a1_done', '{error_details,reason}')
    = 'GROUP_NOT_ACTIVE:group_completed',
  'after the group completes, drafts are read-only and new starts are refused'
);

select * from finish();
rollback;
