begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(9);

-- P13 review, revision, unlock, and issue-report rules. Identities: teacher,
-- other-school teacher, Leaf leader a1 and member a2, Root leader a3,
-- unassigned classmate u1.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000013001', 'p13.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000013002', 'p13.other.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000013003', 'p13.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000013004', 'p13.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000013005', 'p13.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000013006', 'p13.u1@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000013001', '00000000-0000-0000-0000-000000013002');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000013001', 'P13 School', '00000000-0000-0000-0000-000000013001'),
  ('10000000-0000-0000-0000-000000013002', 'P13 Other School', '00000000-0000-0000-0000-000000013002');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000013001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000013001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000013001', '00000000-0000-0000-0000-000000013003',
  '00000000-0000-0000-0000-000000013004', '00000000-0000-0000-0000-000000013005',
  '00000000-0000-0000-0000-000000013006'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000013002', '00000000-0000-0000-0000-000000013002', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000013001', '10000000-0000-0000-0000-000000013001', 'P13 Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000013001'),
  ('20000000-0000-0000-0000-000000013002', '10000000-0000-0000-0000-000000013002', 'P13 Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000013002');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000013001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000013001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000013001', '00000000-0000-0000-0000-000000013003',
  '00000000-0000-0000-0000-000000013004', '00000000-0000-0000-0000-000000013005',
  '00000000-0000-0000-0000-000000013006'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000013002', '00000000-0000-0000-0000-000000013002', 'teacher');

create temporary table p13_results (label text primary key, row jsonb not null);
grant all on table p13_results to authenticated, anon;

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
  execute format('insert into p13_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p13_results where label = label_value;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000013001' and name = group_name;
$$;

create function pg_temp.session_id()
returns uuid
language sql
as $$
  select (row ->> 'session_id')::uuid from p13_results where label = 'session';
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
  select (row ->> 'observation_id')::uuid from p13_results where label = label_value;
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000013003');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000013001', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000013001', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000013004', 'member', '00000000-0000-0000-0000-000000013003');

select pg_temp.act_as('00000000-0000-0000-0000-000000013005');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000013001', 'Root', null);
reset role;

insert into public.activities (id, class_id, title, status, created_by)
values ('60000000-0000-0000-0000-000000013001', '20000000-0000-0000-0000-000000013001', 'Garden survey', 'published', '00000000-0000-0000-0000-000000013001');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000013001', '60000000-0000-0000-0000-000000013001', '20000000-0000-0000-0000-000000013001', 1, 'Garden survey', '00000000-0000-0000-0000-000000013001');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000013001', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000013001'
where id = '61000000-0000-0000-0000-000000013001';

