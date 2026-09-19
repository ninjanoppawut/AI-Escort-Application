begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(33);

-- P12 review, revision, unlock, and issue-report rules. Identities: teacher,
-- other-school teacher, Leaf leader a1 and member a2, Root leader a3,
-- unassigned classmate u1.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000012001', 'p12.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000012002', 'p12.other.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000012003', 'p12.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000012004', 'p12.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000012005', 'p12.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000012006', 'p12.u1@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000012001', '00000000-0000-0000-0000-000000012002');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000012001', 'P12 School', '00000000-0000-0000-0000-000000012001'),
  ('10000000-0000-0000-0000-000000012002', 'P12 Other School', '00000000-0000-0000-0000-000000012002');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000012001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000012001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000012001', '00000000-0000-0000-0000-000000012003',
  '00000000-0000-0000-0000-000000012004', '00000000-0000-0000-0000-000000012005',
  '00000000-0000-0000-0000-000000012006'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000012002', '00000000-0000-0000-0000-000000012002', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000012001', '10000000-0000-0000-0000-000000012001', 'P12 Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000012001'),
  ('20000000-0000-0000-0000-000000012002', '10000000-0000-0000-0000-000000012002', 'P12 Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000012002');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000012001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000012001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000012001', '00000000-0000-0000-0000-000000012003',
  '00000000-0000-0000-0000-000000012004', '00000000-0000-0000-0000-000000012005',
  '00000000-0000-0000-0000-000000012006'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000012002', '00000000-0000-0000-0000-000000012002', 'teacher');

create temporary table p12_results (label text primary key, row jsonb not null);
grant all on table p12_results to authenticated, anon;

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
  execute format('insert into p12_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p12_results where label = label_value;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000012001' and name = group_name;
$$;

create function pg_temp.session_id()
returns uuid
language sql
as $$
  select (row ->> 'session_id')::uuid from p12_results where label = 'session';
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
  select (row ->> 'observation_id')::uuid from p12_results where label = label_value;
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000012003');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000012001', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000012001', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000012004', 'member', '00000000-0000-0000-0000-000000012003');

select pg_temp.act_as('00000000-0000-0000-0000-000000012005');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000012001', 'Root', null);
reset role;

insert into public.activities (id, class_id, title, status, created_by)
values ('60000000-0000-0000-0000-000000012001', '20000000-0000-0000-0000-000000012001', 'Garden survey', 'published', '00000000-0000-0000-0000-000000012001');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000012001', '60000000-0000-0000-0000-000000012001', '20000000-0000-0000-0000-000000012001', 1, 'Garden survey', '00000000-0000-0000-0000-000000012001');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000012001', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000012001'
where id = '61000000-0000-0000-0000-000000012001';

