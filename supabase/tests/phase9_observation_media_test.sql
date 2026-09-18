begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(29);

-- Identities: teacher, other-school teacher, Leaf leader a1 and member a2,
-- Root leader a3, unassigned classmate u1.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000009001', 'p9.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000009002', 'p9.other.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000009003', 'p9.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000009004', 'p9.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000009005', 'p9.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000009006', 'p9.u1@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000009002');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000009001', 'P9 School', '00000000-0000-0000-0000-000000009001'),
  ('10000000-0000-0000-0000-000000009002', 'P9 Other School', '00000000-0000-0000-0000-000000009002');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000009001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000009001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000009003',
  '00000000-0000-0000-0000-000000009004', '00000000-0000-0000-0000-000000009005',
  '00000000-0000-0000-0000-000000009006'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000009002', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000009001', '10000000-0000-0000-0000-000000009001', 'P9 Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000009001'),
  ('20000000-0000-0000-0000-000000009002', '10000000-0000-0000-0000-000000009002', 'P9 Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000009002');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000009001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000009001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000009003',
  '00000000-0000-0000-0000-000000009004', '00000000-0000-0000-0000-000000009005',
  '00000000-0000-0000-0000-000000009006'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000009002', 'teacher');

create temporary table p9_results (label text primary key, row jsonb not null);
grant all on table p9_results to authenticated, anon;

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
  execute format('insert into p9_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p9_results where label = label_value;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000009001' and name = group_name;
$$;

create function pg_temp.session_id()
returns uuid
language sql
as $$
  select (row ->> 'session_id')::uuid from p9_results where label = 'session';
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
  select (row ->> 'observation_id')::uuid from p9_results where label = label_value;
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000009003');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000009001', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000009001', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000009004', 'member', '00000000-0000-0000-0000-000000009003');

select pg_temp.act_as('00000000-0000-0000-0000-000000009005');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000009001', 'Root', null);
reset role;

insert into public.activities (id, class_id, title, status, created_by)
values ('60000000-0000-0000-0000-000000009001', '20000000-0000-0000-0000-000000009001', 'Garden survey', 'published', '00000000-0000-0000-0000-000000009001');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000009001', '60000000-0000-0000-0000-000000009001', '20000000-0000-0000-0000-000000009001', 1, 'Garden survey', '00000000-0000-0000-0000-000000009001');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000009001', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000009001'
where id = '61000000-0000-0000-0000-000000009001';

