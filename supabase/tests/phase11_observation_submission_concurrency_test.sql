begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public;

select plan(7);

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

select dblink_connect('p11_setup', pg_temp.connection_string());
select dblink_connect('p11_one', pg_temp.connection_string());
select dblink_connect('p11_two', pg_temp.connection_string());

select dblink_exec('p11_setup', format($fixture$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values
    (%1$L, %7$L || '.teacher@example.edu', now(), '{}'::jsonb),
    (%2$L, %7$L || '.a1@example.edu', now(), '{}'::jsonb),
    (%3$L, %7$L || '.a3@example.edu', now(), '{}'::jsonb);
  update public.profiles set account_type = 'teacher' where id = %1$L;
  insert into public.schools (id, name, created_by) values (%4$L, 'P11 Race School', %1$L);
  insert into public.school_memberships (school_id, user_id, role)
  select %4$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L]::uuid[]) as user_id;
  insert into public.classes (
    id, school_id, name, min_group_size, max_group_size, maximum_groups,
    allow_student_groups, group_formation_status, created_by
  )
  values (%5$L, %4$L, 'P11 Race Class', 1, 4, 5, true, 'open', %1$L);
  insert into public.class_members (class_id, user_id, role)
  select %5$L, user_id, case when user_id = %1$L::uuid then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L]::uuid[]) as user_id;
$fixture$,
  pg_temp.id('teacher'), pg_temp.id('a1'), pg_temp.id('a3'), pg_temp.id('school'),
  pg_temp.id('class'), null, 'p11race-' || (select value from race where key = 'suffix')
));

select dblink_exec('p11_setup', pg_temp.autocommit_claims_sql('a1'));
insert into race (key, value)
select 'leaf', group_id::text
from dblink('p11_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Leaf'
)) as created(group_id uuid);

select dblink_exec('p11_setup', pg_temp.autocommit_claims_sql('a3'));
insert into race (key, value)
select 'root', group_id::text
from dblink('p11_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Root'
)) as created(group_id uuid);