select pg_temp.act_as('00000000-0000-0000-0000-000000012001');
set local role authenticated;
select pg_temp.call('session', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000012001', 'Morning round')$$);
select pg_temp.call('open', format(
  $$select * from public.open_exploration_session(%L, array[%L, %L]::uuid[])$$,
  pg_temp.session_id(), pg_temp.group_named('Leaf'), pg_temp.group_named('Root')
));
select pg_temp.call('activate', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
reset role;

-- P9 helpers --------------------------------------------------------------------------

create function pg_temp.hash(seed text)
returns text
language sql
as $$
  select encode(extensions.digest(seed, 'sha256'), 'hex');
$$;

create function pg_temp.register_as(
  label_value text,
  actor uuid,
  observation uuid,
  client_id uuid,
  category text,
  mime text,
  bytes bigint,
  width integer,
  height integer,
  image_hash text,
  version_label text
)
returns void
language plpgsql
as $$
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  perform pg_temp.call(label_value, format(
    $sql$select * from public.register_observation_media(%L, %L, %L, %L, %L, %L, %L, %L, %L, now())$sql$,
    observation, client_id, category, mime, bytes, width, height, image_hash, version_label
  ));
  reset role;
end;
$$;

create function pg_temp.media_call(label_value text, actor uuid, statement text)
returns void
language plpgsql
as $$
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  perform pg_temp.call(label_value, statement);
  reset role;
end;
$$;

create function pg_temp.media_id(label_value text)
returns uuid
language sql
as $$
  select (row #>> '{media,id}')::uuid from p12_results where label = label_value;
$$;

create function pg_temp.media_path(label_value text)
returns text
language sql
as $$
  select row #>> '{media,upload,path}' from p12_results where label = label_value;
$$;

-- Attempts a Storage object write as a user; true when RLS allows it.
create function pg_temp.store_as(actor uuid, object_name text, owner_text text, bytes bigint, mime text)
returns boolean
language plpgsql
as $$
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('observation-images', object_name, owner_text,
      jsonb_build_object('size', bytes, 'mimetype', mime));
  exception when insufficient_privilege then
    reset role;
    return false;
  end;
  reset role;
  return true;
end;
$$;

create function pg_temp.visible_objects(actor uuid, object_name text)
returns bigint
language plpgsql
as $$
declare
  visible bigint;
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  select count(*) into visible from storage.objects
  where bucket_id = 'observation-images' and name = object_name;
  reset role;
  return visible;
end;
$$;

create function pg_temp.remove_as(actor uuid, object_name text)
returns bigint
language plpgsql
as $$
declare
  removed bigint;
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  perform pg_temp.act_as(actor);
  set local role authenticated;
  delete from storage.objects where bucket_id = 'observation-images' and name = object_name;
  get diagnostics removed = row_count;
  reset role;
  return removed;
end;
$$;

-- P12 helpers --------------------------------------------------------------------------

-- Starts an observation at a position and gives it one uploaded image.
create function pg_temp.prepare(label_value text, actor uuid, seed integer, lat double precision, lng double precision, category text)
returns void
language plpgsql
as $$
declare
  media_path text;
  media uuid;
begin
  perform pg_temp.start_as(label_value, actor,
    ('80000000-0000-0000-0000-0000000120' || lpad(seed::text, 2, '0'))::uuid, 'captured', lat, lng, 8, now(), null);
  perform pg_temp.register_as(label_value || '_media', actor, pg_temp.observation_of(label_value),
    ('90000000-0000-0000-0000-0000000120' || lpad(seed::text, 2, '0'))::uuid, category, 'image/jpeg', 1000, 100, 100,
    pg_temp.hash(label_value), 'img-v1');
  media_path := pg_temp.media_path(label_value || '_media');
  media := pg_temp.media_id(label_value || '_media');
  perform pg_temp.store_as(actor, media_path, actor::text, 1000, 'image/jpeg');
  perform pg_temp.media_call(label_value || '_confirm', actor,
    format($sql$select * from public.complete_observation_media_upload(%L, %L, 1)$sql$, pg_temp.observation_of(label_value), media));
end;
$$;

create function pg_temp.review_as(
  label_value text, actor uuid, observation uuid, expected integer, source text,
  common text, scientific text, evidence text, traits jsonb
)
returns void
language plpgsql
as $$
begin
  perform pg_temp.media_call(label_value, actor, format(
    $sql$select * from public.save_student_review(%L, %L, %L, %L, %L, %L, null, %L)$sql$,
    observation, expected, source, common, scientific, evidence, traits
  ));
end;
$$;

create function pg_temp.submit_as(label_value text, actor uuid, observation uuid, client_id uuid, expected integer, acknowledge boolean)
returns void
language plpgsql
as $$
begin
  perform pg_temp.media_call(label_value, actor, format(
    $sql$select * from public.submit_observation(%L, %L, %L, %L)$sql$, observation, client_id, expected, acknowledge
  ));
end;
$$;

create function pg_temp.version_of(label_value text)
returns integer
language sql
as $$
  select version from public.observations where id = pg_temp.observation_of(label_value);
$$;

create function pg_temp.teacher_sees(actor uuid, statement text)
returns bigint
language plpgsql
as $$
declare
  seen bigint;
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  execute statement into seen;
  reset role;
  return seen;
end;
$$;

-- P12 helpers -------------------------------------------------------------------------

-- Runs a statement as a user; returns the error message, or 'ok'.
create function pg_temp.raises_as(actor uuid, statement text)
returns text
language plpgsql
as $$
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  begin
    execute statement;
  exception when others then
    reset role;
    return sqlerrm;
  end;
  reset role;
  return 'ok';
end;
$$;

create function pg_temp.submission_of(label_value text, number_value integer)
returns uuid
language sql
as $$
  select id from public.observation_submissions
  where observation_id = pg_temp.observation_of(label_value) and submission_number = number_value;
$$;

create function pg_temp.decide_as(
  label_value text, actor uuid, observation_label text, submission uuid, decision text,
  common text, scientific text, corrections jsonb, feedback text, topics text[]
)
returns void
language plpgsql
as $$
begin
  perform pg_temp.media_call(label_value, actor, format(
    $sql$select * from public.review_observation(%L, %L, %L, %L, %L, %L, %L, %L)$sql$,
    pg_temp.observation_of(observation_label), submission, decision, common, scientific, corrections, feedback, topics
  ));
end;
$$;

create function pg_temp.revise_as(
  label_value text, actor uuid, observation_label text, expected integer,
  common text, scientific text, evidence text, traits jsonb
)
returns void
language plpgsql
as $$
begin
  perform pg_temp.media_call(label_value, actor, format(
    $sql$select * from public.save_observation_revision(%L, %L, %L, %L, %L, null, %L)$sql$,
    pg_temp.observation_of(observation_label), expected, common, scientific, evidence, traits
  ));
end;
$$;

create function pg_temp.notifications_for(recipient uuid, notification_type text, observation_label text)
returns bigint
language sql
as $$
  select count(*) from public.notifications
  where recipient_id = recipient and type = notification_type
    and observation_id = pg_temp.observation_of(observation_label);
$$;

-- Fixtures: a1 submits a hibiscus (a1), a2 submits a mango (b); both in Leaf.
select pg_temp.prepare('a1', '00000000-0000-0000-0000-000000012003', 1, 13.7551, 100.5051, 'whole_plant');
select pg_temp.review_as('a1_review', '00000000-0000-0000-0000-000000012003', pg_temp.observation_of('a1'),
  pg_temp.version_of('a1'), 'manual', 'ชบา', 'Hibiscus rosa-sinensis', 'ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง', '[]');
select pg_temp.submit_as('a1_submit', '00000000-0000-0000-0000-000000012003', pg_temp.observation_of('a1'),
  'c0000000-0000-0000-0000-000000012001', pg_temp.version_of('a1'), false);

select pg_temp.prepare('b', '00000000-0000-0000-0000-000000012004', 2, 13.7559, 100.5059, 'whole_plant');
select pg_temp.review_as('b_review', '00000000-0000-0000-0000-000000012004', pg_temp.observation_of('b'),
  pg_temp.version_of('b'), 'manual', 'มะม่วง', 'Mangifera indica', 'ใบเดี่ยว เรียงสลับ ขยี้แล้วมีกลิ่นหอม', '[]');
select pg_temp.submit_as('b_submit', '00000000-0000-0000-0000-000000012004', pg_temp.observation_of('b'),
  'c0000000-0000-0000-0000-000000012002', pg_temp.version_of('b'), false);

-- Posture ------------------------------------------------------------------------------

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.teacher_reviews'::regclass, 'public.observation_revision_topics'::regclass,
    'public.observation_unlock_requests'::regclass, 'public.observation_issue_reports'::regclass)),
  'RLS is enabled on every P12 table'
);

