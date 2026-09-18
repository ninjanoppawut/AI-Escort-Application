begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public;

select plan(8);

-- Real concurrent sessions through dblink. Fixtures are committed by those
-- sessions, so every run uses fresh IDs and cleans up at the end.
create temporary table race (
  key text primary key,
  value text not null
);

insert into race (key, value)
select key, gen_random_uuid()::text
from unnest(array['teacher', 'a1', 'a3', 'school', 'class', 'activity', 'version']) as key;
insert into race (key, value) values ('suffix', substr(md5(random()::text), 1, 12));

create function pg_temp.id(key_value text)
returns uuid
language sql
as $$
  select value::uuid from race where key = key_value;
$$;

create function pg_temp.connection_string()
returns text
language sql
as $$
  select format(
    'host=%s port=%s dbname=postgres user=postgres password=postgres',
    coalesce(host(inet_server_addr()), '127.0.0.1'),
    coalesce(inet_server_port(), 5432)
  );
$$;

create function pg_temp.claims_sql(key_value text)
returns text
language sql
as $$
  select 'set local request.jwt.claims to ' || quote_literal(
    jsonb_build_object('sub', pg_temp.id(key_value), 'role', 'authenticated', 'aal', 'aal1')::text
  );
$$;

create function pg_temp.autocommit_claims_sql(key_value text)
returns text
language sql
as $$
  select 'set request.jwt.claims to ' || quote_literal(
    jsonb_build_object('sub', pg_temp.id(key_value), 'role', 'authenticated', 'aal', 'aal1')::text
  );
$$;

select dblink_connect('p8_setup', pg_temp.connection_string());
select dblink_connect('p8_one', pg_temp.connection_string());
select dblink_connect('p8_two', pg_temp.connection_string());

select dblink_exec('p8_setup', format($fixture$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values
    (%1$L, %7$L || '.teacher@example.edu', now(), '{}'::jsonb),
    (%2$L, %7$L || '.a1@example.edu', now(), '{}'::jsonb),
    (%3$L, %7$L || '.a3@example.edu', now(), '{}'::jsonb);
  update public.profiles set account_type = 'teacher' where id = %1$L;
  insert into public.schools (id, name, created_by) values (%4$L, 'P8 Race School', %1$L);
  insert into public.school_memberships (school_id, user_id, role)
  select %4$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L]::uuid[]) as user_id;
  insert into public.classes (
    id, school_id, name, min_group_size, max_group_size, maximum_groups,
    allow_student_groups, group_formation_status, created_by
  )
  values (%5$L, %4$L, 'P8 Race Class', 1, 4, 5, true, 'open', %1$L);
  insert into public.class_members (class_id, user_id, role)
  select %5$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L]::uuid[]) as user_id;
$fixture$,
  pg_temp.id('teacher'), pg_temp.id('a1'), pg_temp.id('a3'), pg_temp.id('school'),
  pg_temp.id('class'), null, 'p8race-' || (select value from race where key = 'suffix')
));

select dblink_exec('p8_setup', pg_temp.autocommit_claims_sql('a1'));
insert into race (key, value)
select 'leaf', group_id::text
from dblink('p8_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Leaf'
)) as created(group_id uuid);

select dblink_exec('p8_setup', pg_temp.autocommit_claims_sql('a3'));
insert into race (key, value)
select 'root', group_id::text
from dblink('p8_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Root'
)) as created(group_id uuid);