select dblink_exec('p11_setup', 'reset request.jwt.claims');
select dblink_exec('p11_setup', format($fixture$
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

select dblink_exec('p11_setup', pg_temp.autocommit_claims_sql('teacher'));
insert into race (key, value)
select 'session', session_id::text
from dblink('p11_setup', format(
  'select session_id from public.create_exploration_session(%L, %L)', pg_temp.id('activity'), 'Race round'
)) as created(session_id uuid);
select * from dblink('p11_setup', format(
  'select outcome from public.open_exploration_session(%L, array[%L, %L]::uuid[])',
  pg_temp.id('session'), pg_temp.id('leaf'), pg_temp.id('root')
)) as opened(outcome text);
select dblink_exec('p11_setup', 'reset request.jwt.claims');

select dblink_exec('p11_setup', pg_temp.autocommit_claims_sql('teacher'));
select * from dblink('p11_setup', format(
  'select outcome from public.activate_session_group(%L, %L)', pg_temp.id('session'), pg_temp.id('leaf')
)) as activated(outcome text);
select dblink_exec('p11_setup', 'reset request.jwt.claims');

insert into race (key, value) values ('client', gen_random_uuid()::text);

-- Prepares a reviewed observation for a1 with one uploaded whole-plant image.
create function pg_temp.prepare_sql(client_id uuid, media_client_id uuid, common_name text, scientific_name text)
returns text
language sql
as $$
  select format($prepare$
    do $body$
    declare
      observation_id uuid;
      media jsonb;
    begin
      perform set_config('request.jwt.claims', %1$L, false);
      select started.observation_id into observation_id
      from public.start_observation(%2$L, %3$L, 'captured', 13.755, 100.505, 8, now(), null) as started;
      select registered.media into media
      from public.register_observation_media(observation_id, %4$L, 'whole_plant', 'image/jpeg', 1000, 100, 100,
        encode(extensions.digest(%4$L::text, 'sha256'), 'hex'), 'img-v1', now()) as registered;
      insert into storage.objects (bucket_id, name, owner_id, metadata)
      values ('observation-images', media #>> '{upload,path}', %5$L,
        jsonb_build_object('size', 1000, 'mimetype', 'image/jpeg'));
      perform * from public.complete_observation_media_upload(observation_id, (media ->> 'id')::uuid, 1);
      perform * from public.save_student_review(observation_id, 1, 'manual', %6$L, %7$L,
        'ดอกสีเหลืองห้อยเป็นช่อยาว ใบประกอบแบบขนนก', null, '[]'::jsonb);
      perform set_config('request.jwt.claims', '', false);
    end;
    $body$;
  $prepare$,
    jsonb_build_object('sub', pg_temp.id('a1'), 'role', 'authenticated', 'aal', 'aal1')::text,
    pg_temp.id('session'), client_id, media_client_id, pg_temp.id('a1')::text, common_name, scientific_name
  );
$$;

create function pg_temp.observation_by_client(client_id uuid)
returns uuid
language sql
as $$
  select id from dblink('p11_setup', format(
    'select id from public.observations where client_generated_id = %L', client_id
  )) as found(id uuid);
$$;

create function pg_temp.submit_sql(observation_id uuid, client_id uuid, acknowledge boolean)
returns text
language sql
as $$
  select format(
    'select outcome, error_code from public.submit_observation(%L, %L, 2, %L)',
    observation_id, client_id, acknowledge
  );
$$;

insert into race (key, value)
select key, gen_random_uuid()::text
from unnest(array['obs_mango', 'media_mango', 'obs_a', 'media_a', 'obs_b', 'media_b', 'submission']) as key;

select dblink_exec('p11_setup', pg_temp.prepare_sql(pg_temp.id('obs_mango'), pg_temp.id('media_mango'), 'มะม่วง', 'Mangifera indica'));
select dblink_exec('p11_setup', pg_temp.prepare_sql(pg_temp.id('obs_a'), pg_temp.id('media_a'), 'ราชพฤกษ์', 'Cassia fistula'));
select dblink_exec('p11_setup', pg_temp.prepare_sql(pg_temp.id('obs_b'), pg_temp.id('media_b'), 'ราชพฤกษ์', 'Cassia fistula L.'));

-- Race 1: the same client submission ID from two tabs submits once.
select dblink_exec('p11_one', 'begin');
select dblink_exec('p11_one', pg_temp.claims_sql('a1'));
insert into race (key, value)
select 'dup_first', outcome
from dblink('p11_one', pg_temp.submit_sql(pg_temp.observation_by_client(pg_temp.id('obs_mango')), pg_temp.id('submission'), false))
  as submitted(outcome text, error_code text);

select dblink_exec('p11_two', 'begin');
select dblink_exec('p11_two', pg_temp.claims_sql('a1'));
select dblink_send_query('p11_two', pg_temp.submit_sql(pg_temp.observation_by_client(pg_temp.id('obs_mango')), pg_temp.id('submission'), false));
select pg_sleep(0.5);
insert into race (key, value) values ('dup_blocked', dblink_is_busy('p11_two')::text);
select dblink_exec('p11_one', 'commit');
insert into race (key, value)
select 'dup_second', outcome
from dblink_get_result('p11_two') as submitted(outcome text, error_code text);
select * from dblink_get_result('p11_two') as drained(outcome text, error_code text);
select dblink_exec('p11_two', 'commit');

select is(
  (select value from race where key = 'dup_first') || ':' || (select value from race where key = 'dup_blocked')
    || ':' || (select value from race where key = 'dup_second'),
  'submitted:1:existing',
  'a duplicate submit waits on the observation lock and returns the same submission'
);
select is(
  (
    select total
    from dblink('p11_setup', format(
      'select count(*) from public.observation_submissions where client_submission_id = %L', pg_temp.id('submission')
    )) as counted(total bigint)
  ),
  1::bigint,
  'exactly one submission row exists'
);

-- Race 2: two records of the same species submitted at once; the advisory lock
-- makes the second see the first, so the tag is never missed.
select dblink_exec('p11_one', 'begin');
select dblink_exec('p11_one', pg_temp.claims_sql('a1'));
insert into race (key, value)
select 'species_first', outcome || ':' || coalesce(error_code, '')
from dblink('p11_one', pg_temp.submit_sql(pg_temp.observation_by_client(pg_temp.id('obs_a')), gen_random_uuid(), false))
  as submitted(outcome text, error_code text);

select dblink_exec('p11_two', 'begin');
select dblink_exec('p11_two', pg_temp.claims_sql('a1'));
select dblink_send_query('p11_two', pg_temp.submit_sql(pg_temp.observation_by_client(pg_temp.id('obs_b')), gen_random_uuid(), false));
select pg_sleep(0.5);
insert into race (key, value) values ('species_blocked', dblink_is_busy('p11_two')::text);
select dblink_exec('p11_one', 'commit');
insert into race (key, value)
select 'species_second', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p11_two') as submitted(outcome text, error_code text);
select * from dblink_get_result('p11_two') as drained(outcome text, error_code text);
select dblink_exec('p11_two', 'commit');

select is((select value from race where key = 'species_first'), 'submitted:', 'the first same-species record submits');
select is((select value from race where key = 'species_blocked'), '1', 'the second waits on the same-species lock');
select is(
  (select value from race where key = 'species_second'),
  'denied:SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED',
  'the second sees the first and asks for acknowledgement instead of missing the match'
);

select dblink_exec('p11_one', pg_temp.autocommit_claims_sql('a1'));
insert into race (key, value)
select 'species_ack', outcome
from dblink('p11_one', pg_temp.submit_sql(pg_temp.observation_by_client(pg_temp.id('obs_b')), gen_random_uuid(), true))
  as submitted(outcome text, error_code text);
select dblink_exec('p11_one', 'reset request.jwt.claims');

select is((select value from race where key = 'species_ack'), 'submitted', 'the acknowledged record submits');
select is(
  (
    select state
    from dblink('p11_setup', format(
      $$select string_agg(relationship_type, ',' order by relationship_type)
        from public.observation_duplicate_candidates where class_id = %L$$,
      pg_temp.id('class')
    )) as found(state text)
  ),
  'possible_same_specimen,same_species',
  'the pair is recorded once as same species and as a possible same specimen'
);

-- Replica mode skips the append-only and snapshot guards for fixture cleanup.
select dblink_exec('p11_setup', format($cleanup$
  set session_replication_role = replica;
  delete from public.location_events where class_id = %1$L;
  delete from public.observation_status_history where observation_id in (select id from public.observations where class_id = %1$L);
  delete from public.research_events where observation_id in (select id from public.observations where class_id = %1$L);
  delete from public.observation_relation_events where class_id = %1$L;
  delete from public.observation_duplicate_candidates where class_id = %1$L;
  delete from public.observation_submission_media where observation_id in (select id from public.observations where class_id = %1$L);
  delete from public.observation_submissions where class_id = %1$L;
  delete from public.student_trait_verifications where class_id = %1$L;
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

select dblink_disconnect('p11_one');
select dblink_disconnect('p11_two');
select dblink_disconnect('p11_setup');

select * from finish();
rollback;