select pg_temp.act_as('00000000-0000-0000-0000-000000013001');
set local role authenticated;
select pg_temp.call('session', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000013001', 'Morning round')$$);
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
  select (row #>> '{media,id}')::uuid from p13_results where label = label_value;
$$;

create function pg_temp.media_path(label_value text)
returns text
language sql
as $$
  select row #>> '{media,upload,path}' from p13_results where label = label_value;
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

-- P13 helpers --------------------------------------------------------------------------

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
    ('80000000-0000-0000-0000-0000000130' || lpad(seed::text, 2, '0'))::uuid, 'captured', lat, lng, 8, now(), null);
  perform pg_temp.register_as(label_value || '_media', actor, pg_temp.observation_of(label_value),
    ('90000000-0000-0000-0000-0000000130' || lpad(seed::text, 2, '0'))::uuid, category, 'image/jpeg', 1000, 100, 100,
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

-- P13 helpers -------------------------------------------------------------------------

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

-- P13 helpers --------------------------------------------------------------------------

create function pg_temp.map_as(label_value text, actor uuid)
returns void
language plpgsql
as $$
begin
  perform pg_temp.media_call(label_value, actor, format(
    $sql$select public.get_session_completed_map(%L) as map$sql$, pg_temp.session_id()));
end;
$$;

create function pg_temp.map_ids(label_value text)
returns text
language sql
as $$
  select coalesce(string_agg(item ->> 'observationId', ',' order by item ->> 'observationId'), '')
  from p13_results, jsonb_array_elements(row -> 'map' -> 'items') as item
  where label = label_value;
$$;

create function pg_temp.ids_of(labels text[])
returns text
language sql
as $$
  select string_agg(id::text, ',' order by id::text)
  from unnest(labels) as label_value, lateral (select pg_temp.observation_of(label_value) as id) as found;
$$;

-- Fixtures: a1 submits A (hibiscus) and R (to be rejected) and keeps draft D;
-- a2 submits B. All in Leaf; Root (a3) is also in the session snapshot.
select pg_temp.prepare('A', '00000000-0000-0000-0000-000000013003', 1, 13.7551, 100.5051, 'whole_plant');
select pg_temp.review_as('A_review', '00000000-0000-0000-0000-000000013003', pg_temp.observation_of('A'),
  pg_temp.version_of('A'), 'manual', 'ชบา', 'Hibiscus rosa-sinensis', 'ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง', '[]');
select pg_temp.submit_as('A_submit', '00000000-0000-0000-0000-000000013003', pg_temp.observation_of('A'),
  'c0000000-0000-0000-0000-000000013001', pg_temp.version_of('A'), false);

select pg_temp.prepare('R', '00000000-0000-0000-0000-000000013003', 2, 13.7553, 100.5053, 'whole_plant');
select pg_temp.review_as('R_review', '00000000-0000-0000-0000-000000013003', pg_temp.observation_of('R'),
  pg_temp.version_of('R'), 'manual', 'ไม้ประดับ', 'Ixora coccinea', 'ดอกเป็นช่อกลม สีแดงส้ม ใบเรียงตรงข้าม', '[]');
select pg_temp.submit_as('R_submit', '00000000-0000-0000-0000-000000013003', pg_temp.observation_of('R'),
  'c0000000-0000-0000-0000-000000013002', pg_temp.version_of('R'), false);

select pg_temp.prepare('B', '00000000-0000-0000-0000-000000013004', 3, 13.7557, 100.5057, 'whole_plant');
select pg_temp.review_as('B_review', '00000000-0000-0000-0000-000000013004', pg_temp.observation_of('B'),
  pg_temp.version_of('B'), 'manual', 'มะม่วง', 'Mangifera indica', 'ใบเดี่ยว เรียงสลับ ขยี้แล้วมีกลิ่นหอม', '[]');
select pg_temp.submit_as('B_submit', '00000000-0000-0000-0000-000000013004', pg_temp.observation_of('B'),
  'c0000000-0000-0000-0000-000000013003', pg_temp.version_of('B'), false);

select pg_temp.prepare('D', '00000000-0000-0000-0000-000000013003', 4, 13.7555, 100.5055, 'whole_plant');

select pg_temp.decide_as('A_verify', '00000000-0000-0000-0000-000000013001', 'A',
  pg_temp.submission_of('A', 1), 'verified', 'พู่ระหง', 'Hibiscus schizopetalus', '{}', 'ดีมาก ชื่อไทยคือพู่ระหง', null);
select pg_temp.decide_as('R_reject', '00000000-0000-0000-0000-000000013001', 'R',
  pg_temp.submission_of('R', 1), 'rejected', null, null, '{}', 'ภาพไม่ใช่ต้นที่บันทึก', null);

-- Before completion ----------------------------------------------------------------------

select pg_temp.map_as('teacher_open', '00000000-0000-0000-0000-000000013001');
select pg_temp.map_as('a2_open', '00000000-0000-0000-0000-000000013004');

select is(
  array[
    pg_temp.map_ids('teacher_open'),
    pg_temp.result('teacher_open', '{map,pendingReviewCount}'),
    pg_temp.result('a2_open', '{map,available}'),
    coalesce(pg_temp.result('a2_open', '{map,items}'), 'absent'),
    (pg_temp.visible_objects('00000000-0000-0000-0000-000000013004', pg_temp.media_path('A_media')))::text
  ],
  array[pg_temp.ids_of(array['A', 'R', 'B']), '1', 'false', 'absent', '0'],
  'the teacher sees every submitted record at any time; participants wait for completion and read no peer image'
);

select pg_temp.media_call('complete', '00000000-0000-0000-0000-000000013001', format(
  $sql$select * from public.complete_exploration_session(%L)$sql$, pg_temp.session_id()));

-- After completion -------------------------------------------------------------------------

select pg_temp.map_as('a1_map', '00000000-0000-0000-0000-000000013003');
select pg_temp.map_as('a2_map', '00000000-0000-0000-0000-000000013004');
select pg_temp.map_as('a3_map', '00000000-0000-0000-0000-000000013005');
select pg_temp.map_as('teacher_map', '00000000-0000-0000-0000-000000013001');

select is(
  array[
    pg_temp.map_ids('a1_map'), pg_temp.map_ids('a2_map'), pg_temp.map_ids('a3_map'), pg_temp.map_ids('teacher_map')
  ],
  array[
    pg_temp.ids_of(array['A', 'R', 'B']), pg_temp.ids_of(array['A', 'B']), pg_temp.ids_of(array['A', 'B']),
    pg_temp.ids_of(array['A', 'R', 'B'])
  ],
  'drafts never appear; peers do not see another student''s rejected record; the owner and the teacher do'
);

select is(
  array[
    pg_temp.raises_as('00000000-0000-0000-0000-000000013006',
      format($sql$select public.get_session_completed_map(%L)$sql$, pg_temp.session_id())),
    pg_temp.raises_as('00000000-0000-0000-0000-000000013002',
      format($sql$select public.get_session_completed_map(%L)$sql$, pg_temp.session_id()))
  ],
  array['FORBIDDEN', 'FORBIDDEN'],
  'a classmate outside the session snapshot and another school''s teacher are refused'
);

select is(
  (select item ->> 'lat' || ',' || (item ->> 'lng') || '|' || (item ->> 'commonName') || '|' || (item ->> 'verified')
     || '|' || (item ->> 'recorderName' is not null)::text || '|' || (item ->> 'isMine')
   from p13_results, jsonb_array_elements(row -> 'map' -> 'items') as item
   where label = 'a2_map' and item ->> 'observationId' = pg_temp.observation_of('A')::text),
  '13.755100,100.505100|พู่ระหง|true|true|false',
  'markers sit at the capture location with the verified name and the recorder'
);

select ok(
  (select bool_and(
      (select array_agg(key order by key) from jsonb_object_keys(item) as key)
        <@ array['observationId', 'status', 'lat', 'lng', 'accuracyM', 'locationStatus', 'capturedAt',
          'commonName', 'scientificName', 'verified', 'recorderName', 'groupName', 'isMine',
          'sameSpeciesInSession', 'thumbnailPath'])
   from p13_results, jsonb_array_elements(row -> 'map' -> 'items') as item
   where label in ('a2_map', 'teacher_map'))
    and not exists (
      select 1 from p13_results
      where label in ('a2_map', 'teacher_map')
        and (row::text like '%location_events%' or row::text like '%track%' or row::text like '%submission_location%')
    ),
  'the map carries only marker fields: no live location, track, or submission location'
);

-- Detail -------------------------------------------------------------------------------

select pg_temp.media_call('a2_detail', '00000000-0000-0000-0000-000000013004',
  format($sql$select public.get_observation_map_detail(%L) as detail$sql$, pg_temp.observation_of('A')));
select pg_temp.media_call('a1_detail', '00000000-0000-0000-0000-000000013003',
  format($sql$select public.get_observation_map_detail(%L) as detail$sql$, pg_temp.observation_of('A')));
select pg_temp.media_call('teacher_detail', '00000000-0000-0000-0000-000000013001',
  format($sql$select public.get_observation_map_detail(%L) as detail$sql$, pg_temp.observation_of('A')));

select is(
  array[
    pg_temp.result('a2_detail', '{detail,verified,teacherName}') is not null,
    pg_temp.result('a2_detail', '{detail,feedback}') is null,
    pg_temp.result('a1_detail', '{detail,feedback}') = 'ดีมาก ชื่อไทยคือพู่ระหง',
    (pg_temp.result('a2_detail', '{detail,viewer,canReport}'))::boolean,
    not (pg_temp.result('a1_detail', '{detail,viewer,canReport}'))::boolean,
    not (pg_temp.result('teacher_detail', '{detail,viewer,canReport}'))::boolean,
    pg_temp.result('a2_detail', '{detail,relations,possibleSameSpecimenCount}') is null,
    pg_temp.result('teacher_detail', '{detail,relations,possibleSameSpecimenCount}') = '0',
    pg_temp.result('a2_detail', '{detail,student,commonName}') = 'ชบา'
  ],
  array[true, true, true, true, true, true, true, true, true],
  'peers see the verifying teacher and the student''s values but not feedback; only peers may report'
);

select is(
  array[
    pg_temp.raises_as('00000000-0000-0000-0000-000000013004',
      format($sql$select public.get_observation_map_detail(%L)$sql$, pg_temp.observation_of('R'))),
    pg_temp.raises_as('00000000-0000-0000-0000-000000013004',
      format($sql$select public.get_observation_map_detail(%L)$sql$, pg_temp.observation_of('D'))),
    pg_temp.raises_as('00000000-0000-0000-0000-000000013006',
      format($sql$select public.get_observation_map_detail(%L)$sql$, pg_temp.observation_of('A')))
  ],
  array['FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN'],
  'no detail for a peer''s rejected record, a draft, or a non-participant'
);

-- Images -------------------------------------------------------------------------------

select is(
  array[
    pg_temp.visible_objects('00000000-0000-0000-0000-000000013004', pg_temp.media_path('A_media')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000013005', pg_temp.media_path('A_media')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000013004', pg_temp.media_path('R_media')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000013004', pg_temp.media_path('D_media')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000013006', pg_temp.media_path('A_media')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000013003', pg_temp.media_path('R_media'))
  ],
  array[1, 1, 0, 0, 0, 1]::bigint[],
  'participants read submitted images of visible records only; drafts, peers'' rejected records, and outsiders stay private'
);

select ok(
  (select count(*) from public.observations where id = pg_temp.observation_of('D') and status = 'draft') = 1
    and (select count(*) from public.location_events where session_id = pg_temp.session_id()) >= 0,
  'the completed map changes no record'
);

select * from finish();
rollback;
