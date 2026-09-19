begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public;

select plan(9);

-- Real concurrent sessions through dblink. Fixtures are committed by those
-- sessions, so every run uses fresh IDs and cleans up at the end.
create temporary table race (
  key text primary key,
  value text not null
);

insert into race (key, value)
select key, gen_random_uuid()::text
from unnest(array['teacher', 'teacher2', 'a1', 'a3', 'school', 'class', 'activity', 'version']) as key;
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

select dblink_connect('p12_setup', pg_temp.connection_string());
select dblink_connect('p12_one', pg_temp.connection_string());
select dblink_connect('p12_two', pg_temp.connection_string());

select dblink_exec('p12_setup', format($fixture$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values
    (%1$L, %7$L || '.teacher@example.edu', now(), '{}'::jsonb),
    (%2$L, %7$L || '.a1@example.edu', now(), '{}'::jsonb),
    (%3$L, %7$L || '.a3@example.edu', now(), '{}'::jsonb),
    (%6$L, %7$L || '.teacher2@example.edu', now(), '{}'::jsonb);
  update public.profiles set account_type = 'teacher' where id in (%1$L, %6$L);
  insert into public.schools (id, name, created_by) values (%4$L, 'P12 Race School', %1$L);
  insert into public.school_memberships (school_id, user_id, role)
  select %4$L, user_id, case when user_id in (%1$L::uuid, %6$L::uuid) then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L, %6$L]::uuid[]) as user_id;
  insert into public.classes (
    id, school_id, name, min_group_size, max_group_size, maximum_groups,
    allow_student_groups, group_formation_status, created_by
  )
  values (%5$L, %4$L, 'P12 Race Class', 1, 4, 5, true, 'open', %1$L);
  insert into public.class_members (class_id, user_id, role)
  select %5$L, user_id, case when user_id in (%1$L::uuid, %6$L::uuid) then 'teacher' else 'student' end
  from unnest(array[%1$L, %2$L, %3$L, %6$L]::uuid[]) as user_id;
$fixture$,
  pg_temp.id('teacher'), pg_temp.id('a1'), pg_temp.id('a3'), pg_temp.id('school'),
  pg_temp.id('class'), pg_temp.id('teacher2'), 'p12race-' || (select value from race where key = 'suffix')
));

select dblink_exec('p12_setup', pg_temp.autocommit_claims_sql('a1'));
insert into race (key, value)
select 'leaf', group_id::text
from dblink('p12_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Leaf'
)) as created(group_id uuid);

select dblink_exec('p12_setup', pg_temp.autocommit_claims_sql('a3'));
insert into race (key, value)
select 'root', group_id::text
from dblink('p12_setup', format(
  'select group_id from public.create_student_group(%L, %L, null)', pg_temp.id('class'), 'Root'
)) as created(group_id uuid);