select pg_temp.act_as('00000000-0000-0000-0000-000000009001');
set local role authenticated;
select pg_temp.call('session', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000009001', 'Morning round')$$);
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
  select (row #>> '{media,id}')::uuid from p9_results where label = label_value;
$$;

create function pg_temp.media_path(label_value text)
returns text
language sql
as $$
  select row #>> '{media,upload,path}' from p9_results where label = label_value;
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

select pg_temp.start_as('a1_obs', '00000000-0000-0000-0000-000000009003',
  '80000000-0000-0000-0000-000000009001', 'captured', 13.755, 100.505, 8, now(), null);

create temporary table p9_baseline as
select
  (select version from public.observations where id = pg_temp.observation_of('a1_obs')) as version,
  (select count(*) from public.observation_status_history) as history;

-- Posture ----------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.observation_media'::regclass)
    and has_table_privilege('authenticated', 'public.observation_media', 'SELECT')
    and not has_table_privilege('authenticated', 'public.observation_media', 'INSERT')
    and not has_table_privilege('authenticated', 'public.observation_media', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.observation_media', 'DELETE')
    and not has_table_privilege('anon', 'public.observation_media', 'SELECT'),
  'observation media has RLS and read-only grants'
);

select is(
  (
    select public::text || ':' || file_size_limit::text || ':' || array_to_string(allowed_mime_types, ',')
    from storage.buckets where id = 'observation-images'
  ),
  'false:5242880:image/jpeg,image/png,image/webp',
  'the observation-images bucket is private with the 5 MB limit and three image types'
);

select is(
  (
    select string_agg(policyname || ':' || cmd || ':' || (qual is not null)::text || ':' || (with_check is not null)::text, ',' order by policyname)
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'observation\_images\_%'
  ),
  'observation_images_delete_owner_deleting:DELETE:true:false,observation_images_insert_owner_pending:INSERT:false:true,'
    || 'observation_images_select_owner:SELECT:true:false,observation_images_update_owner_pending:UPDATE:true:true',
  'four Storage policies cover select, insert, update with both checks, and delete'
);

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where (namespace.nspname, function_row.proname) in (
      ('public', 'register_observation_media'), ('public', 'complete_observation_media_upload'),
      ('public', 'delete_observation_media'), ('public', 'update_observation_media_category'),
      ('public', 'list_observation_media'), ('private', 'observation_media_object_readable'),
      ('private', 'observation_media_object_writable'), ('private', 'observation_media_object_deletable')
    )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  8::bigint,
  'media functions are security definer with empty search paths'
);

-- Register ----------------------------------------------------------------------------

select pg_temp.register_as('m1', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
  '90000000-0000-0000-0000-000000009001', 'whole_plant', 'image/webp', 400000, 2048, 1536, pg_temp.hash('one'), 'img-v1');

select ok(
  pg_temp.result('m1', '{outcome}') = 'created'
    and pg_temp.result('m1', '{media,position}') = '1'
    and pg_temp.result('m1', '{media,status}') = 'pending'
    and pg_temp.media_path('m1') = '20000000-0000-0000-0000-000000009001/'
      || (select session_id::text from public.observations where id = pg_temp.observation_of('a1_obs'))
      || '/' || pg_temp.observation_of('a1_obs')::text || '/' || pg_temp.media_id('m1')::text || '.webp',
  'registering reserves position 1 at the class/session/observation/media path'
);

select ok(
  (
    select count(*) = 1
      and bool_and(payload = jsonb_build_object('category', 'whole_plant', 'processed_bytes', 400000, 'width', 2048, 'height', 1536))
      and bool_and(observation_id = pg_temp.observation_of('a1_obs'))
    from public.research_events where event_name = 'photo_captured'
  ),
  'registering emits one photo_captured event with only category, bytes, and dimensions'
);

select pg_temp.register_as('m1_replay', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
  '90000000-0000-0000-0000-000000009001', 'leaf', 'image/webp', 400000, 2048, 1536, pg_temp.hash('one'), 'img-v1');
select pg_temp.register_as('m1_reuse', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
  '90000000-0000-0000-0000-000000009001', 'whole_plant', 'image/webp', 400000, 2048, 1536, pg_temp.hash('other'), 'img-v1');

select ok(
  pg_temp.result('m1_replay', '{outcome}') = 'existing'
    and pg_temp.media_id('m1_replay') = pg_temp.media_id('m1')
    and pg_temp.result('m1_reuse', '{error_code}') = 'IDEMPOTENCY_KEY_REUSE'
    and (select count(*) from public.observation_media) = 1
    and (select count(*) from public.research_events where event_name = 'photo_captured') = 1,
  'a replay returns the same reservation and a reused key with different bytes is refused'
);

select is(
  array[
    (select pg_temp.result('bad_type', '{error_code}') from (select pg_temp.register_as('bad_type', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'), '90000000-0000-0000-0000-000000009010', 'leaf', 'image/gif', 1000, 100, 100, pg_temp.hash('g'), 'img-v1')) as done),
    (select pg_temp.result('bad_bytes', '{error_code}') || ':' || pg_temp.result('bad_bytes', '{error_details,reason}') from (select pg_temp.register_as('bad_bytes', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'), '90000000-0000-0000-0000-000000009011', 'leaf', 'image/jpeg', 5242881, 100, 100, pg_temp.hash('b'), 'img-v1')) as done),
    (select pg_temp.result('bad_dims', '{error_code}') || ':' || pg_temp.result('bad_dims', '{error_details,reason}') from (select pg_temp.register_as('bad_dims', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'), '90000000-0000-0000-0000-000000009012', 'leaf', 'image/jpeg', 1000, 2049, 100, pg_temp.hash('d'), 'img-v1')) as done),
    (select pg_temp.result('bad_category', '{error_details,field}') from (select pg_temp.register_as('bad_category', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'), '90000000-0000-0000-0000-000000009013', 'root', 'image/jpeg', 1000, 100, 100, pg_temp.hash('c'), 'img-v1')) as done),
    (select pg_temp.result('bad_hash', '{error_details,field}') from (select pg_temp.register_as('bad_hash', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'), '90000000-0000-0000-0000-000000009014', 'leaf', 'image/jpeg', 1000, 100, 100, 'not-a-hash', 'img-v1')) as done),
    (select pg_temp.result('bad_version', '{error_details,field}') from (select pg_temp.register_as('bad_version', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'), '90000000-0000-0000-0000-000000009015', 'leaf', 'image/jpeg', 1000, 100, 100, pg_temp.hash('v'), 'v1')) as done)
  ],
  array['INVALID_IMAGE_TYPE', 'IMAGE_TOO_LARGE:bytes', 'IMAGE_TOO_LARGE:dimensions', 'category', 'sha256', 'preprocessingVersion'],
  'invalid type, size, dimensions, category, hash, and version are refused with stable codes'
);

select pg_temp.register_as('m2', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
  '90000000-0000-0000-0000-000000009002', 'leaf', 'image/jpeg', 300000, 1536, 2048, pg_temp.hash('two'), 'img-v1');
select pg_temp.register_as('m3', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
  '90000000-0000-0000-0000-000000009003', 'flower', 'image/jpeg', 300000, 1536, 2048, pg_temp.hash('three'), 'img-v1');

do $$
begin
  for extra in 4..10 loop
    perform pg_temp.register_as('fill_' || extra, '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
      ('90000000-0000-0000-0000-0000000091' || lpad(extra::text, 2, '0'))::uuid, 'other', 'image/jpeg', 1000, 100, 100,
      pg_temp.hash('fill' || extra), 'img-v1');
  end loop;
end;
$$;

select pg_temp.register_as('m11', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
  '90000000-0000-0000-0000-000000009020', 'leaf', 'image/jpeg', 1000, 100, 100, pg_temp.hash('eleven'), 'img-v1');

select is(
  pg_temp.result('m11', '{error_code}') || ':' || pg_temp.result('m11', '{error_details,maxImages}')
    || ':' || (select count(*) from public.observation_media where observation_id = pg_temp.observation_of('a1_obs'))::text,
  'IMAGE_LIMIT_EXCEEDED:10:10',
  'an eleventh image is refused and an observation never holds more than ten'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000009004');
set local role authenticated;
select throws_ok(
  format($$select * from public.register_observation_media(%L, gen_random_uuid(), 'leaf', 'image/jpeg', 1000, 100, 100, %L, 'img-v1', now())$$,
    pg_temp.observation_of('a1_obs'), pg_temp.hash('x')),
  '42501', 'FORBIDDEN', 'a groupmate cannot add images to another student''s draft'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000009001');
set local role authenticated;
select throws_ok(
  format($$select public.list_observation_media(%L)$$, pg_temp.observation_of('a1_obs')),
  '42501', 'FORBIDDEN', 'the teacher cannot list draft images'
);
reset role;

-- Storage policies -----------------------------------------------------------------------

select ok(
  pg_temp.store_as('00000000-0000-0000-0000-000000009003', pg_temp.media_path('m1'),
    '00000000-0000-0000-0000-000000009003', 400000, 'image/webp'),
  'the owner uploads to their pending reservation'
);

select ok(
  not pg_temp.store_as('00000000-0000-0000-0000-000000009003',
    '20000000-0000-0000-0000-000000009001/unregistered/path.webp', '00000000-0000-0000-0000-000000009003', 1000, 'image/webp')
    and not pg_temp.store_as('00000000-0000-0000-0000-000000009004', pg_temp.media_path('m2'),
      '00000000-0000-0000-0000-000000009004', 300000, 'image/jpeg')
    and not pg_temp.store_as('00000000-0000-0000-0000-000000009001', pg_temp.media_path('m2'),
      '00000000-0000-0000-0000-000000009001', 300000, 'image/jpeg')
    and not pg_temp.store_as('00000000-0000-0000-0000-000000009003', pg_temp.media_path('m2'),
      '00000000-0000-0000-0000-000000009004', 300000, 'image/jpeg'),
  'unregistered paths, groupmates, the teacher, and a forged owner cannot write objects'
);

select is(
  array[
    pg_temp.visible_objects('00000000-0000-0000-0000-000000009003', pg_temp.media_path('m1')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000009004', pg_temp.media_path('m1')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000009001', pg_temp.media_path('m1')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000009002', pg_temp.media_path('m1'))
  ],
  array[1, 0, 0, 0]::bigint[],
  'only the owner can read a draft image object'
);

-- Confirm ---------------------------------------------------------------------------------

select ok(
  pg_temp.store_as('00000000-0000-0000-0000-000000009003', pg_temp.media_path('m3'),
    '00000000-0000-0000-0000-000000009003', 12345, 'image/jpeg'),
  'a mismatched object can be written while pending'
);

select pg_temp.media_call('confirm_missing', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.complete_observation_media_upload(%L, %L, 1)$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m2')));
select pg_temp.media_call('confirm_mismatch', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.complete_observation_media_upload(%L, %L, 1)$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m3')));

select is(
  pg_temp.result('confirm_missing', '{error_details,reason}') || ':' || pg_temp.result('confirm_mismatch', '{error_details,reason}'),
  'missing:mismatch',
  'confirmation refuses a missing object and one whose size differs'
);

select pg_temp.media_call('confirm', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.complete_observation_media_upload(%L, %L, 2)$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m1')));
select pg_temp.media_call('confirm_replay', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.complete_observation_media_upload(%L, %L, 3)$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m1')));

select ok(
  pg_temp.result('confirm', '{outcome}') = 'uploaded'
    and pg_temp.result('confirm_replay', '{outcome}') = 'existing'
    and (
      select count(*) = 1 and bool_and(payload = jsonb_build_object('category', 'whole_plant', 'processed_bytes', 400000, 'attempt_count', 2))
      from public.research_events where event_name = 'image_uploaded'
    ),
  'confirming marks the image uploaded once and emits one image_uploaded event'
);

select ok(
  not pg_temp.store_as('00000000-0000-0000-0000-000000009003', pg_temp.media_path('m1'),
    '00000000-0000-0000-0000-000000009003', 400000, 'image/webp'),
  'a confirmed image object can no longer be written'
);

-- Category -----------------------------------------------------------------------------------

select pg_temp.media_call('category', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.update_observation_media_category(%L, %L, 'leaf')$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m2')));
select pg_temp.media_call('category_same', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.update_observation_media_category(%L, %L, 'leaf')$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m2')));

select is(
  pg_temp.result('category', '{outcome}') || ':' || pg_temp.result('category_same', '{outcome}'),
  'unchanged:unchanged',
  'setting the same category reports unchanged'
);

select pg_temp.media_call('category_change', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.update_observation_media_category(%L, %L, 'fruit')$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m2')));

select is(pg_temp.result('category_change', '{media,category}'), 'fruit', 'the owner can change an image category');

-- Delete -------------------------------------------------------------------------------------

select pg_temp.media_call('delete_pending', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.delete_observation_media(%L, %L)$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m2')));

select ok(
  pg_temp.result('delete_pending', '{outcome}') = 'deleted'
    and not exists (select 1 from public.observation_media where id = pg_temp.media_id('m2')),
  'a pending image without an object is removed immediately'
);

select pg_temp.media_call('delete_uploaded', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.delete_observation_media(%L, %L)$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m1')));

select ok(
  pg_temp.result('delete_uploaded', '{outcome}') = 'deleting'
    and (select status from public.observation_media where id = pg_temp.media_id('m1')) = 'deleting',
  'an uploaded image is withdrawn first while its object still exists'
);

select is(
  array[
    pg_temp.remove_as('00000000-0000-0000-0000-000000009004', pg_temp.media_path('m1')),
    pg_temp.remove_as('00000000-0000-0000-0000-000000009003', pg_temp.media_path('m3')),
    pg_temp.remove_as('00000000-0000-0000-0000-000000009003', pg_temp.media_path('m1'))
  ],
  array[0, 0, 1]::bigint[],
  'only the owner removes an object, and only once its row is withdrawn'
);

select pg_temp.media_call('delete_finish', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.delete_observation_media(%L, %L)$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m1')));
select pg_temp.media_call('delete_again', '00000000-0000-0000-0000-000000009003',
  format($$select * from public.delete_observation_media(%L, %L)$$, pg_temp.observation_of('a1_obs'), pg_temp.media_id('m1')));

select ok(
  pg_temp.result('delete_finish', '{outcome}') = 'deleted'
    and pg_temp.result('delete_again', '{outcome}') = 'deleted'
    and not exists (select 1 from public.observation_media where id = pg_temp.media_id('m1')),
  'the second delete call removes the row and replays stay deleted'
);


select pg_temp.act_as('00000000-0000-0000-0000-000000009003');
set local role authenticated;
insert into p9_results select 'list', public.list_observation_media(pg_temp.observation_of('a1_obs'));
reset role;

select ok(
  pg_temp.result('list', '{limits,remaining}') = '2'
    and pg_temp.result('list', '{summary,uploadedCount}') = '0'
    and pg_temp.result('list', '{summary,hasWholePlant}') = 'false'
    and pg_temp.result('list', '{permissions,canEdit}') = 'true'
    and (select jsonb_array_length(row -> 'items') from p9_results where label = 'list') = 8,
  'the owner list reports remaining slots, counts, and edit permission'
);

select pg_temp.register_as('m_reuse_slot', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
  '90000000-0000-0000-0000-000000009030', 'whole_plant', 'image/jpeg', 1000, 100, 100, pg_temp.hash('slot'), 'img-v1');

select is(pg_temp.result('m_reuse_slot', '{media,position}'), '1', 'a freed position is reused');

-- Pause and completion --------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-000000009001');
set local role authenticated;
select pg_temp.call('pause', format($$select * from public.pause_exploration_session(%L)$$, pg_temp.session_id()));
reset role;

select pg_temp.register_as('m_paused', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
  '90000000-0000-0000-0000-000000009031', 'leaf', 'image/jpeg', 1000, 100, 100, pg_temp.hash('paused'), 'img-v1');

select is(pg_temp.result('m_paused', '{outcome}'), 'created', 'images can still be added while the session is paused');

select pg_temp.act_as('00000000-0000-0000-0000-000000009001');
set local role authenticated;
select pg_temp.call('resume', format($$select * from public.resume_exploration_session(%L)$$, pg_temp.session_id()));
select pg_temp.call('complete_leaf', format(
  $$select * from public.complete_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
reset role;

select pg_temp.register_as('m_done', '00000000-0000-0000-0000-000000009003', pg_temp.observation_of('a1_obs'),
  '90000000-0000-0000-0000-000000009032', 'leaf', 'image/jpeg', 1000, 100, 100, pg_temp.hash('done'), 'img-v1');

select ok(
  pg_temp.result('m_done', '{error_code}') || ':' || pg_temp.result('m_done', '{error_details,reason}')
    = 'INVALID_STATUS_TRANSITION:group_completed'
    and not pg_temp.store_as('00000000-0000-0000-0000-000000009003', pg_temp.media_path('m_paused'),
      '00000000-0000-0000-0000-000000009003', 1000, 'image/jpeg'),
  'after the group completes, no image can be reserved or uploaded'
);

select ok(
  (select version from public.observations where id = pg_temp.observation_of('a1_obs')) = (select version from p9_baseline)
    and (select count(*) from public.observation_status_history) = (select history from p9_baseline)
    and (select status from public.observations where id = pg_temp.observation_of('a1_obs')) = 'draft',
  'media changes leave the observation draft, version, and status history untouched'
);

select * from finish();
rollback;