select ok(
  not exists (
    select 1
    from unnest(array['public.teacher_reviews', 'public.observation_revision_topics',
      'public.observation_unlock_requests', 'public.observation_issue_reports']) as t(name),
      unnest(array['INSERT', 'UPDATE', 'DELETE']) as p(privilege)
    where has_table_privilege('authenticated', t.name, p.privilege)
       or has_table_privilege('anon', t.name, 'SELECT')
  ),
  'clients only read P12 tables; every write goes through the RPCs'
);

select ok(
  private.observation_status_transition_allowed('submitted', 'teacher_review')
    and private.observation_status_transition_allowed('teacher_review', 'revision_required')
    and private.observation_status_transition_allowed('revision_required', 'resubmitted')
    and private.observation_status_transition_allowed('resubmitted', 'verified')
    and not private.observation_status_transition_allowed('verified', 'revision_required')
    and not private.observation_status_transition_allowed('revision_required', 'submitted')
    and not private.observation_status_transition_allowed('draft', 'verified'),
  'review and revision edges follow PRD §11 and nothing reopens a decided record'
);

select ok(
  (select prosecdef and proconfig @> array['search_path=""']
     and not has_function_privilege('anon', oid, 'EXECUTE')
   from pg_proc where oid = 'public.review_observation(uuid, uuid, text, text, text, jsonb, text, text[])'::regprocedure)
    and not has_function_privilege('authenticated', 'private.notify_user(uuid, text, text, text, public.observations, uuid, jsonb, uuid, uuid)', 'EXECUTE'),
  'the decision RPC is SECURITY DEFINER with an empty search_path and private helpers are not callable'
);

-- Begin review ------------------------------------------------------------------------------

select is(
  array[
    pg_temp.raises_as('00000000-0000-0000-0000-000000012004',
      format($sql$select * from public.begin_observation_review(%L)$sql$, pg_temp.observation_of('a1'))),
    pg_temp.raises_as('00000000-0000-0000-0000-000000012002',
      format($sql$select * from public.begin_observation_review(%L)$sql$, pg_temp.observation_of('a1')))
  ],
  array['FORBIDDEN', 'FORBIDDEN'],
  'a classmate and another school''s teacher cannot begin a review'
);

select pg_temp.media_call('begin', '00000000-0000-0000-0000-000000012001',
  format($sql$select * from public.begin_observation_review(%L)$sql$, pg_temp.observation_of('a1')));
select pg_temp.media_call('begin_again', '00000000-0000-0000-0000-000000012001',
  format($sql$select * from public.begin_observation_review(%L)$sql$, pg_temp.observation_of('a1')));

select is(
  array[pg_temp.result('begin', '{outcome}'), pg_temp.result('begin', '{observation_status}'),
    pg_temp.result('begin_again', '{outcome}')],
  array['started', 'teacher_review', 'unchanged'],
  'the class teacher begins a review once; a repeat is unchanged'
);

-- Decision preconditions ----------------------------------------------------------------------

select pg_temp.decide_as('wrong_submission', '00000000-0000-0000-0000-000000012001', 'a1',
  pg_temp.submission_of('b', 1), 'verified', null, null, '{}', null, null);
select pg_temp.decide_as('no_topics', '00000000-0000-0000-0000-000000012001', 'a1',
  pg_temp.submission_of('a1', 1), 'revision_required', null, null, '{}', 'ตรวจชื่อวิทยาศาสตร์อีกครั้ง', null);
select pg_temp.decide_as('no_feedback', '00000000-0000-0000-0000-000000012001', 'a1',
  pg_temp.submission_of('a1', 1), 'revision_required', null, null, '{}', null, array['scientific_name']);
