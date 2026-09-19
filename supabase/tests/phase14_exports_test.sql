begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(11);

-- P14 review, revision, unlock, and issue-report rules. Identities: teacher,
-- other-school teacher, Leaf leader a1 and member a2, Root leader a3,
-- unassigned classmate u1.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000014001', 'p14.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000014002', 'p14.other.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000014003', 'p14.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000014004', 'p14.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000014005', 'p14.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000014006', 'p14.u1@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000014001', '00000000-0000-0000-0000-000000014002');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000014001', 'P14 School', '00000000-0000-0000-0000-000000014001'),
  ('10000000-0000-0000-0000-000000014002', 'P14 Other School', '00000000-0000-0000-0000-000000014002');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000014001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000014001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000014001', '00000000-0000-0000-0000-000000014003',
  '00000000-0000-0000-0000-000000014004', '00000000-0000-0000-0000-000000014005',
  '00000000-0000-0000-0000-000000014006'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000014002', '00000000-0000-0000-0000-000000014002', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000014001', '10000000-0000-0000-0000-000000014001', 'P14 Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000014001'),
  ('20000000-0000-0000-0000-000000014002', '10000000-0000-0000-0000-000000014002', 'P14 Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000014002');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000014001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000014001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000014001', '00000000-0000-0000-0000-000000014003',
  '00000000-0000-0000-0000-000000014004', '00000000-0000-0000-0000-000000014005',
  '00000000-0000-0000-0000-000000014006'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000014002', '00000000-0000-0000-0000-000000014002', 'teacher');

create temporary table p14_results (label text primary key, row jsonb not null);
grant all on table p14_results to authenticated, anon;

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
  execute format('insert into p14_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p14_results where label = label_value;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000014001' and name = group_name;
$$;

create function pg_temp.session_id()
returns uuid
language sql
as $$
  select (row ->> 'session_id')::uuid from p14_results where label = 'session';
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
  select (row ->> 'observation_id')::uuid from p14_results where label = label_value;
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000014003');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000014001', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000014001', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000014004', 'member', '00000000-0000-0000-0000-000000014003');

select pg_temp.act_as('00000000-0000-0000-0000-000000014005');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000014001', 'Root', null);
reset role;

insert into public.activities (id, class_id, title, status, created_by)
values ('60000000-0000-0000-0000-000000014001', '20000000-0000-0000-0000-000000014001', 'Garden survey', 'published', '00000000-0000-0000-0000-000000014001');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000014001', '60000000-0000-0000-0000-000000014001', '20000000-0000-0000-0000-000000014001', 1, 'Garden survey', '00000000-0000-0000-0000-000000014001');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000014001', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000014001'
where id = '61000000-0000-0000-0000-000000014001';