select dblink_exec('p8_setup', 'reset request.jwt.claims');
select dblink_exec('p8_setup', format($fixture$
  insert into public.activities (id, class_id, title, status, created_by)
  values (%1$L, %3$L, 'Race survey', 'published', %4$L);
  insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
  values (%2$L, %1$L, %3$L, 1, 'Race survey', %4$L);
  insert into public.activity_boundaries (activity_version_id, boundary)
  values (%2$L, extensions.st_geomfromtext(
    'POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
  update public.activity_versions
  set status = 'published', published_at = now(), published_by = %4$L
  where id = %2$L;
$fixture$, pg_temp.id('activity'), pg_temp.id('version'), pg_temp.id('class'), pg_temp.id('teacher')));

select dblink_exec('p8_setup', pg_temp.autocommit_claims_sql('teacher'));
insert into race (key, value)
select 'session', session_id::text
from dblink('p8_setup', format(
  'select session_id from public.create_exploration_session(%L, %L)', pg_temp.id('activity'), 'Race round'
)) as created(session_id uuid);
select * from dblink('p8_setup', format(
  'select outcome from public.open_exploration_session(%L, array[%L, %L]::uuid[])',
  pg_temp.id('session'), pg_temp.id('leaf'), pg_temp.id('root')
)) as opened(outcome text);
select dblink_exec('p8_setup', 'reset request.jwt.claims');

select dblink_exec('p8_setup', pg_temp.autocommit_claims_sql('teacher'));
select * from dblink('p8_setup', format(
  'select outcome from public.activate_session_group(%L, %L)', pg_temp.id('session'), pg_temp.id('leaf')
)) as activated(outcome text);
select dblink_exec('p8_setup', 'reset request.jwt.claims');

insert into race (key, value) values ('client', gen_random_uuid()::text);

-- Race 1: two tabs start the same capture with the same client ID at once.
select dblink_exec('p8_one', 'begin');
select dblink_exec('p8_one', pg_temp.claims_sql('a1'));
insert into race (key, value)
select 'start_first', outcome || ':' || observation_id::text
from dblink('p8_one', format(
  $$select outcome, observation_id from public.start_observation(%L, %L, 'captured', 13.755, 100.505, 8, now(), null)$$,
  pg_temp.id('session'), pg_temp.id('client')
)) as started(outcome text, observation_id uuid);

select dblink_exec('p8_two', 'begin');
select dblink_exec('p8_two', pg_temp.claims_sql('a1'));
select dblink_send_query('p8_two', format(
  $$select outcome, observation_id from public.start_observation(%L, %L, 'captured', 13.755, 100.505, 8, now(), null)$$,
  pg_temp.id('session'), pg_temp.id('client')
));
select pg_sleep(0.5);
select dblink_exec('p8_one', 'commit');
insert into race (key, value)
select 'start_second', outcome || ':' || observation_id::text
from dblink_get_result('p8_two') as started(outcome text, observation_id uuid);
select * from dblink_get_result('p8_two') as drained(outcome text, observation_id uuid);
select dblink_exec('p8_two', 'commit');

insert into race (key, value)
select 'observation', split_part(value, ':', 2) from race where key = 'start_first';

select is(split_part((select value from race where key = 'start_first'), ':', 1), 'created', 'the first concurrent start creates the draft');
select is(
  (select value from race where key = 'start_second'),
  'existing:' || (select value from race where key = 'observation'),
  'the second concurrent start with the same client ID returns the same draft'
);
select is(
  (
    select total
    from dblink('p8_setup', format(
      'select count(*) from public.observations where class_id = %L', pg_temp.id('class')
    )) as counted(total bigint)
  ),
  1::bigint,
  'exactly one draft row exists'
);

-- Race 2: two tabs save different edits against the same expected version.
select dblink_exec('p8_one', 'begin');
select dblink_exec('p8_one', pg_temp.claims_sql('a1'));
insert into race (key, value)
select 'edit_first', outcome || ':' || coalesce(error_code, '')
from dblink('p8_one', format(
  $$select outcome, error_code from public.update_observation_draft(%L, 1, 'Tab one', null, null)$$,
  pg_temp.id('observation')
)) as edited(outcome text, error_code text);

select dblink_exec('p8_two', 'begin');
select dblink_exec('p8_two', pg_temp.claims_sql('a1'));
select dblink_send_query('p8_two', format(
  $$select outcome, error_code from public.update_observation_draft(%L, 1, 'Tab two', null, null)$$,
  pg_temp.id('observation')
));
select pg_sleep(0.5);
insert into race (key, value) values ('edit_blocked', dblink_is_busy('p8_two')::text);
select dblink_exec('p8_one', 'commit');
insert into race (key, value)
select 'edit_second', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p8_two') as edited(outcome text, error_code text);
select * from dblink_get_result('p8_two') as drained(outcome text, error_code text);
select dblink_exec('p8_two', 'commit');

select is((select value from race where key = 'edit_first'), 'updated:', 'the first edit saves');
select is((select value from race where key = 'edit_blocked'), '1', 'the second edit waits on the observation lock');
select is(
  (select value from race where key = 'edit_second'),
  'denied:OBSERVATION_VERSION_CONFLICT',
  'the second edit against the old version conflicts instead of overwriting'
);
select is(
  (
    select state
    from dblink('p8_setup', format(
      'select version || %L || student_common_name from public.observations where id = %L',
      ':', pg_temp.id('observation')
    )) as counted(state text)
  ),
  '2:Tab one',
  'the draft keeps the first edit at version 2'
);

-- Race 3: a start in flight holds the session share lock, so a pause waits,
-- and a start after the pause is refused.
select dblink_exec('p8_one', 'begin');
select dblink_exec('p8_one', pg_temp.claims_sql('a1'));
insert into race (key, value)
select 'start_before_pause', outcome
from dblink('p8_one', format(
  $$select outcome from public.start_observation(%L, %L, 'unavailable', null, null, null, now(), 'timeout')$$,
  pg_temp.id('session'), gen_random_uuid()
)) as started(outcome text);

select dblink_exec('p8_two', 'begin');
select dblink_exec('p8_two', pg_temp.claims_sql('teacher'));
select dblink_send_query('p8_two', format(
  'select outcome, error_code from public.pause_exploration_session(%L)', pg_temp.id('session')
));
select pg_sleep(0.5);
select dblink_exec('p8_one', 'commit');
select * from dblink_get_result('p8_two') as paused(outcome text, error_code text);
select * from dblink_get_result('p8_two') as drained(outcome text, error_code text);
select dblink_exec('p8_two', 'commit');

select dblink_exec('p8_one', pg_temp.autocommit_claims_sql('a1'));
insert into race (key, value)
select 'start_after_pause', coalesce(error_code, outcome)
from dblink('p8_one', format(
  $$select outcome, error_code from public.start_observation(%L, %L, 'unavailable', null, null, null, now(), 'timeout')$$,
  pg_temp.id('session'), gen_random_uuid()
)) as started(outcome text, error_code text);
select dblink_exec('p8_one', 'reset request.jwt.claims');

select is(
  (select value from race where key = 'start_before_pause') || ':' || (select value from race where key = 'start_after_pause'),
  'created:SESSION_PAUSED',
  'a start committed before the pause stands and a start after it is refused'
);

-- Replica mode skips the append-only and snapshot guards for fixture cleanup.
select dblink_exec('p8_setup', format($cleanup$
  set session_replication_role = replica;
  delete from public.location_events where class_id = %1$L;
  delete from public.observation_status_history where observation_id in (select id from public.observations where class_id = %1$L);
  delete from public.research_events where observation_id in (select id from public.observations where class_id = %1$L);
  delete from public.observations where class_id = %1$L;
  delete from public.notifications where class_id = %1$L;
  delete from public.research_events where class_id = %1$L;
  delete from public.audit_logs where class_id = %1$L;
  delete from public.session_events where class_id = %1$L;
  delete from public.session_participants where class_id = %1$L;
  delete from public.exploration_session_groups where class_id = %1$L;
  delete from public.exploration_sessions where class_id = %1$L;
  delete from public.activity_boundaries where activity_version_id = %4$L;
  delete from public.activity_versions where class_id = %1$L;
  delete from public.activities where class_id = %1$L;
  delete from public.group_membership_history where class_id = %1$L;
  delete from public.student_group_creation_claims where class_id = %1$L;
  delete from public.group_members where class_id = %1$L;
  delete from public.groups where class_id = %1$L;
  delete from public.class_members where class_id = %1$L;
  delete from public.classes where id = %1$L;
  delete from public.school_memberships where school_id = %2$L;
  delete from public.schools where id = %2$L;
  delete from public.profiles where id = any(%3$L::uuid[]);
  delete from auth.identities where user_id = any(%3$L::uuid[]);
  delete from auth.users where id = any(%3$L::uuid[]);
  set session_replication_role = origin;
$cleanup$,
  pg_temp.id('class'),
  pg_temp.id('school'),
  array[pg_temp.id('teacher'), pg_temp.id('a1'), pg_temp.id('a3')]::text,
  pg_temp.id('version')
));

select dblink_disconnect('p8_one');
select dblink_disconnect('p8_two');
select dblink_disconnect('p8_setup');

select * from finish();
rollback;
