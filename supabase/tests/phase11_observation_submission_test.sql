begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(35);

-- Identities: teacher, other-school teacher, Leaf leader a1 and member a2,
-- Root leader a3, unassigned classmate u1.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000011001', 'p11.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000011002', 'p11.other.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000011003', 'p11.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000011004', 'p11.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000011005', 'p11.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000011006', 'p11.u1@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000011001', '00000000-0000-0000-0000-000000011002');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000011001', 'P11 School', '00000000-0000-0000-0000-000000011001'),
  ('10000000-0000-0000-0000-000000011002', 'P11 Other School', '00000000-0000-0000-0000-000000011002');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000011001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000011001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000011001', '00000000-0000-0000-0000-000000011003',
  '00000000-0000-0000-0000-000000011004', '00000000-0000-0000-0000-000000011005',
  '00000000-0000-0000-0000-000000011006'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000011002', '00000000-0000-0000-0000-000000011002', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000011001', '10000000-0000-0000-0000-000000011001', 'P11 Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000011001'),
  ('20000000-0000-0000-0000-000000011002', '10000000-0000-0000-0000-000000011002', 'P11 Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000011002');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000011001', user_id,
  case when user_id = '00000000-0000-0000-0000-000000011001'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000011001', '00000000-0000-0000-0000-000000011003',
  '00000000-0000-0000-0000-000000011004', '00000000-0000-0000-0000-000000011005',
  '00000000-0000-0000-0000-000000011006'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000011002', '00000000-0000-0000-0000-000000011002', 'teacher');

create temporary table p11_results (label text primary key, row jsonb not null);
grant all on table p11_results to authenticated, anon;

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
  execute format('insert into p11_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p11_results where label = label_value;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000011001' and name = group_name;
$$;

create function pg_temp.session_id()
returns uuid
language sql
as $$
  select (row ->> 'session_id')::uuid from p11_results where label = 'session';
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
  select (row ->> 'observation_id')::uuid from p11_results where label = label_value;
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000011003');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000011001', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000011001', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000011004', 'member', '00000000-0000-0000-0000-000000011003');

select pg_temp.act_as('00000000-0000-0000-0000-000000011005');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000011001', 'Root', null);
reset role;

insert into public.activities (id, class_id, title, status, created_by)
values ('60000000-0000-0000-0000-000000011001', '20000000-0000-0000-0000-000000011001', 'Garden survey', 'published', '00000000-0000-0000-0000-000000011001');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000011001', '60000000-0000-0000-0000-000000011001', '20000000-0000-0000-0000-000000011001', 1, 'Garden survey', '00000000-0000-0000-0000-000000011001');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000011001', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000011001'
where id = '61000000-0000-0000-0000-000000011001';

