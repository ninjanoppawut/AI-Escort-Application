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

select dblink_connect('p7_setup', pg_temp.connection_string());
select dblink_connect('p7_one', pg_temp.connection_string());
select dblink_connect('p7_two', pg_temp.connection_string());

select dblink_exec('p7_setup', format($fixture$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values
    (%1$L, %7$L || '.teacher@example.edu', now(), '{}'::jsonb),
    (%2$L, %7$L || '.a1@example.edu', now(), '{}'::jsonb),
    (%3$L, %7$L || '.a3@example.edu', now(), '{}'::jsonb);
  update public.profiles set account_type = 'teacher' where id = %1$L;
  insert into public.schools (id, name, created_by) values (%4$L, 'P7 Race School', %1$L);
  insert into public.school_memberships (school_id, user_id, role)
  select %4$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L]::uuid[]) as user_id;
  insert into public.classes (
    id, school_id, name, min_group_size, max_group_size, maximum_groups,
    allow_student_groups, group_formation_status, created_by
  )
  values (%5$L, %4$L, 'P7 Race Class', 1, 4, 5, true, 'open', %1$L);
  insert into public.class_members (class_id, user_id, role)
  select %5$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L]::uuid[]) as user_id;
$fixture$,
  pg_temp.id('teacher'), pg_temp.id('a1'), pg_temp.id('a3'), pg_temp.id('school'),
  pg_temp.id('class'), null, 'p7race-' || (select value from race where key = 'suffix')
));

select dblink_exec('p7_setup', pg_temp.autocommit_claims_sql('a1'));
insert into race (key, value)
select 'leaf', group_id::text
from dblink('p7_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Leaf'
)) as created(group_id uuid);

select dblink_exec('p7_setup', pg_temp.autocommit_claims_sql('a3'));
insert into race (key, value)
select 'root', group_id::text
from dblink('p7_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Root'
)) as created(group_id uuid);

select dblink_exec('p7_setup', 'reset request.jwt.claims');
select dblink_exec('p7_setup', format($fixture$
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

select dblink_exec('p7_setup', pg_temp.autocommit_claims_sql('teacher'));
insert into race (key, value)
select 'session', session_id::text
from dblink('p7_setup', format(
  'select session_id from public.create_exploration_session(%L, %L)', pg_temp.id('activity'), 'Race round'
)) as created(session_id uuid);
select * from dblink('p7_setup', format(
  'select outcome from public.open_exploration_session(%L, array[%L, %L]::uuid[])',
  pg_temp.id('session'), pg_temp.id('leaf'), pg_temp.id('root')
)) as opened(outcome text);
select dblink_exec('p7_setup', 'reset request.jwt.claims');

-- Race 1: two teacher sessions activate different groups at the same time.
select dblink_exec('p7_one', 'begin');
select dblink_exec('p7_one', pg_temp.claims_sql('teacher'));
insert into race (key, value)
select 'activate_first', outcome || ':' || coalesce(error_code, '')
from dblink('p7_one', format(
  'select outcome, error_code from public.activate_session_group(%L, %L)',
  pg_temp.id('session'), pg_temp.id('leaf')
)) as activated(outcome text, error_code text);

select dblink_exec('p7_two', 'begin');
select dblink_exec('p7_two', pg_temp.claims_sql('teacher'));
select dblink_send_query('p7_two', format(
  'select outcome, error_code from public.activate_session_group(%L, %L)',
  pg_temp.id('session'), pg_temp.id('root')
));
select pg_sleep(0.5);
insert into race (key, value) values ('activate_blocked', dblink_is_busy('p7_two')::text);
select dblink_exec('p7_one', 'commit');
insert into race (key, value)
select 'activate_second', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p7_two') as activated(outcome text, error_code text);
select * from dblink_get_result('p7_two') as drained(outcome text, error_code text);
select dblink_exec('p7_two', 'commit');

select is((select value from race where key = 'activate_first'), 'activated:', 'the first activation succeeds');
select is((select value from race where key = 'activate_blocked'), '1', 'the second activation waits on the session lock');
select is(
  (select value from race where key = 'activate_second'),
  'denied:ACTIVE_GROUP_CONFLICT',
  'the second activation sees the committed active group and is refused'
);
select is(
  (
    select active_groups
    from dblink('p7_setup', format(
      'select count(*) from public.exploration_session_groups where session_id = %L and status = %L',
      pg_temp.id('session'), 'active'
    )) as counted(active_groups bigint)
  ),
  1::bigint,
  'exactly one group is active'
);

-- Race 2: a durable sample in flight holds the session share lock, so a pause
-- waits for it; once the pause commits, the next sample is refused.
select dblink_exec('p7_one', 'begin');
select dblink_exec('p7_one', pg_temp.claims_sql('a1'));
insert into race (key, value)
select 'sample_first', outcome || ':' || coalesce(error_code, '')
from dblink('p7_one', format(
  'select outcome, error_code from public.record_live_location_sample(%L, %L, 13.755, 100.505, 8, now())',
  pg_temp.id('session'), gen_random_uuid()
)) as recorded(outcome text, error_code text);

select dblink_exec('p7_two', 'begin');
select dblink_exec('p7_two', pg_temp.claims_sql('teacher'));
select dblink_send_query('p7_two', format(
  'select outcome, error_code from public.pause_exploration_session(%L)', pg_temp.id('session')
));
select pg_sleep(0.5);
insert into race (key, value) values ('pause_blocked', dblink_is_busy('p7_two')::text);
select dblink_exec('p7_one', 'commit');
insert into race (key, value)
select 'pause', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p7_two') as paused(outcome text, error_code text);
select * from dblink_get_result('p7_two') as drained(outcome text, error_code text);
select dblink_exec('p7_two', 'commit');

select dblink_exec('p7_one', pg_temp.autocommit_claims_sql('a1'));
insert into race (key, value)
select 'sample_after_pause', outcome || ':' || coalesce(error_code, '')
from dblink('p7_one', format(
  'select outcome, error_code from public.record_live_location_sample(%L, %L, 13.755, 100.505, 8, now())',
  pg_temp.id('session'), gen_random_uuid()
)) as recorded(outcome text, error_code text);
select dblink_exec('p7_one', 'reset request.jwt.claims');

select is((select value from race where key = 'sample_first'), 'recorded:', 'a sample records while the group is active');
select is((select value from race where key = 'pause_blocked'), '1', 'pause waits for the in-flight sample');
select is((select value from race where key = 'pause'), 'paused:', 'pause commits after the sample');
select is(
  (select value from race where key = 'sample_after_pause'),
  'denied:SESSION_PAUSED',
  'no sample is recorded after the pause commits'
);

-- Replica mode skips the append-only and snapshot guards for fixture cleanup.
select dblink_exec('p7_setup', format($cleanup$
  set session_replication_role = replica;
  delete from public.location_events where class_id = %1$L;
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

select dblink_disconnect('p7_one');
select dblink_disconnect('p7_two');
select dblink_disconnect('p7_setup');

select * from finish();
rollback;