select pg_temp.act_as('00000000-0000-0000-0000-000000014001');
set local role authenticated;
select pg_temp.call('session', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000014001', 'Morning round')$$);
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
  select (row #>> '{media,id}')::uuid from p14_results where label = label_value;
$$;

create function pg_temp.media_path(label_value text)
returns text
language sql
as $$
  select row #>> '{media,upload,path}' from p14_results where label = label_value;
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

-- P14 helpers --------------------------------------------------------------------------

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
    ('80000000-0000-0000-0000-0000000140' || lpad(seed::text, 2, '0'))::uuid, 'captured', lat, lng, 8, now(), null);
  perform pg_temp.register_as(label_value || '_media', actor, pg_temp.observation_of(label_value),
    ('90000000-0000-0000-0000-0000000140' || lpad(seed::text, 2, '0'))::uuid, category, 'image/jpeg', 1000, 100, 100,
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

-- P14 helpers -------------------------------------------------------------------------

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

-- P14 helpers --------------------------------------------------------------------------

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
  from p14_results, jsonb_array_elements(row -> 'map' -> 'items') as item
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
select pg_temp.prepare('A', '00000000-0000-0000-0000-000000014003', 1, 13.7551, 100.5051, 'whole_plant');
select pg_temp.review_as('A_review', '00000000-0000-0000-0000-000000014003', pg_temp.observation_of('A'),
  pg_temp.version_of('A'), 'manual', 'ชบา', 'Hibiscus rosa-sinensis', 'ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง', '[]');
select pg_temp.submit_as('A_submit', '00000000-0000-0000-0000-000000014003', pg_temp.observation_of('A'),
  'c0000000-0000-0000-0000-000000014001', pg_temp.version_of('A'), false);

select pg_temp.prepare('R', '00000000-0000-0000-0000-000000014003', 2, 13.7553, 100.5053, 'whole_plant');
select pg_temp.review_as('R_review', '00000000-0000-0000-0000-000000014003', pg_temp.observation_of('R'),
  pg_temp.version_of('R'), 'manual', 'ไม้ประดับ', 'Ixora coccinea', 'ดอกเป็นช่อกลม สีแดงส้ม ใบเรียงตรงข้าม', '[]');
select pg_temp.submit_as('R_submit', '00000000-0000-0000-0000-000000014003', pg_temp.observation_of('R'),
  'c0000000-0000-0000-0000-000000014002', pg_temp.version_of('R'), false);

select pg_temp.prepare('B', '00000000-0000-0000-0000-000000014004', 3, 13.7557, 100.5057, 'whole_plant');
select pg_temp.review_as('B_review', '00000000-0000-0000-0000-000000014004', pg_temp.observation_of('B'),
  pg_temp.version_of('B'), 'manual', 'มะม่วง', 'Mangifera indica', 'ใบเดี่ยว เรียงสลับ ขยี้แล้วมีกลิ่นหอม', '[]');
select pg_temp.submit_as('B_submit', '00000000-0000-0000-0000-000000014004', pg_temp.observation_of('B'),
  'c0000000-0000-0000-0000-000000014003', pg_temp.version_of('B'), false);

select pg_temp.prepare('D', '00000000-0000-0000-0000-000000014003', 4, 13.7555, 100.5055, 'whole_plant');

select pg_temp.decide_as('A_verify', '00000000-0000-0000-0000-000000014001', 'A',
  pg_temp.submission_of('A', 1), 'verified', 'พู่ระหง', 'Hibiscus schizopetalus', '{}', 'ดีมาก ชื่อไทยคือพู่ระหง', null);
select pg_temp.decide_as('R_reject', '00000000-0000-0000-0000-000000014001', 'R',
  pg_temp.submission_of('R', 1), 'rejected', null, null, '{}', 'ภาพไม่ใช่ต้นที่บันทึก', null);

-- P14 export helpers ----------------------------------------------------------------------

create function pg_temp.export_as(label_value text, actor uuid, export_type text, filters jsonb, key uuid)
returns void
language plpgsql
as $$
begin
  perform pg_temp.media_call(label_value, actor, format(
    $sql$select * from public.request_export(%L, %L, %L, %L, %L)$sql$,
    '20000000-0000-0000-0000-000000014001', pg_temp.session_id(), export_type, filters, key));
end;
$$;

create function pg_temp.export_of(label_value text)
returns uuid
language sql
as $$
  select (row ->> 'export_id')::uuid from p14_results where label = label_value;
$$;

create function pg_temp.export_store_as(actor uuid, object_name text, mime text)
returns boolean
language plpgsql
as $$
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('activity-exports', object_name, actor::text, jsonb_build_object('size', 120, 'mimetype', mime));
  exception when insufficient_privilege then
    reset role;
    return false;
  end;
  reset role;
  return true;
end;
$$;

create function pg_temp.export_visible(actor uuid, object_name text)
returns bigint
language plpgsql
as $$
declare
  visible bigint;
begin
  perform pg_temp.act_as(actor);
  set local role authenticated;
  select count(*) into visible from storage.objects where bucket_id = 'activity-exports' and name = object_name;
  reset role;
  return visible;
end;
$$;

-- Posture ------------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.exports'::regclass)
    and not has_table_privilege('authenticated', 'public.exports', 'INSERT')
    and not has_table_privilege('authenticated', 'public.exports', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.exports', 'DELETE')
    and not has_table_privilege('anon', 'public.exports', 'SELECT')
    and (select not public from storage.buckets where id = 'activity-exports'),
  'exports are RLS-protected, written only by the RPCs, and stored in a private bucket'
);

-- Requests ------------------------------------------------------------------------------

select pg_temp.export_as('csv', '00000000-0000-0000-0000-000000014001', 'csv', '{}',
  'e0000000-0000-0000-0000-000000014001');
select pg_temp.export_as('csv_replay', '00000000-0000-0000-0000-000000014001', 'csv', '{}',
  'e0000000-0000-0000-0000-000000014001');
select pg_temp.export_as('csv_reuse', '00000000-0000-0000-0000-000000014001', 'geojson', '{}',
  'e0000000-0000-0000-0000-000000014001');
select pg_temp.export_as('research', '00000000-0000-0000-0000-000000014001', 'research_csv', '{}',
  'e0000000-0000-0000-0000-000000014002');
select pg_temp.export_as('bad_filter', '00000000-0000-0000-0000-000000014001', 'csv', '{"statuses":["draft"]}',
  'e0000000-0000-0000-0000-000000014003');
select pg_temp.export_as('no_key', '00000000-0000-0000-0000-000000014001', 'csv', '{}', null);

select is(
  array[
    pg_temp.result('csv', '{outcome}'), pg_temp.result('csv', '{row_estimate}'),
    pg_temp.result('csv_replay', '{outcome}'), pg_temp.result('csv_replay', '{export_id}') = pg_temp.result('csv', '{export_id}'),
    pg_temp.result('csv_reuse', '{error_code}'), pg_temp.result('research', '{error_code}'),
    pg_temp.result('bad_filter', '{error_details,field}'), pg_temp.result('no_key', '{error_code}')
  ]::text[],
  array['requested', '3', 'existing', 'true', 'IDEMPOTENCY_KEY_REUSE', 'VALIDATION_FAILED', 'filters',
    'IDEMPOTENCY_KEY_REQUIRED'],
  'a request is idempotent per key, refuses reuse, research exports, draft filters, and missing keys'
);

select is(
  array[
    pg_temp.raises_as('00000000-0000-0000-0000-000000014003', format(
      $sql$select * from public.request_export(%L, %L, 'csv', '{}', %L)$sql$,
      '20000000-0000-0000-0000-000000014001', pg_temp.session_id(), 'e0000000-0000-0000-0000-000000014004')),
    pg_temp.raises_as('00000000-0000-0000-0000-000000014002', format(
      $sql$select * from public.request_export(%L, %L, 'csv', '{}', %L)$sql$,
      '20000000-0000-0000-0000-000000014001', pg_temp.session_id(), 'e0000000-0000-0000-0000-000000014005')),
    pg_temp.raises_as('00000000-0000-0000-0000-000000014002', format(
      $sql$select public.get_export(%L)$sql$, pg_temp.export_of('csv')))
  ],
  array['FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN'],
  'students and other teachers cannot request or read an export'
);

-- Claim and rows --------------------------------------------------------------------------

select pg_temp.media_call('claim', '00000000-0000-0000-0000-000000014001',
  format($sql$select * from public.claim_export(%L)$sql$, pg_temp.export_of('csv')));
select pg_temp.media_call('claim_again', '00000000-0000-0000-0000-000000014001',
  format($sql$select * from public.claim_export(%L)$sql$, pg_temp.export_of('csv')));
select pg_temp.media_call('rows', '00000000-0000-0000-0000-000000014001',
  format($sql$select public.export_rows(%L) as export$sql$, pg_temp.export_of('csv')));

select is(
  array[
    pg_temp.result('claim', '{outcome}'), pg_temp.result('claim_again', '{outcome}'),
    pg_temp.result('claim', '{storage_path}') = '20000000-0000-0000-0000-000000014001/' || pg_temp.session_id()
      || '/' || pg_temp.export_of('csv') || '.csv',
    jsonb_array_length((pg_temp.result('rows', '{export}'))::jsonb -> 'rows')::text
  ]::text[],
  array['claimed', 'running', 'true', '3'],
  'one claim moves the export to running; a second claim does not claim it again; rows are the submitted records'
);

select ok(
  (select bool_and(
      (select array_agg(key order by key) from jsonb_object_keys(entry) as key)
        = array['accuracy_m', 'captured_at', 'evidence_note', 'group_name', 'identity_source', 'image_count',
          'latitude', 'location_source', 'location_status', 'longitude', 'observation_id', 'recorder_name',
          'review_decision', 'reviewed_at', 'same_species_in_session', 'schema_version', 'status',
          'student_common_name', 'student_scientific_name', 'submission_number', 'submitted_at',
          'verified_common_name', 'verified_scientific_name'])
   from jsonb_array_elements((pg_temp.result('rows', '{export}'))::jsonb -> 'rows') as entry)
    and not ((pg_temp.result('rows', '{export}'))::jsonb::text like '%@example.edu%')
    and not ((pg_temp.result('rows', '{export}'))::jsonb::text like '%' || pg_temp.observation_of('D') || '%'),
  'export-v1 rows carry the stable columns only: no draft, email, or live location'
);

-- Artifact ------------------------------------------------------------------------------

select is(
  array[
    pg_temp.export_store_as('00000000-0000-0000-0000-000000014001', pg_temp.result('claim', '{storage_path}'), 'text/csv'),
    pg_temp.export_store_as('00000000-0000-0000-0000-000000014001',
      '20000000-0000-0000-0000-000000014001/' || pg_temp.session_id() || '/other.csv', 'text/csv'),
    pg_temp.export_store_as('00000000-0000-0000-0000-000000014003', pg_temp.result('claim', '{storage_path}') || '.x', 'text/csv')
  ],
  array[true, false, false],
  'only the running export''s requester writes its artifact, at its own path'
);

select pg_temp.media_call('finish', '00000000-0000-0000-0000-000000014001',
  format($sql$select * from public.finish_export(%L, true, 3, 120, null)$sql$, pg_temp.export_of('csv')));
select pg_temp.media_call('finish_again', '00000000-0000-0000-0000-000000014001',
  format($sql$select * from public.finish_export(%L, true, 3, 120, null)$sql$, pg_temp.export_of('csv')));
select pg_temp.media_call('status', '00000000-0000-0000-0000-000000014001',
  format($sql$select public.get_export(%L) as export$sql$, pg_temp.export_of('csv')));

select is(
  array[
    pg_temp.result('finish', '{outcome}'), pg_temp.result('finish_again', '{outcome}'),
    pg_temp.result('status', '{export,status}'), pg_temp.result('status', '{export,rowCount}'),
    (select count(*)::text from public.notifications where type = 'export_ready'
      and export_id = pg_temp.export_of('csv') and recipient_id = '00000000-0000-0000-0000-000000014001'),
    (select count(*)::text from public.notifications where type = 'export_ready' and export_id = pg_temp.export_of('csv')),
    (select string_agg(event_name, ',' order by event_name) from public.research_events
      where event_name like 'export_%' and class_id = '20000000-0000-0000-0000-000000014001')
  ],
  array['ready', 'unchanged', 'ready', '3', '1', '1', 'export_completed,export_requested'],
  'finishing marks the export ready once, notifies only the requester, and records both events'
);

select is(
  array[
    pg_temp.export_visible('00000000-0000-0000-0000-000000014001', pg_temp.result('claim', '{storage_path}')),
    pg_temp.export_visible('00000000-0000-0000-0000-000000014003', pg_temp.result('claim', '{storage_path}')),
    pg_temp.export_visible('00000000-0000-0000-0000-000000014002', pg_temp.result('claim', '{storage_path}'))
  ],
  array[1, 0, 0]::bigint[],
  'only the requester reads the artifact'
);

-- Expiry --------------------------------------------------------------------------------

update public.exports set expires_at = now() - interval '1 minute' where id = pg_temp.export_of('csv');
select pg_temp.media_call('expired', '00000000-0000-0000-0000-000000014001',
  format($sql$select public.get_export(%L) as export$sql$, pg_temp.export_of('csv')));

select is(
  array[
    pg_temp.result('expired', '{export,status}'),
    coalesce(pg_temp.result('expired', '{export,storagePath}'), 'none'),
    pg_temp.export_visible('00000000-0000-0000-0000-000000014001', pg_temp.result('claim', '{storage_path}'))::text
  ],
  array['expired', 'none', '0'],
  'after seven days the export reads as expired and the artifact can no longer be read'
);

-- Failure and filters -----------------------------------------------------------------------

select pg_temp.export_as('verified_only', '00000000-0000-0000-0000-000000014001', 'geojson',
  '{"statuses":["verified"]}', 'e0000000-0000-0000-0000-000000014006');
select pg_temp.media_call('claim_verified', '00000000-0000-0000-0000-000000014001',
  format($sql$select * from public.claim_export(%L)$sql$, pg_temp.export_of('verified_only')));
select pg_temp.media_call('rows_verified', '00000000-0000-0000-0000-000000014001',
  format($sql$select public.export_rows(%L) as export$sql$, pg_temp.export_of('verified_only')));
select pg_temp.media_call('fail', '00000000-0000-0000-0000-000000014001',
  format($sql$select * from public.finish_export(%L, false, null, null, 'upload_failed')$sql$, pg_temp.export_of('verified_only')));

select is(
  array[
    pg_temp.result('verified_only', '{row_estimate}'),
    jsonb_array_length((pg_temp.result('rows_verified', '{export}'))::jsonb -> 'rows')::text,
    pg_temp.result('claim_verified', '{storage_path}') like '%.geojson',
    pg_temp.result('fail', '{export_status}'),
    (select failure_code from public.exports where id = pg_temp.export_of('verified_only')),
    (select count(*)::text from public.notifications where export_id = pg_temp.export_of('verified_only'))
  ]::text[],
  array['1', '1', 'true', 'failed', 'upload_failed', '0'],
  'a status filter narrows the rows, GeoJSON gets its own path, and a failure is recorded without a notification'
);

select throws_ok(
  format($sql$delete from public.exports where id = %L$sql$, pg_temp.export_of('csv')),
  'APPEND_ONLY',
  'exports are never deleted in place'
);

select * from finish();
rollback;