select pg_temp.act_as('00000000-0000-0000-0000-000000011001');
set local role authenticated;
select pg_temp.call('session', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000011001', 'Morning round')$$);
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
  select (row #>> '{media,id}')::uuid from p11_results where label = label_value;
$$;

create function pg_temp.media_path(label_value text)
returns text
language sql
as $$
  select row #>> '{media,upload,path}' from p11_results where label = label_value;
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

-- P11 helpers --------------------------------------------------------------------------

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
    ('80000000-0000-0000-0000-0000000110' || lpad(seed::text, 2, '0'))::uuid, 'captured', lat, lng, 8, now(), null);
  perform pg_temp.register_as(label_value || '_media', actor, pg_temp.observation_of(label_value),
    ('90000000-0000-0000-0000-0000000110' || lpad(seed::text, 2, '0'))::uuid, category, 'image/jpeg', 1000, 100, 100,
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

-- Pure helpers and posture ---------------------------------------------------------------

select is(
  array[
    private.observation_taxon_key_v1('Cassia fistula L.'),
    private.observation_taxon_key_v1('  CASSIA   FISTULA '),
    coalesce(private.observation_taxon_key_v1('Cassia sp.'), 'null'),
    coalesce(private.observation_taxon_key_v1('Cassia'), 'null'),
    coalesce(private.observation_taxon_key_v1('มะม่วง'), 'null'),
    private.observation_taxon_key_v1('Mentha x piperita'),
    private.observation_taxon_key_v1('Ficus religiosa var. religiosa')
  ],
  array['cassia fistula', 'cassia fistula', 'null', 'null', 'null', 'mentha x piperita', 'ficus religiosa'],
  'taxon-key-v1 normalizes binomials and never matches indeterminate or non-Latin names'
);

select is(
  array[
    private.is_unknown_plant_name('ไม่ทราบ'), private.is_unknown_plant_name(' Unknown '),
    private.is_unknown_plant_name('?'), private.is_unknown_plant_name('...'),
    private.is_unknown_plant_name(null), private.is_unknown_plant_name('มะม่วง')
  ],
  array[true, true, true, true, true, false],
  'unknown plant names are refused while real names pass'
);

select ok(
  private.observation_status_transition_allowed('draft', 'student_review')
    and private.observation_status_transition_allowed('student_review', 'submitted')
    and not private.observation_status_transition_allowed('draft', 'submitted')
    and not private.observation_status_transition_allowed('submitted', 'draft'),
  'the manual path allows only draft to student_review to submitted'
);

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.student_trait_verifications'::regclass, 'public.observation_submissions'::regclass,
    'public.observation_submission_media'::regclass, 'public.observation_duplicate_candidates'::regclass,
    'public.observation_relation_events'::regclass))
    and not has_table_privilege('authenticated', 'public.observation_submissions', 'INSERT')
    and not has_table_privilege('authenticated', 'public.observation_duplicate_candidates', 'UPDATE')
    and not has_table_privilege('anon', 'public.observation_submissions', 'SELECT'),
  'review tables have RLS and read-only grants'
);

-- Review -----------------------------------------------------------------------------------

select pg_temp.prepare('a1', '00000000-0000-0000-0000-000000011003', 1, 13.755, 100.505, 'whole_plant');

select pg_temp.submit_as('a1_too_early', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'),
  'a1000000-0000-0000-0000-000000011001', pg_temp.version_of('a1'), false);

select is(
  pg_temp.result('a1_too_early', '{error_code}') || ':' || pg_temp.result('a1_too_early', '{error_details,blockers,0}'),
  'STUDENT_REVIEW_REQUIRED:student_review',
  'a draft without a recorded review cannot be submitted'
);

select pg_temp.review_as('a1_review', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'), 1, 'manual',
  'ไม่ทราบ', 'Cassia fistula L.', 'สั้นไป',
  '[{"traitKey":"leaf_arrangement","value":"alternate"},{"traitKey":"flower_color","status":"not_visible"}]'::jsonb);

select ok(
  pg_temp.result('a1_review', '{outcome}') = 'updated'
    and pg_temp.result('a1_review', '{observation_status}') = 'student_review'
    and pg_temp.version_of('a1') = 2
    and (select count(*) from public.student_trait_verifications where observation_id = pg_temp.observation_of('a1')) = 2
    and (select count(*) from public.research_events where event_name = 'manual_entry_used' and observation_id = pg_temp.observation_of('a1')) = 1
    and exists (select 1 from public.observation_status_history where observation_id = pg_temp.observation_of('a1')
      and from_status = 'draft' and to_status = 'student_review' and reason = 'manual_entry_started'),
  'the first manual save records traits, moves to student_review, and logs manual entry once'
);

select pg_temp.review_as('a1_same', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'), 1, 'manual',
  'ไม่ทราบ', 'Cassia fistula L.', 'สั้นไป',
  '[{"traitKey":"leaf_arrangement","value":"alternate"},{"traitKey":"flower_color","status":"not_visible"}]'::jsonb);
select pg_temp.review_as('a1_stale', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'), 1, 'manual',
  'ราชพฤกษ์', 'Cassia fistula L.', 'สั้นไป', '[]'::jsonb);

select is(
  pg_temp.result('a1_same', '{outcome}') || ':' || pg_temp.result('a1_stale', '{error_code}'),
  'unchanged:OBSERVATION_VERSION_CONFLICT',
  'an identical retry is unchanged and a stale edit conflicts'
);