select pg_temp.decide_as('bad_topic', '00000000-0000-0000-0000-000000012001', 'a1',
  pg_temp.submission_of('a1', 1), 'revision_required', null, null, '{}', 'แก้พิกัด', array['location']);

select is(
  array[
    pg_temp.result('wrong_submission', '{error_code}'), pg_temp.result('wrong_submission', '{error_details,reason}'),
    pg_temp.result('no_topics', '{error_details,field}'), pg_temp.result('no_feedback', '{error_details,field}'),
    pg_temp.result('bad_topic', '{error_details,field}')
  ],
  array['OBSERVATION_VERSION_CONFLICT', 'submission_changed', 'topicKeys', 'feedback', 'topicKeys'],
  'a decision needs the latest submission, topics and feedback for a revision, and never the capture location'
);

-- Revision request ------------------------------------------------------------------------

select pg_temp.decide_as('revise', '00000000-0000-0000-0000-000000012001', 'a1',
  pg_temp.submission_of('a1', 1), 'revision_required', null, null, '{}',
  'ตรวจชื่อวิทยาศาสตร์และถ่ายภาพใบเพิ่ม', array['scientific_name', 'images']);
select pg_temp.decide_as('revise_retry', '00000000-0000-0000-0000-000000012001', 'a1',
  pg_temp.submission_of('a1', 1), 'revision_required', null, null, '{}',
  'ตรวจชื่อวิทยาศาสตร์และถ่ายภาพใบเพิ่ม', array['scientific_name', 'images']);
select pg_temp.decide_as('revise_other', '00000000-0000-0000-0000-000000012001', 'a1',
  pg_temp.submission_of('a1', 1), 'verified', null, null, '{}', null, null);

select is(
  array[
    pg_temp.result('revise', '{outcome}'), pg_temp.result('revise', '{observation_status}'),
    pg_temp.result('revise_retry', '{outcome}'), pg_temp.result('revise_other', '{error_details,reason}'),
    (select string_agg(field_key || ':' || source, ',' order by field_key) from public.observation_revision_topics
     where observation_id = pg_temp.observation_of('a1'))
  ],
  array['decided', 'revision_required', 'existing', 'decision_changed', 'images:review,scientific_name:review'],
  'a revision request records the topics once; a retry is existing and a second decision conflicts'
);

select ok(
  pg_temp.notifications_for('00000000-0000-0000-0000-000000012003', 'observation_revision_requested', 'a1') = 1
    and (select count(*) from public.notifications
      where observation_id = pg_temp.observation_of('a1') and type = 'observation_revision_requested') = 1
    and (select count(*) from public.research_events where observation_id = pg_temp.observation_of('a1')
      and event_name in ('teacher_review_completed', 'teacher_requested_revision')) = 2
    and (select payload ->> 'decision' from public.research_events where observation_id = pg_temp.observation_of('a1')
      and event_name = 'teacher_review_completed') = 'revision_required',
  'only the owning student is notified, and the decision is recorded as research events'
);

select pg_temp.media_call('revision_state', '00000000-0000-0000-0000-000000012003',
  format($sql$select public.get_observation_revision_state(%L) as state$sql$, pg_temp.observation_of('a1')));

select is(
  array[
    pg_temp.result('revision_state', '{state,openTopics}'),
    pg_temp.result('revision_state', '{state,latestReview,feedback}'),
    pg_temp.result('revision_state', '{state,permissions,canResubmit}'),
    coalesce(pg_temp.result('revision_state', '{state,reports}'), 'absent')
  ],
  array['["images", "scientific_name"]', 'ตรวจชื่อวิทยาศาสตร์และถ่ายภาพใบเพิ่ม', 'true', 'absent'],
  'the owner sees the open topics and feedback, and no issue reports'
);

-- Targeted revision ------------------------------------------------------------------------

select pg_temp.media_call('resubmit_nothing', '00000000-0000-0000-0000-000000012003', format(
  $sql$select * from public.resubmit_observation(%L, %L, %L, false)$sql$,
  pg_temp.observation_of('a1'), 'c0000000-0000-0000-0000-000000012003', pg_temp.version_of('a1')));
select pg_temp.revise_as('revise_locked', '00000000-0000-0000-0000-000000012003', 'a1', pg_temp.version_of('a1'),
  'ชบาแดง', 'Hibiscus rosa-sinensis', 'ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง', '[]');
select pg_temp.revise_as('revise_stale', '00000000-0000-0000-0000-000000012003', 'a1', pg_temp.version_of('a1') - 1,
  'ชบา', 'Hibiscus schizopetalus', 'ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง', '[]');
select pg_temp.revise_as('revise_open', '00000000-0000-0000-0000-000000012003', 'a1', pg_temp.version_of('a1'),
  'ชบา', 'Hibiscus schizopetalus', 'ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง', '[]');