select dblink_exec('p12_setup', 'reset request.jwt.claims');
select dblink_exec('p12_setup', format($fixture$
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

select dblink_exec('p12_setup', pg_temp.autocommit_claims_sql('teacher'));
insert into race (key, value)
select 'session', session_id::text
from dblink('p12_setup', format(
  'select session_id from public.create_exploration_session(%L, %L)', pg_temp.id('activity'), 'Race round'
)) as created(session_id uuid);
select * from dblink('p12_setup', format(
  'select outcome from public.open_exploration_session(%L, array[%L, %L]::uuid[])',
  pg_temp.id('session'), pg_temp.id('leaf'), pg_temp.id('root')
)) as opened(outcome text);
select dblink_exec('p12_setup', 'reset request.jwt.claims');

select dblink_exec('p12_setup', pg_temp.autocommit_claims_sql('teacher'));
select * from dblink('p12_setup', format(
  'select outcome from public.activate_session_group(%L, %L)', pg_temp.id('session'), pg_temp.id('leaf')
)) as activated(outcome text);
select dblink_exec('p12_setup', 'reset request.jwt.claims');


-- P12 fixtures: three submitted observations by a1 ------------------------------------------

insert into race (key, value)
select key, gen_random_uuid()::text
from unnest(array['obs_a', 'media_a', 'obs_b', 'media_b', 'obs_c', 'media_c', 'resubmission']) as key;

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
      perform * from public.submit_observation(observation_id, gen_random_uuid(), 2, false);
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
  select id from dblink('p12_setup', format(
    'select id from public.observations where client_generated_id = %L', client_id
  )) as found(id uuid);
$$;

create function pg_temp.scalar(statement text)
returns text
language sql
as $$
  select value from dblink('p12_setup', statement) as found(value text);
$$;

create function pg_temp.latest_submission(observation_id uuid)
returns uuid
language sql
as $$
  select pg_temp.scalar(format(
    'select id::text from public.observation_submissions where observation_id = %L order by submission_number desc limit 1',
    observation_id))::uuid;
$$;

select dblink_exec('p12_setup', pg_temp.prepare_sql(pg_temp.id('obs_a'), pg_temp.id('media_a'), 'ราชพฤกษ์', 'Cassia fistula'));
select dblink_exec('p12_setup', pg_temp.prepare_sql(pg_temp.id('obs_b'), pg_temp.id('media_b'), 'มะม่วง', 'Mangifera indica'));
select dblink_exec('p12_setup', pg_temp.prepare_sql(pg_temp.id('obs_c'), pg_temp.id('media_c'), 'ชบา', 'Hibiscus rosa-sinensis'));

-- Race 1 (TEST_STRATEGY race 7): two teachers decide the same submitted version.
select dblink_exec('p12_one', 'begin');
select dblink_exec('p12_one', pg_temp.claims_sql('teacher'));
insert into race (key, value)
select 'decide_first', outcome
from dblink('p12_one', format(
  $$select outcome, error_code from public.review_observation(%L, %L, 'verified', null, null, '{}'::jsonb, null, null)$$,
  pg_temp.observation_by_client(pg_temp.id('obs_a')), pg_temp.latest_submission(pg_temp.observation_by_client(pg_temp.id('obs_a')))
)) as decided(outcome text, error_code text);

select dblink_exec('p12_two', 'begin');
select dblink_exec('p12_two', pg_temp.claims_sql('teacher2'));
select dblink_send_query('p12_two', format(
  $$select outcome, error_code from public.review_observation(%L, %L, 'unable_to_verify', null, null, '{}'::jsonb, 'หลักฐานไม่พอ', null)$$,
  pg_temp.observation_by_client(pg_temp.id('obs_a')), pg_temp.latest_submission(pg_temp.observation_by_client(pg_temp.id('obs_a')))
));
select pg_sleep(0.5);
insert into race (key, value) values ('decide_blocked', dblink_is_busy('p12_two')::text);
select dblink_exec('p12_one', 'commit');
insert into race (key, value)
select 'decide_second', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p12_two') as decided(outcome text, error_code text);
select * from dblink_get_result('p12_two') as drained(outcome text, error_code text);
select dblink_exec('p12_two', 'commit');

select is((select value from race where key = 'decide_first'), 'decided', 'the first teacher decides');
select is(
  (select value from race where key = 'decide_blocked') || ':' || (select value from race where key = 'decide_second'),
  '1:denied:OBSERVATION_VERSION_CONFLICT',
  'the second teacher waits on the observation lock and cannot land on the decided version'
);
select is(
  pg_temp.scalar(format(
    $$select count(*)::text || ':' || string_agg(decision, ',') from public.teacher_reviews where observation_id = %L$$,
    pg_temp.observation_by_client(pg_temp.id('obs_a')))),
  '1:verified',
  'exactly one review row exists for that version'
);

-- Race 2: a resubmission ends the round while a teacher grants a pending request.
select dblink_exec('p12_setup', pg_temp.autocommit_claims_sql('teacher'));
select pg_temp.scalar(format(
  $$select outcome from public.review_observation(%L, %L, 'revision_required', null, null, '{}'::jsonb, 'ตรวจชื่อวิทยาศาสตร์อีกครั้ง', array['scientific_name'])$$,
  pg_temp.observation_by_client(pg_temp.id('obs_b')), pg_temp.latest_submission(pg_temp.observation_by_client(pg_temp.id('obs_b')))));
select dblink_exec('p12_setup', pg_temp.autocommit_claims_sql('a1'));
select pg_temp.scalar(format(
  $$select outcome from public.save_observation_revision(%L, 4, 'มะม่วง', 'Mangifera caesia', 'ดอกสีเหลืองห้อยเป็นช่อยาว ใบประกอบแบบขนนก', null, '[]'::jsonb)$$,
  pg_temp.observation_by_client(pg_temp.id('obs_b'))));
insert into race (key, value)
select 'request', pg_temp.scalar(format(
  $$select request_id::text from public.request_additional_revision_fields(%L, array['common_name'], 'พบชื่อท้องถิ่นเพิ่ม')$$,
  pg_temp.observation_by_client(pg_temp.id('obs_b'))));
select dblink_exec('p12_setup', 'reset request.jwt.claims');

select dblink_exec('p12_one', 'begin');
select dblink_exec('p12_one', pg_temp.claims_sql('a1'));
insert into race (key, value)
select 'resubmit', outcome || ':' || coalesce(error_code, '')
from dblink('p12_one', format(
  $$select outcome, error_code from public.resubmit_observation(%L, %L, 5, false)$$,
  pg_temp.observation_by_client(pg_temp.id('obs_b')), pg_temp.id('resubmission')
)) as resubmitted(outcome text, error_code text);

select dblink_exec('p12_two', 'begin');
select dblink_exec('p12_two', pg_temp.claims_sql('teacher'));
select dblink_send_query('p12_two', format(
  $$select outcome, error_code from public.decide_revision_unlock_request(%L, 'granted', null, null)$$,
  (select value from race where key = 'request')
));
select pg_sleep(0.5);
insert into race (key, value) values ('grant_blocked', dblink_is_busy('p12_two')::text);
select dblink_exec('p12_one', 'commit');
insert into race (key, value)
select 'grant', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p12_two') as decided(outcome text, error_code text);
select * from dblink_get_result('p12_two') as drained(outcome text, error_code text);
select dblink_exec('p12_two', 'commit');

select is((select value from race where key = 'resubmit'), 'resubmitted:', 'the student resubmits');
select is(
  (select value from race where key = 'grant_blocked') || ':' || (select value from race where key = 'grant'),
  '1:denied:INVALID_STATUS_TRANSITION',
  'the grant waits and then finds the request already closed by the resubmission'
);
select is(
  pg_temp.scalar(format(
    $$select (select string_agg(field_key, ',') from public.observation_revision_topics where observation_id = %1$L)
       || '|' || (select status from public.observation_unlock_requests where observation_id = %1$L)$$,
    pg_temp.observation_by_client(pg_temp.id('obs_b')))),
  'scientific_name|cancelled',
  'no topic opens after the round ended'
);

-- Race 3: two reports from the same classmate at once make one report.
select dblink_exec('p12_one', 'begin');
select dblink_exec('p12_one', pg_temp.claims_sql('a3'));
insert into race (key, value)
select 'report_first', outcome
from dblink('p12_one', format(
  $$select outcome, error_code from public.report_observation_issue(%L, 'identity', 'ชื่อพืชอาจไม่ตรงกับรูป')$$,
  pg_temp.observation_by_client(pg_temp.id('obs_c'))
)) as reported(outcome text, error_code text);

select dblink_exec('p12_two', 'begin');
select dblink_exec('p12_two', pg_temp.claims_sql('a3'));
select dblink_send_query('p12_two', format(
  $$select outcome, error_code from public.report_observation_issue(%L, 'image', 'ภาพไม่ตรงกับพืชที่บันทึก')$$,
  pg_temp.observation_by_client(pg_temp.id('obs_c'))
));
select pg_sleep(0.5);
insert into race (key, value) values ('report_blocked', dblink_is_busy('p12_two')::text);
select dblink_exec('p12_one', 'commit');
insert into race (key, value)
select 'report_second', outcome || ':' || coalesce(error_code, '')
from dblink_get_result('p12_two') as reported(outcome text, error_code text);
select * from dblink_get_result('p12_two') as drained(outcome text, error_code text);
select dblink_exec('p12_two', 'commit');

select is(
  (select value from race where key = 'report_first') || ':' || (select value from race where key = 'report_blocked'),
  'reported:1',
  'the first report lands and the second waits on the reporter lock'
);
select is((select value from race where key = 'report_second'), 'denied:RATE_LIMITED', 'the second is rate limited');
select is(
  pg_temp.scalar(format(
    'select count(*)::text from public.observation_issue_reports where observation_id = %L',
    pg_temp.observation_by_client(pg_temp.id('obs_c')))),
  '1',
  'exactly one report row exists'
);

-- Replica mode skips the append-only and snapshot guards for fixture cleanup.
select dblink_exec('p12_setup', format($cleanup$
  set session_replication_role = replica;
  delete from public.location_events where class_id = %1$L;
  update public.observations set latest_review_id = null where class_id = %1$L;
  delete from public.observation_revision_topics where class_id = %1$L;
  delete from public.observation_unlock_requests where class_id = %1$L;
  delete from public.observation_issue_reports where class_id = %1$L;
  delete from public.teacher_reviews where class_id = %1$L;
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
  array[pg_temp.id('teacher'), pg_temp.id('teacher2'), pg_temp.id('a1'), pg_temp.id('a3')]::text,
  pg_temp.id('version')
));

select dblink_disconnect('p12_one');
select dblink_disconnect('p12_two');
select dblink_disconnect('p12_setup');

select * from finish();
rollback;