select pg_temp.review_as('a1_ai', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'), 2, 'ai_candidate',
  'ราชพฤกษ์', 'Cassia fistula', 'x', '[]'::jsonb);
select pg_temp.review_as('a1_bad_trait', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'), 2, 'manual',
  'ราชพฤกษ์', 'Cassia fistula', 'x', '[{"traitKey":"leaf_arrangement","value":"alternate","status":"unsure"}]'::jsonb);

select is(
  pg_temp.result('a1_ai', '{error_details,field}') || ':' || pg_temp.result('a1_bad_trait', '{error_details,field}'),
  'identitySource:traits',
  'AI identity is refused until P10 and a trait row must be a value or unsure/not visible'
);

-- Submit blockers -----------------------------------------------------------------------------

select pg_temp.submit_as('a1_unknown', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'),
  'a1000000-0000-0000-0000-000000011002', 2, false);

select is(
  pg_temp.result('a1_unknown', '{error_code}') || ':' || pg_temp.result('a1_unknown', '{error_details,reason}')
    || ':' || (select row #>> '{error_details,blockers}' from p11_results where label = 'a1_unknown'),
  'PLANT_NAME_REQUIRED:unknown_not_accepted:["common_name", "evidence_note"]',
  'an unknown name blocks submission and every unmet requirement is listed'
);

select pg_temp.review_as('a1_short', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'), 2, 'manual',
  'ราชพฤกษ์', 'Cassia fistula L.', 'สั้นไป', '[]'::jsonb);
select pg_temp.submit_as('a1_short_submit', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'),
  'a1000000-0000-0000-0000-000000011003', 3, false);

select is(
  pg_temp.result('a1_short_submit', '{error_code}') || ':' || pg_temp.result('a1_short_submit', '{error_details,reason}')
    || ':' || pg_temp.result('a1_short_submit', '{error_details,minChars}'),
  'VALIDATION_FAILED:too_short:20',
  'an evidence note under twenty characters blocks submission'
);

select pg_temp.review_as('a1_ready', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'), 3, 'manual',
  'ราชพฤกษ์', 'Cassia fistula L.', 'ดอกสีเหลืองห้อยเป็นช่อยาว ใบประกอบแบบขนนก', '[]'::jsonb);
select pg_temp.submit_as('a1_stale_submit', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'),
  'a1000000-0000-0000-0000-000000011004', 3, false);

select is(pg_temp.result('a1_stale_submit', '{error_code}'), 'OBSERVATION_VERSION_CONFLICT', 'a stale submit conflicts');

select pg_temp.prepare('a2_leaf_only', '00000000-0000-0000-0000-000000011004', 2, 13.7552, 100.5052, 'leaf');
select pg_temp.review_as('a2_leaf_review', '00000000-0000-0000-0000-000000011004', pg_temp.observation_of('a2_leaf_only'), 1, 'manual',
  'ราชพฤกษ์', 'Cassia fistula', 'ดอกสีเหลืองห้อยเป็นช่อยาว ใบประกอบแบบขนนก', '[]'::jsonb);
select pg_temp.submit_as('a2_no_whole', '00000000-0000-0000-0000-000000011004', pg_temp.observation_of('a2_leaf_only'),
  'a2000000-0000-0000-0000-000000011001', 2, false);

select is(
  pg_temp.result('a2_no_whole', '{error_code}') || ':' || pg_temp.result('a2_no_whole', '{error_details,fields,0}'),
  'VALIDATION_FAILED:wholePlantImage',
  'at least one uploaded whole-plant image is required'
);

-- Successful submission -------------------------------------------------------------------------

select pg_temp.submit_as('a1_submit', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'),
  'a1000000-0000-0000-0000-000000011005', 4, false);

select ok(
  pg_temp.result('a1_submit', '{outcome}') = 'submitted'
    and pg_temp.result('a1_submit', '{submission_number}') = '1'
    and (select status || ':' || version || ':' || submission_count from public.observations where id = pg_temp.observation_of('a1'))
      = 'submitted:5:1'
    and (select string_agg(coalesce(from_status, 'null') || '>' || to_status, ',' order by coalesce(from_status, 'null'))
         from public.observation_status_history where observation_id = pg_temp.observation_of('a1'))
      = 'draft>student_review,null>draft,student_review>submitted',
  'submitting records version 5, one submission, and the full status history'
);

select ok(
  (
    select common_name = 'ราชพฤกษ์' and scientific_name = 'Cassia fistula L.' and taxon_key = 'cassia fistula'
      and jsonb_array_length(media_snapshot) = 1
      and not (capture_snapshot ? 'lat') and not (capture_snapshot ? 'lng')
      and verification_snapshot ->> 'schemaVersion' = 'student-review-v1'
      and same_species_count = 0 and not same_species_acknowledged
    from public.observation_submissions where observation_id = pg_temp.observation_of('a1')
  )
    and (select count(*) from public.observation_submission_media) = 1,
  'the immutable submission snapshots names, evidence, media, and capture without coordinates'
);

select ok(
  (
    select count(*) = 1
      and bool_and(payload = jsonb_build_object('submission_version', 1, 'same_species_acknowledged', false, 'image_count', 1))
    from public.research_events where event_name = 'observation_submitted'
  ),
  'submitting emits observation_submitted with version, acknowledgement, and image count only'
);

select is(
  (
    select string_agg(recipient_id::text || ':' || type, ',')
    from public.notifications where observation_id = pg_temp.observation_of('a1')
  ),
  '00000000-0000-0000-0000-000000011001:observation_submitted',
  'only the class teacher is notified of the submission'
);

select pg_temp.submit_as('a1_replay', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'),
  'a1000000-0000-0000-0000-000000011005', 4, false);
select pg_temp.submit_as('a1_again', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'),
  'a1000000-0000-0000-0000-000000011006', 5, false);

select is(
  pg_temp.result('a1_replay', '{outcome}') || ':' || pg_temp.result('a1_again', '{error_details,reason}')
    || ':' || (select count(*) from public.observation_submissions)::text,
  'existing:already_submitted:1',
  'a replay returns the same submission and a second submit is refused'
);

-- Immutability after submission -------------------------------------------------------------------

select pg_temp.update_as('a1_edit_after', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'), 5, 'Changed', null, null);
select pg_temp.review_as('a1_review_after', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1'), 5, 'manual',
  'Changed', 'Cassia fistula', 'ดอกสีเหลืองห้อยเป็นช่อยาว ใบประกอบแบบขนนก', '[]'::jsonb);
select pg_temp.media_call('a1_delete_after', '00000000-0000-0000-0000-000000011003', format(
  $$select * from public.delete_observation_media(%L, %L)$$, pg_temp.observation_of('a1'), pg_temp.media_id('a1_media')));

select is(
  array[
    pg_temp.result('a1_edit_after', '{error_details,reason}'),
    pg_temp.result('a1_review_after', '{error_details,reason}'),
    pg_temp.result('a1_delete_after', '{error_details,reason}')
  ],
  array['submitted', 'submitted', 'submitted'],
  'after submission the draft, review, and images are read-only'
);

select throws_ok(
  format($$update public.observations set student_common_name = 'x' where id = %L$$, pg_temp.observation_of('a1')),
  '42501', 'OBSERVATION_SUBMITTED_IMMUTABLE', 'submitted content cannot be rewritten directly'
);

select throws_ok(
  $$update public.observation_submissions set evidence_note = 'rewritten'$$,
  '42501', 'APPEND_ONLY', 'submissions are append-only'
);

select throws_ok(
  format($$delete from public.observation_media where id = %L$$, pg_temp.media_id('a1_media')),
  '42501', null, 'a submitted image row cannot be deleted'
);

-- Teacher access ----------------------------------------------------------------------------------

select is(
  array[
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000011001', 'select count(*) from public.observation_submissions'),
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000011002', 'select count(*) from public.observation_submissions'),
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000011004', 'select count(*) from public.observation_submissions'),
    pg_temp.teacher_sees('00000000-0000-0000-0000-000000011001', 'select count(*) from public.observations')
  ],
  array[1, 0, 0, 0]::bigint[],
  'the class teacher reads submissions but never the observations table; others read nothing'
);

select is(
  array[
    pg_temp.visible_objects('00000000-0000-0000-0000-000000011001', pg_temp.media_path('a1_media')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000011001', pg_temp.media_path('a2_leaf_only_media')),
    pg_temp.visible_objects('00000000-0000-0000-0000-000000011002', pg_temp.media_path('a1_media'))
  ],
  array[1, 0, 0]::bigint[],
  'the class teacher can read submitted images only'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000011001');
set local role authenticated;
insert into p11_results select 'teacher_review', public.get_teacher_observation_review(pg_temp.observation_of('a1'));
reset role;

select ok(
  pg_temp.result('teacher_review', '{student,displayName}') is not null
    and pg_temp.result('teacher_review', '{submissions,0,commonName}') = 'ราชพฤกษ์'
    and (select jsonb_array_length(row #> '{submissions,0,media}') from p11_results where label = 'teacher_review') = 1,
  'the class teacher reads the submitted observation with its images'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000011001');
set local role authenticated;
select throws_ok(
  format($$select public.get_teacher_observation_review(%L)$$, pg_temp.observation_of('a2_leaf_only')),
  '42501', 'FORBIDDEN', 'teachers cannot open a draft'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000011002');
set local role authenticated;
select throws_ok(
  format($$select public.get_teacher_observation_review(%L)$$, pg_temp.observation_of('a1')),
  '42501', 'FORBIDDEN', 'teachers of other classes cannot open a submission'
);
reset role;

-- Same species: warn, acknowledge, tag, never merge --------------------------------------------------

select pg_temp.prepare('a2', '00000000-0000-0000-0000-000000011004', 3, 13.75501, 100.50501, 'whole_plant');
select pg_temp.review_as('a2_review', '00000000-0000-0000-0000-000000011004', pg_temp.observation_of('a2'), 1, 'manual',
  'ราชพฤกษ์', 'cassia  fistula', 'ช่อดอกสีเหลืองสดห้อยลงมา เปลือกสีเทา', '[]'::jsonb);
select pg_temp.submit_as('a2_warn', '00000000-0000-0000-0000-000000011004', pg_temp.observation_of('a2'),
  'a2000000-0000-0000-0000-000000011002', 2, false);
select pg_temp.submit_as('a2_warn_again', '00000000-0000-0000-0000-000000011004', pg_temp.observation_of('a2'),
  'a2000000-0000-0000-0000-000000011002', 2, false);

select ok(
  pg_temp.result('a2_warn', '{error_code}') = 'SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED'
    and pg_temp.result('a2_warn', '{error_details,sameSpeciesCount}') = '1'
    and pg_temp.result('a2_warn', '{error_details,possibleSameSpecimenCount}') = '1'
    and (select count(*) from public.research_events where event_name = 'same_species_warning_shown') = 1
    and (select count(*) from public.observation_submissions where observation_id = pg_temp.observation_of('a2')) = 0,
  'a same-species match asks for acknowledgement once, records the warning once, and submits nothing yet'
);

select pg_temp.submit_as('a2_submit', '00000000-0000-0000-0000-000000011004', pg_temp.observation_of('a2'),
  'a2000000-0000-0000-0000-000000011002', 2, true);

select ok(
  pg_temp.result('a2_submit', '{outcome}') = 'submitted'
    and (select same_species_in_session and same_species_count = 1 from public.observations where id = pg_temp.observation_of('a2'))
    and (select string_agg(relationship_type, ',' order by relationship_type) from public.observation_duplicate_candidates)
      = 'possible_same_specimen,same_species'
    and (select status || ':' || version || ':' || same_species_in_session from public.observations where id = pg_temp.observation_of('a1'))
      = 'submitted:5:false',
  'the acknowledged submission is tagged with both signals and the earlier record is untouched'
);

select is(
  (select count(*) from public.notifications where observation_id = pg_temp.observation_of('a2') and type = 'same_species_warning'),
  1::bigint,
  'the class teacher is told about the same-species submission'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000011004');
set local role authenticated;
insert into p11_results select 'a2_related', public.get_observation_related(pg_temp.observation_of('a2'));
reset role;

select ok(
  pg_temp.result('a2_related', '{sameSpeciesCount}') = '1'
    and pg_temp.result('a2_related', '{visibility}') = 'restricted'
    and not ((select row from p11_results where label = 'a2_related') ? 'relations')
    and (select row::text !~ 'Cassia|ราชพฤกษ์|000000011003' from p11_results where label = 'a2_related'),
  'the student sees counts only, never the other student or their record'
);

select pg_temp.prepare('a1_mango', '00000000-0000-0000-0000-000000011003', 4, 13.755, 100.505, 'whole_plant');
select pg_temp.review_as('a1_mango_review', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1_mango'), 1, 'manual',
  'มะม่วง', 'Mangifera indica', 'ใบเดี่ยวเรียงเวียน ขยี้แล้วมีกลิ่นยาง', '[]'::jsonb);
select pg_temp.submit_as('a1_mango_submit', '00000000-0000-0000-0000-000000011003', pg_temp.observation_of('a1_mango'),
  'a1000000-0000-0000-0000-000000011010', 2, false);

select ok(
  pg_temp.result('a1_mango_submit', '{outcome}') = 'submitted'
    and (select count(*) from public.observation_duplicate_candidates
         where observation_id = pg_temp.observation_of('a1_mango') or candidate_observation_id = pg_temp.observation_of('a1_mango')) = 0,
  'a different species at the same spot creates no relation'
);

-- Teacher decisions ---------------------------------------------------------------------------------

create function pg_temp.relation_id(kind text)
returns uuid
language sql
as $$
  select id from public.observation_duplicate_candidates where relationship_type = kind;
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000011004');
set local role authenticated;
select throws_ok(
  format($$select * from public.decide_observation_relation(%L, 'same_specimen', null)$$, pg_temp.relation_id('possible_same_specimen')),
  '42501', 'FORBIDDEN', 'students cannot decide relations'
);
reset role;

select pg_temp.media_call('decide_species', '00000000-0000-0000-0000-000000011001', format(
  $$select * from public.decide_observation_relation(%L, 'same_specimen', null)$$, pg_temp.relation_id('same_species')));
select pg_temp.media_call('decide', '00000000-0000-0000-0000-000000011001', format(
  $$select * from public.decide_observation_relation(%L, 'same_specimen', null)$$, pg_temp.relation_id('possible_same_specimen')));
select pg_temp.media_call('decide_same', '00000000-0000-0000-0000-000000011001', format(
  $$select * from public.decide_observation_relation(%L, 'same_specimen', null)$$, pg_temp.relation_id('possible_same_specimen')));
select pg_temp.media_call('decide_stale', '00000000-0000-0000-0000-000000011001', format(
  $$select * from public.decide_observation_relation(%L, 'not_same_specimen', null)$$, pg_temp.relation_id('possible_same_specimen')));

select is(
  array[
    pg_temp.result('decide_species', '{error_details,reason}'),
    pg_temp.result('decide', '{outcome}'),
    pg_temp.result('decide_same', '{outcome}'),
    pg_temp.result('decide_stale', '{error_details,reason}')
  ],
  array['not_specimen_candidate', 'decided', 'unchanged', 'decision_changed'],
  'teachers decide only specimen candidates, repeats are unchanged, and stale decisions conflict'
);

select ok(
  (select count(*) from public.observation_relation_events where event_type = 'teacher_decided') = 1
    and (select count(*) from public.audit_logs where action = 'observation_relation_decided') = 1
,
  'a decision writes one history event and one audit row'
);

select ok(
  (select status || ':' || version from public.observations where id = pg_temp.observation_of('a1')) = 'submitted:5'
    and (select status || ':' || version from public.observations where id = pg_temp.observation_of('a2')) = 'submitted:3',
  'no observation is merged or altered by relations'
);

select * from finish();
rollback;