select is(
  array[
    pg_temp.result('resubmit_nothing', '{error_details,reason}'),
    pg_temp.result('revise_locked', '{error_code}'), pg_temp.result('revise_locked', '{error_details,fields}'),
    pg_temp.result('revise_stale', '{error_code}'), pg_temp.result('revise_open', '{outcome}')
  ],
  array['no_changes', 'FIELD_NOT_UNLOCKED_FOR_REVISION', '["common_name"]', 'OBSERVATION_VERSION_CONFLICT', 'updated'],
  'a revision changes only open topics, needs the current version, and cannot resubmit unchanged'
);

select is(
  pg_temp.raises_as('00000000-0000-0000-0000-000000012004', format(
    $sql$select * from public.save_observation_revision(%L, 1, 'x', 'Ficus religiosa', 'ต้นใหญ่มีรากอากาศ ใบรูปหัวใจ', null, '[]')$sql$,
    pg_temp.observation_of('a1'))),
  'FORBIDDEN',
  'a classmate cannot revise another student''s observation'
);

select is(
  (select common_name || '|' || scientific_name from public.observation_submissions
   where id = pg_temp.submission_of('a1', 1)),
  'ชบา|Hibiscus rosa-sinensis',
  'the first submission keeps what was submitted'
);

-- Images: a revision adds, never removes, submitted images ---------------------------------------

select pg_temp.register_as('a1_leaf', '00000000-0000-0000-0000-000000012003', pg_temp.observation_of('a1'),
  '90000000-0000-0000-0000-000000012031', 'leaf', 'image/jpeg', 1000, 100, 100, pg_temp.hash('a1_leaf'), 'img-v1');
select pg_temp.register_as('b_extra', '00000000-0000-0000-0000-000000012004', pg_temp.observation_of('b'),
  '90000000-0000-0000-0000-000000012032', 'leaf', 'image/jpeg', 1000, 100, 100, pg_temp.hash('b_extra'), 'img-v1');

select is(
  array[
    pg_temp.result('a1_leaf', '{outcome}'),
    pg_temp.result('b_extra', '{error_code}'),
    pg_temp.raises_as('00000000-0000-0000-0000-000000012003', format(
      $sql$select * from public.delete_observation_media(%L, %L)$sql$,
      pg_temp.observation_of('a1'), pg_temp.media_id('a1_media')))
  ],
  array['created', 'INVALID_STATUS_TRANSITION', 'OBSERVATION_MEDIA_SUBMITTED'],
  'the images topic allows new images, a submitted record takes none, and submitted images cannot be deleted'
);

select pg_temp.store_as('00000000-0000-0000-0000-000000012003', pg_temp.media_path('a1_leaf'),
  '00000000-0000-0000-0000-000000012003', 1000, 'image/jpeg');
select pg_temp.media_call('a1_leaf_confirm', '00000000-0000-0000-0000-000000012003', format(
  $sql$select * from public.complete_observation_media_upload(%L, %L, 1)$sql$,
  pg_temp.observation_of('a1'), pg_temp.media_id('a1_leaf')));

-- Additional topics -------------------------------------------------------------------------

select pg_temp.media_call('unlock_open', '00000000-0000-0000-0000-000000012003', format(
  $sql$select * from public.request_additional_revision_fields(%L, array['scientific_name'], 'อยากแก้ชื่อเพิ่ม')$sql$,
  pg_temp.observation_of('a1')));
select pg_temp.media_call('unlock', '00000000-0000-0000-0000-000000012003', format(
  $sql$select * from public.request_additional_revision_fields(%L, array['common_name', 'evidence_note'], 'พบหลักฐานเพิ่มจากต้นจริง')$sql$,
  pg_temp.observation_of('a1')));
select pg_temp.media_call('unlock_again', '00000000-0000-0000-0000-000000012003', format(
  $sql$select * from public.request_additional_revision_fields(%L, array['common_name', 'evidence_note'], 'พบหลักฐานเพิ่มจากต้นจริง')$sql$,
  pg_temp.observation_of('a1')));
select pg_temp.media_call('unlock_second', '00000000-0000-0000-0000-000000012003', format(
  $sql$select * from public.request_additional_revision_fields(%L, array['traits'], 'อยากแก้ลักษณะด้วย')$sql$,
  pg_temp.observation_of('a1')));

select is(
  array[
    pg_temp.result('unlock_open', '{error_details,reason}'), pg_temp.result('unlock', '{outcome}'),
    pg_temp.result('unlock_again', '{outcome}'), pg_temp.result('unlock_second', '{error_details,reason}')
  ],
  array['already_open', 'requested', 'existing', 'pending_exists'],
  'one pending request asks only for topics not already open; a repeat is existing'
);

select ok(
  (select count(*) from public.notifications where type = 'revision_access_requested'
    and recipient_id = '00000000-0000-0000-0000-000000012001'
    and request_id = (pg_temp.result('unlock', '{request_id}'))::uuid) = 1
    and (select count(*) from public.notifications where type = 'revision_access_requested'
      and recipient_id = '00000000-0000-0000-0000-000000012003') = 0,
  'the class teacher is notified of the request with its ID'
);

select pg_temp.media_call('grant_extra', '00000000-0000-0000-0000-000000012001', format(
  $sql$select * from public.decide_revision_unlock_request(%L, 'granted', array['common_name', 'traits'], null)$sql$,
  pg_temp.result('unlock', '{request_id}')));
