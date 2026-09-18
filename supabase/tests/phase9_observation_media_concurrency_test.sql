begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public;

select plan(6);

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

select dblink_connect('p9_setup', pg_temp.connection_string());
select dblink_connect('p9_one', pg_temp.connection_string());
select dblink_connect('p9_two', pg_temp.connection_string());

select dblink_exec('p9_setup', format($fixture$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values
    (%1$L, %7$L || '.teacher@example.edu', now(), '{}'::jsonb),
    (%2$L, %7$L || '.a1@example.edu', now(), '{}'::jsonb),
    (%3$L, %7$L || '.a3@example.edu', now(), '{}'::jsonb);
  update public.profiles set account_type = 'teacher' where id = %1$L;
  insert into public.schools (id, name, created_by) values (%4$L, 'P9 Race School', %1$L);
  insert into public.school_memberships (school_id, user_id, role)
  select %4$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L]::uuid[]) as user_id;
  insert into public.classes (
    id, school_id, name, min_group_size, max_group_size, maximum_groups,
    allow_student_groups, group_formation_status, created_by
  )
  values (%5$L, %4$L, 'P9 Race Class', 1, 4, 5, true, 'open', %1$L);
  insert into public.class_members (class_id, user_id, role)
  select %5$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L]::uuid[]) as user_id;
$fixture$,
  pg_temp.id('teacher'), pg_temp.id('a1'), pg_temp.id('a3'), pg_temp.id('school'),
  pg_temp.id('class'), null, 'p9race-' || (select value from race where key = 'suffix')
));

select dblink_exec('p9_setup', pg_temp.autocommit_claims_sql('a1'));
insert into race (key, value)
select 'leaf', group_id::text
from dblink('p9_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Leaf'
)) as created(group_id uuid);

select dblink_exec('p9_setup', pg_temp.autocommit_claims_sql('a3'));
insert into race (key, value)
select 'root', group_id::text
from dblink('p9_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Root'
)) as created(group_id uuid);