select pg_temp.media_call('grant', '00000000-0000-0000-0000-000000012001', format(
  $sql$select * from public.decide_revision_unlock_request(%L, 'granted', array['common_name'], 'แก้ชื่อไทยได้')$sql$,
  pg_temp.result('unlock', '{request_id}')));
select pg_temp.media_call('grant_again', '00000000-0000-0000-0000-000000012001', format(
  $sql$select * from public.decide_revision_unlock_request(%L, 'denied', null, null)$sql$,
  pg_temp.result('unlock', '{request_id}')));

select is(
  array[
    pg_temp.result('grant_extra', '{error_details,field}'), pg_temp.result('grant', '{outcome}'),
    pg_temp.result('grant_again', '{error_details,reason}'),
    (select string_agg(field_key || ':' || source, ',' order by field_key) from public.observation_revision_topics
     where observation_id = pg_temp.observation_of('a1')),
    (select status || ':' || array_to_string(granted_fields, ',') from public.observation_unlock_requests
     where id = (pg_temp.result('unlock', '{request_id}'))::uuid)
  ],
  array['fieldKeys', 'decided', 'already_decided',
    'common_name:unlock_request,images:review,scientific_name:review', 'granted:common_name'],
  'a grant opens only requested topics it names, once'
);

select ok(
  pg_temp.notifications_for('00000000-0000-0000-0000-000000012003', 'revision_access_granted', 'a1') = 1,
  'the owner is told the extra topic is open'
);

select pg_temp.revise_as('revise_granted', '00000000-0000-0000-0000-000000012003', 'a1', pg_temp.version_of('a1'),
  'ชบาด่าง', 'Hibiscus schizopetalus', 'ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง', '[]');

select is(pg_temp.result('revise_granted', '{outcome}'), 'updated', 'a granted topic can be revised');

-- Resubmission ---------------------------------------------------------------------------

select pg_temp.media_call('resubmit', '00000000-0000-0000-0000-000000012003', format(
  $sql$select * from public.resubmit_observation(%L, %L, %L, false)$sql$,
  pg_temp.observation_of('a1'), 'c0000000-0000-0000-0000-000000012004', pg_temp.version_of('a1')));
select pg_temp.media_call('resubmit_retry', '00000000-0000-0000-0000-000000012003', format(
  $sql$select * from public.resubmit_observation(%L, %L, %L, false)$sql$,
  pg_temp.observation_of('a1'), 'c0000000-0000-0000-0000-000000012004', 1));

select is(
  array[
    pg_temp.result('resubmit', '{outcome}'), pg_temp.result('resubmit', '{submission_number}'),
    pg_temp.result('resubmit_retry', '{outcome}'),
    (select status || ':' || submission_count from public.observations where id = pg_temp.observation_of('a1')),
    (select submission_kind || '|' || scientific_name || '|' || (verification_snapshot ->> 'changedTopics')
       || '|' || jsonb_array_length(media_snapshot)
     from public.observation_submissions where id = pg_temp.submission_of('a1', 2))
  ],
  array['resubmitted', '2', 'existing', 'resubmitted:2',
    'resubmission|Hibiscus schizopetalus|["images", "common_name", "scientific_name"]|2'],
  'resubmission adds version 2 of the same observation with what changed; a retry is existing'
);

select ok(
  (select count(*) from public.notifications where type = 'observation_resubmitted'
    and recipient_id = '00000000-0000-0000-0000-000000012001' and observation_id = pg_temp.observation_of('a1')) = 1
    and (select payload -> 'changed_topic_keys' from public.research_events
      where observation_id = pg_temp.observation_of('a1') and event_name = 'observation_resubmitted')
      = '["images", "common_name", "scientific_name"]'::jsonb,
  'the teacher is notified and the changed topics are recorded'
);

-- Verify with correction on the new version ------------------------------------------------------

select pg_temp.decide_as('stale_verify', '00000000-0000-0000-0000-000000012001', 'a1',
  pg_temp.submission_of('a1', 1), 'verified', null, null, '{}', null, null);
select pg_temp.decide_as('verify', '00000000-0000-0000-0000-000000012001', 'a1',
  pg_temp.submission_of('a1', 2), 'verified', 'พู่ระหง', 'Hibiscus schizopetalus', '{"leaf_margin": "หยักฟันเลื่อย"}',
  'ถูกต้อง ชื่อไทยคือพู่ระหง', null);

select is(
  array[
    pg_temp.result('stale_verify', '{error_details,reason}'), pg_temp.result('verify', '{outcome}'),
    (select status || '|' || verified_common_name || '|' || verified_scientific_name || '|' || review_count
     from public.observations where id = pg_temp.observation_of('a1')),
    (select string_agg(decision, ',' order by reviewed_at) from public.teacher_reviews
     where observation_id = pg_temp.observation_of('a1'))
  ],
  array['decision_changed', 'decided', 'verified|พู่ระหง|Hibiscus schizopetalus|2', 'revision_required,verified'],
  'the teacher verifies the resubmitted version with a correction; the earlier review stays'
);

select ok(
  (select student_common_name from public.observations where id = pg_temp.observation_of('a1')) = 'ชบาด่าง'
    and (select corrected_traits ->> 'leaf_margin' from public.teacher_reviews where id = (pg_temp.result('verify', '{review_id}'))::uuid) = 'หยักฟันเลื่อย'
    and (select (payload ->> 'corrected_identity')::boolean from public.research_events
      where observation_id = pg_temp.observation_of('a1') and event_name = 'teacher_verified')
    and pg_temp.notifications_for('00000000-0000-0000-0000-000000012003', 'observation_verified', 'a1') = 1,
  'teacher corrections sit beside the student''s values and the owner is notified'
);

select ok(
  pg_temp.raises_as('00000000-0000-0000-0000-000000012001', format(
    $sql$update public.teacher_reviews set feedback = 'x' where observation_id = %L$sql$, pg_temp.observation_of('a1')))
    like 'permission denied%',
  'clients cannot change a review row (no update grant)'
);

select throws_ok(
  format($sql$update public.teacher_reviews set feedback = 'x' where observation_id = %L$sql$, pg_temp.observation_of('a1')),
  'APPEND_ONLY',
  'even the owner role cannot change a review row'
);

select ok(
  (select array_agg(coalesce(from_status, '-') || '>' || to_status || ':' || reason)
   from public.observation_status_history where observation_id = pg_temp.observation_of('a1'))
    @> array['submitted>teacher_review:teacher_review_started', 'teacher_review>revision_required:teacher_decision',
      'revision_required>resubmitted:observation_resubmitted', 'resubmitted>verified:teacher_decision'],
'the status history records every review and revision step'
);

-- Visibility ---------------------------------------------------------------------------------

select is(
  array[
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000012003', format(
      $sql$select count(*) from public.teacher_reviews where observation_id = %L$sql$, pg_temp.observation_of('a1'))),
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000012004', format(
      $sql$select count(*) from public.teacher_reviews where observation_id = %L$sql$, pg_temp.observation_of('a1'))),
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000012001', format(
      $sql$select count(*) from public.teacher_reviews where observation_id = %L$sql$, pg_temp.observation_of('a1'))),
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000012002', format(
      $sql$select count(*) from public.teacher_reviews where observation_id = %L$sql$, pg_temp.observation_of('a1'))),
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000012004', format(
      $sql$select count(*) from public.observation_unlock_requests where observation_id = %L$sql$, pg_temp.observation_of('a1')))
  ],
  array[2, 0, 2, 0, 0]::bigint[],
  'reviews and requests are visible to the owner and the class teacher only'
);

-- Queue --------------------------------------------------------------------------------------

select pg_temp.media_call('queue', '00000000-0000-0000-0000-000000012001',
  $sql$select public.get_teacher_review_queue('20000000-0000-0000-0000-000000012001', null, 'pending', 50, null, null) as page$sql$);
select pg_temp.media_call('queue_verified', '00000000-0000-0000-0000-000000012001',
  $sql$select public.get_teacher_review_queue('20000000-0000-0000-0000-000000012001', null, 'verified', 1, null, null) as page$sql$);

select is(
  array[
    pg_temp.result('queue', '{page,items,0,observationId}'), pg_temp.result('queue', '{page,items,0,commonName}'),
    pg_temp.result('queue', '{page,counts,pending}'), pg_temp.result('queue_verified', '{page,items,0,observationId}'),
    coalesce(pg_temp.result('queue_verified', '{page,nextCursor}'), 'null'),
    pg_temp.raises_as('00000000-0000-0000-0000-000000012003',
      $sql$select public.get_teacher_review_queue('20000000-0000-0000-0000-000000012001', null, 'pending', 50, null, null)$sql$)
  ],
  array[pg_temp.observation_of('b')::text, 'มะม่วง', '1', pg_temp.observation_of('a1')::text, 'null', 'FORBIDDEN'],
  'the teacher queue lists pending work by status filter and is refused to students'
);

-- Rejection and unable to verify ---------------------------------------------------------------

select pg_temp.decide_as('reject_silent', '00000000-0000-0000-0000-000000012001', 'b',
  pg_temp.submission_of('b', 1), 'rejected', null, null, '{}', null, null);
select pg_temp.decide_as('reject', '00000000-0000-0000-0000-000000012001', 'b',
  pg_temp.submission_of('b', 1), 'rejected', null, null, '{}', 'ภาพไม่ใช่ต้นที่บันทึก', null);

select is(
  array[
    pg_temp.result('reject_silent', '{error_details,reason}'), pg_temp.result('reject', '{observation_status}'),
    pg_temp.notifications_for('00000000-0000-0000-0000-000000012004', 'observation_rejected', 'b')::text
  ],
  array['required', 'rejected', '1'],
  'a rejection needs a reason and notifies the owner'
);

-- Issue reports ----------------------------------------------------------------------------

select pg_temp.media_call('report_short', '00000000-0000-0000-0000-000000012004', format(
  $sql$select * from public.report_observation_issue(%L, 'identity', 'สั้นไป')$sql$, pg_temp.observation_of('a1')));