select dblink_exec('p9_setup', 'reset request.jwt.claims');
select dblink_exec('p9_setup', format($fixture$
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

select dblink_exec('p9_setup', pg_temp.autocommit_claims_sql('teacher'));
insert into race (key, value)
select 'session', session_id::text
from dblink('p9_setup', format(
  'select session_id from public.create_exploration_session(%L, %L)', pg_temp.id('activity'), 'Race round'
)) as created(session_id uuid);
select * from dblink('p9_setup', format(
  'select outcome from public.open_exploration_session(%L, array[%L, %L]::uuid[])',
  pg_temp.id('session'), pg_temp.id('leaf'), pg_temp.id('root')
)) as opened(outcome text);
select dblink_exec('p9_setup', 'reset request.jwt.claims');

select dblink_exec('p9_setup', pg_temp.autocommit_claims_sql('teacher'));
select * from dblink('p9_setup', format(
  'select outcome from public.activate_session_group(%L, %L)', pg_temp.id('session'), pg_temp.id('leaf')
)) as activated(outcome text);
select dblink_exec('p9_setup', 'reset request.jwt.claims');

insert into race (key, value) values ('client', gen_random_uuid()::text);

-- The observation every race uses.
select dblink_exec('p9_setup', pg_temp.autocommit_claims_sql('a1'));
insert into race (key, value)
select 'observation', observation_id::text
from dblink('p9_setup', format(
  $$select observation_id from public.start_observation(%L, %L, 'captured', 13.755, 100.505, 8, now(), null)$$,
  pg_temp.id('session'), pg_temp.id('client')
)) as started(observation_id uuid);

-- Nine images already registered.
select * from dblink('p9_setup', format($$
  select count(*) from (
    select public.register_observation_media(%1$L, gen_random_uuid(), 'other', 'image/jpeg', 1000, 100, 100,
      encode(extensions.digest(n::text, 'sha256'), 'hex'), 'img-v1', now())
    from generate_series(1, 9) as n
  ) as registered
$$, pg_temp.id('observation'))) as filled(total bigint);
select dblink_exec('p9_setup', 'reset request.jwt.claims');

create function pg_temp.register_sql(client_id uuid, seed text)
returns text
language sql
as $$
  select format(
    $sql$select outcome, error_code from public.register_observation_media(%L, %L, 'leaf', 'image/jpeg', 1000, 100, 100,
      encode(extensions.digest(%L, 'sha256'), 'hex'), 'img-v1', now())$sql$,
    pg_temp.id('observation'), client_id, seed
  );
$$;

-- Race 1: two tabs register different images for the tenth and last slot.
select dblink_exec('p9_one', 'begin');
select dblink_exec('p9_one', pg_temp.claims_sql('a1'));
insert into race (key, value)
select 'slot_first', outcome || ':' || coalesce(error_code, '')
from dblink('p9_one', pg_temp.register_sql(gen_random_uuid(), 'tenth-a')) as registered(outcome text, error_code text);

select dblink_exec('p9_two', 'begin');
select dblink_exec('p9_two', pg_temp.claims_sql('a1'));
select dblink_send_query('p9_two', pg_temp.register_sql(gen_random_uuid(), 'tenth-b'));
select pg_sleep(0.5);
insert into race (key, value) values ('slot_blocked', dblink_is_busy('p9_two')::text);
select dblink_exec('p9_one', 'commit');
insert into race (key, value)
select 'slot_second', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p9_two') as registered(outcome text, error_code text);
select * from dblink_get_result('p9_two') as drained(outcome text, error_code text);
select dblink_exec('p9_two', 'commit');

select is(
  (select value from race where key = 'slot_first') || '|' || (select value from race where key = 'slot_blocked')
    || '|' || (select value from race where key = 'slot_second'),
  'created:|1|denied:IMAGE_LIMIT_EXCEEDED',
  'the last slot goes to exactly one registration; the other waits and is refused'
);
select is(
  (
    select total
    from dblink('p9_setup', format(
      'select count(*) from public.observation_media where observation_id = %L', pg_temp.id('observation')
    )) as counted(total bigint)
  ),
  10::bigint,
  'the observation holds exactly ten images'
);

-- Race 2: the same client media ID from two tabs after a slot frees up.
select dblink_exec('p9_setup', pg_temp.autocommit_claims_sql('a1'));
select * from dblink('p9_setup', format($$
  select outcome from public.delete_observation_media(%L,
    (select id from public.observation_media where observation_id = %L and position = 10))
$$, pg_temp.id('observation'), pg_temp.id('observation'))) as removed(outcome text);
select dblink_exec('p9_setup', 'reset request.jwt.claims');

insert into race (key, value) values ('media_client', gen_random_uuid()::text);

select dblink_exec('p9_one', 'begin');
select dblink_exec('p9_one', pg_temp.claims_sql('a1'));
insert into race (key, value)
select 'dup_first', outcome
from dblink('p9_one', pg_temp.register_sql((select value::uuid from race where key = 'media_client'), 'dup'))
  as registered(outcome text, error_code text);

select dblink_exec('p9_two', 'begin');
select dblink_exec('p9_two', pg_temp.claims_sql('a1'));
select dblink_send_query('p9_two', pg_temp.register_sql((select value::uuid from race where key = 'media_client'), 'dup'));
select pg_sleep(0.5);
select dblink_exec('p9_one', 'commit');
insert into race (key, value)
select 'dup_second', outcome
from dblink_get_result('p9_two') as registered(outcome text, error_code text);
select * from dblink_get_result('p9_two') as drained(outcome text, error_code text);
select dblink_exec('p9_two', 'commit');

select is(
  (select value from race where key = 'dup_first') || ':' || (select value from race where key = 'dup_second'),
  'created:existing',
  'a duplicate registration from a second tab resolves to the same reservation'
);
select is(
  (
    select total
    from dblink('p9_setup', format(
      $$select count(*) from public.research_events where event_name = 'photo_captured' and observation_id = %L$$,
      pg_temp.id('observation')
    )) as counted(total bigint)
  ),
  11::bigint,
  'each reservation emits exactly one photo_captured event'
);

-- Race 3: an upload in flight holds the reservation, so a delete waits and
-- then withdraws the image instead of orphaning the object.
insert into race (key, value)
select 'dup_path', path
from dblink('p9_setup', format(
  $$select storage_path from public.observation_media where client_media_id = %L$$,
  (select value from race where key = 'media_client')
)) as found(path text);

select dblink_exec('p9_one', 'begin');
select dblink_exec('p9_one', pg_temp.claims_sql('a1'));
select dblink_exec('p9_one', 'set local role authenticated');
select dblink_exec('p9_one', format(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('observation-images', %L, %L, jsonb_build_object('size', 1000, 'mimetype', 'image/jpeg'))$$,
  (select value from race where key = 'dup_path'), pg_temp.id('a1')
));

select dblink_exec('p9_two', 'begin');
select dblink_exec('p9_two', pg_temp.claims_sql('a1'));
select dblink_send_query('p9_two', format(
  $$select outcome, error_code from public.delete_observation_media(%L,
    (select id from public.observation_media where client_media_id = %L))$$,
  pg_temp.id('observation'), (select value from race where key = 'media_client')
));
select pg_sleep(0.5);
insert into race (key, value) values ('delete_blocked', dblink_is_busy('p9_two')::text);
select dblink_exec('p9_one', 'commit');
insert into race (key, value)
select 'delete_outcome', outcome
from dblink_get_result('p9_two') as removed(outcome text, error_code text);
select * from dblink_get_result('p9_two') as drained(outcome text, error_code text);
select dblink_exec('p9_two', 'commit');

select is((select value from race where key = 'delete_blocked'), '1', 'a delete waits for the in-flight upload');
select is(
  (select value from race where key = 'delete_outcome'),
  'deleting',
  'after the upload commits, the delete withdraws the image so the object can be removed'
);

-- Replica mode skips the append-only and snapshot guards for fixture cleanup.
select dblink_exec('p9_setup', format($cleanup$
  set session_replication_role = replica;
  delete from public.location_events where class_id = %1$L;
  delete from public.observation_status_history where observation_id in (select id from public.observations where class_id = %1$L);
  delete from public.research_events where observation_id in (select id from public.observations where class_id = %1$L);
  delete from storage.objects where bucket_id = 'observation-images' and name like %1$L || '/%%';
  delete from public.observation_media where class_id = %1$L;
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

select dblink_disconnect('p9_one');
select dblink_disconnect('p9_two');
select dblink_disconnect('p9_setup');

select * from finish();
rollback;