select pg_temp.media_call('report', '00000000-0000-0000-0000-000000012004', format(
  $sql$select * from public.report_observation_issue(%L, 'identity', 'ชื่อพืชอาจไม่ตรงกับรูป')$sql$, pg_temp.observation_of('a1')));
select pg_temp.media_call('report_again', '00000000-0000-0000-0000-000000012004', format(
  $sql$select * from public.report_observation_issue(%L, 'image', 'ภาพไม่ตรงกับพืชที่บันทึก')$sql$, pg_temp.observation_of('a1')));

select is(
  array[
    pg_temp.result('report_short', '{error_details,reason}'), pg_temp.result('report', '{outcome}'),
    pg_temp.result('report_again', '{error_code}'),
    ((pg_temp.result('report_again', '{error_details,retryAfterSeconds}'))::integer between 86000 and 86400)::text,
    pg_temp.raises_as('00000000-0000-0000-0000-000000012003', format(
      $sql$select * from public.report_observation_issue(%L, 'other', 'รายงานรายการของตัวเอง')$sql$, pg_temp.observation_of('a1')))
  ],
  array['too_short', 'reported', 'RATE_LIMITED', 'true', 'FORBIDDEN'],
  'a classmate reports once per record per 24 hours; the owner cannot report their own record'
);

select is(
  array[
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000012003', format(
      $sql$select count(*) from public.observation_issue_reports where observation_id = %L$sql$, pg_temp.observation_of('a1'))),
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000012004', format(
      $sql$select count(*) from public.observation_issue_reports where observation_id = %L$sql$, pg_temp.observation_of('a1'))),
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000012001', format(
      $sql$select count(*) from public.observation_issue_reports where observation_id = %L$sql$, pg_temp.observation_of('a1'))),
    (select count(*) from public.notifications where type = 'observation_issue_reported'
      and recipient_id = '00000000-0000-0000-0000-000000012003'),
    (select count(*) from public.notifications where type = 'observation_issue_reported'
      and recipient_id = '00000000-0000-0000-0000-000000012001'
      and report_id = (pg_temp.result('report', '{report_id}'))::uuid)
  ],
  array[0, 1, 1, 0, 1]::bigint[],
  'the owner never sees or hears of the report; the reporter and the teacher do'
);

-- The window rolls: a day later the classmate may report again.
alter table public.observation_issue_reports disable trigger observation_issue_reports_guard;
update public.observation_issue_reports set created_at = now() - interval '25 hours'
where id = (pg_temp.result('report', '{report_id}'))::uuid;
alter table public.observation_issue_reports enable trigger observation_issue_reports_guard;

select pg_temp.media_call('report_later', '00000000-0000-0000-0000-000000012004', format(
  $sql$select * from public.report_observation_issue(%L, 'image', 'ภาพไม่ตรงกับพืชที่บันทึก')$sql$, pg_temp.observation_of('a1')));
select pg_temp.media_call('resolve', '00000000-0000-0000-0000-000000012001', format(
  $sql$select * from public.resolve_observation_issue_report(%L, 'resolved', 'ตรวจแล้ว ชื่อถูกต้อง')$sql$,
  pg_temp.result('report', '{report_id}')));
select pg_temp.media_call('reopen', '00000000-0000-0000-0000-000000012001', format(
  $sql$select * from public.resolve_observation_issue_report(%L, 'reviewing', null)$sql$,
  pg_temp.result('report', '{report_id}')));

select is(
  array[
    pg_temp.result('report_later', '{outcome}'), pg_temp.result('resolve', '{outcome}'),
    pg_temp.result('reopen', '{error_details,reason}'),
    pg_temp.raises_as('00000000-0000-0000-0000-000000012004', format(
      $sql$select * from public.resolve_observation_issue_report(%L, 'dismissed', null)$sql$,
      pg_temp.result('report_later', '{report_id}')))
  ],
  array['reported', 'updated', 'already_decided', 'FORBIDDEN'],
  'after 24 hours a new report is allowed; only the class teacher resolves reports, once'
);

-- Teacher read model --------------------------------------------------------------------------

select pg_temp.media_call('teacher_view', '00000000-0000-0000-0000-000000012001',
  format($sql$select public.get_teacher_observation_review(%L) as view$sql$, pg_temp.observation_of('a1')));

select is(
  array[
    pg_temp.result('teacher_view', '{view,verifiedIdentity,commonName}'),
    jsonb_array_length((pg_temp.result('teacher_view', '{view,reviews}'))::jsonb)::text,
    pg_temp.result('teacher_view', '{view,reviews,1,topics,0,fieldKey}'),
    pg_temp.result('teacher_view', '{view,unlockRequests,0,status}'),
    (pg_temp.result('teacher_view', '{view,reports,0,reporterName}') is not null)::text,
    pg_temp.result('teacher_view', '{view,permissions,canDecide}')
  ]::text[],
  array['พู่ระหง', '2', 'images', 'granted', 'true', 'false'],
  'the teacher view carries reviews, topics, requests, and reports; a decided record takes no new decision'
);

select * from finish();
rollback;
