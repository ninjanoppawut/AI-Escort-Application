begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(22);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000006201', 'p6b.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006202', 'p6b.outsider@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006203', 'p6b.student@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000006201', '00000000-0000-0000-0000-000000006202');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000006201', 'P6B School', '00000000-0000-0000-0000-000000006201'),
  ('10000000-0000-0000-0000-000000006202', 'P6B Other School', '00000000-0000-0000-0000-000000006202');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000006201', '00000000-0000-0000-0000-000000006201', 'teacher'),
  ('10000000-0000-0000-0000-000000006201', '00000000-0000-0000-0000-000000006203', 'student'),
  ('10000000-0000-0000-0000-000000006202', '00000000-0000-0000-0000-000000006202', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000006201', '10000000-0000-0000-0000-000000006201', 'P6B Class', 1, 4, 3, true, 'open', '00000000-0000-0000-0000-000000006201'),
  ('20000000-0000-0000-0000-000000006202', '10000000-0000-0000-0000-000000006202', 'P6B Other Class', 1, 4, 3, true, 'open', '00000000-0000-0000-0000-000000006202');

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000006201', '00000000-0000-0000-0000-000000006201', 'teacher'),
  ('20000000-0000-0000-0000-000000006201', '00000000-0000-0000-0000-000000006203', 'student'),
  ('20000000-0000-0000-0000-000000006202', '00000000-0000-0000-0000-000000006202', 'teacher');

create temporary table p6b_results (label text primary key, row jsonb not null);
grant all on table p6b_results to authenticated, anon;

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
  execute format('insert into p6b_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p6b_results where label = label_value;
$$;

create function pg_temp.square()
returns jsonb
language sql
as $$
  select '{"type":"Polygon","coordinates":[[[100.50,13.75],[100.51,13.75],[100.51,13.76],[100.50,13.76],[100.50,13.75]]]}'::jsonb;
$$;

create function pg_temp.line()
returns jsonb
language sql
as $$
  select '{"type":"LineString","coordinates":[[100.501,13.751],[100.509,13.759]]}'::jsonb;
$$;

create function pg_temp.checkpoint(sequence_value integer, lng numeric, lat numeric)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'sequenceNumber', sequence_value,
    'title', 'Stop ' || sequence_value,
    'location', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(lng, lat)),
    'radiusM', 15
  );
$$;

create function pg_temp.draft(title_value text, boundary jsonb, route jsonb, checkpoints jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'title', title_value,
    'description', 'Survey the garden',
    'instructions', 'Stay inside the boundary.',
    'geometry', jsonb_build_object('boundary', boundary, 'route', route, 'checkpoints', checkpoints),
    'plugin', jsonb_build_object('key', 'plant_survey', 'schemaVersion', 1, 'config', '{}'::jsonb)
  );
$$;

create function pg_temp.activity_id()
returns uuid
language sql
as $$
  select (row ->> 'activity_id')::uuid from p6b_results where label = 'create';
$$;

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname in (
        'save_activity_draft', 'publish_activity', 'list_class_activities', 'get_activity_detail'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  4::bigint,
  'activity RPCs are security definer with empty search paths'
);

select ok(
  (
    select bool_and(
      has_function_privilege('authenticated', signature, 'EXECUTE')
      and not has_function_privilege('anon', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.save_activity_draft(jsonb,uuid,uuid,integer)', 'public.publish_activity(uuid,integer)',
      'public.list_class_activities(uuid)', 'public.get_activity_detail(uuid)'
    ]) as signature
  )
    and not has_function_privilege('authenticated', 'private.activity_geometry_from_geojson(jsonb,text)', 'EXECUTE'),
  'activity RPCs are authenticated-only and geometry helpers are private'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000006203');
set local role authenticated;
select throws_ok(
  format(
    $$select * from public.save_activity_draft(%L::jsonb, '20000000-0000-0000-0000-000000006201')$$,
    pg_temp.draft('Student plan', null, null, '[]'::jsonb)
  ),
  '42501',
  'FORBIDDEN',
  'students cannot author activities'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000006202');
set local role authenticated;
select throws_ok(
  format(
    $$select * from public.save_activity_draft(%L::jsonb, '20000000-0000-0000-0000-000000006201')$$,
    pg_temp.draft('Outsider plan', null, null, '[]'::jsonb)
  ),
  '42501',
  'FORBIDDEN',
  'teachers of other classes cannot author activities'
);
select throws_ok(
  $$select public.list_class_activities('20000000-0000-0000-0000-000000006201')$$,
  '42501',
  'FORBIDDEN',
  'teachers of other classes cannot list activities'
);
reset role;

-- Teacher authoring.
select pg_temp.act_as('00000000-0000-0000-0000-000000006201');
set local role authenticated;
select pg_temp.call('create', format(
  $$select * from public.save_activity_draft(%L::jsonb, '20000000-0000-0000-0000-000000006201')$$,
  pg_temp.draft('Garden survey', pg_temp.square(), null, '[]'::jsonb)
));
select pg_temp.call('bowtie', format(
  $$select * from public.save_activity_draft(%2$L::jsonb, null, %1$L, 1)$$,
  pg_temp.activity_id(),
  pg_temp.draft(
    'Changed title',
    '{"type":"Polygon","coordinates":[[[100.50,13.75],[100.51,13.76],[100.51,13.75],[100.50,13.76],[100.50,13.75]]]}'::jsonb,
    null,
    '[]'::jsonb
  )
));
select pg_temp.call('wrong_type', format(
  $$select * from public.save_activity_draft(%2$L::jsonb, null, %1$L, 1)$$,
  pg_temp.activity_id(),
  pg_temp.draft('Changed title', '{"type":"Point","coordinates":[100.5,13.75]}'::jsonb, null, '[]'::jsonb)
));
select pg_temp.call('duplicate_sequence', format(
  $$select * from public.save_activity_draft(%2$L::jsonb, null, %1$L, 1)$$,
  pg_temp.activity_id(),
  pg_temp.draft(
    'Garden survey', pg_temp.square(), pg_temp.line(),
    jsonb_build_array(pg_temp.checkpoint(1, 100.505, 13.755), pg_temp.checkpoint(1, 100.506, 13.756))
  )
));
select pg_temp.call('stale', format(
  $$select * from public.save_activity_draft(%2$L::jsonb, null, %1$L, 5)$$,
  pg_temp.activity_id(),
  pg_temp.draft('Garden survey', pg_temp.square(), null, '[]'::jsonb)
));
select pg_temp.call('publish_missing_route', format(
  $$select * from public.publish_activity(%L, 1)$$, pg_temp.activity_id()
));
select pg_temp.call('save_outside', format(
  $$select * from public.save_activity_draft(%2$L::jsonb, null, %1$L, 1)$$,
  pg_temp.activity_id(),
  pg_temp.draft(
    'Garden survey', pg_temp.square(), pg_temp.line(),
    jsonb_build_array(pg_temp.checkpoint(1, 100.505, 13.755), pg_temp.checkpoint(2, 100.60, 13.75))
  )
));
select pg_temp.call('publish_outside', format(
  $$select * from public.publish_activity(%L, 1)$$, pg_temp.activity_id()
));
select pg_temp.call('save_valid', format(
  $$select * from public.save_activity_draft(%2$L::jsonb, null, %1$L, 1)$$,
  pg_temp.activity_id(),
  pg_temp.draft(
    'Garden survey', pg_temp.square(), pg_temp.line(),
    jsonb_build_array(pg_temp.checkpoint(1, 100.505, 13.755), pg_temp.checkpoint(2, 100.507, 13.757))
  )
));
select pg_temp.call('publish_valid', format(
  $$select * from public.publish_activity(%L, 1)$$, pg_temp.activity_id()
));
select pg_temp.call('publish_replay', format(
  $$select * from public.publish_activity(%L, 1)$$, pg_temp.activity_id()
));
select pg_temp.call('save_v2', format(
  $$select * from public.save_activity_draft(%2$L::jsonb, null, %1$L, 1)$$,
  pg_temp.activity_id(),
  pg_temp.draft(
    'Garden survey v2', pg_temp.square(), pg_temp.line(),
    jsonb_build_array(pg_temp.checkpoint(1, 100.505, 13.755))
  )
));
select pg_temp.call('draft_only', format(
  $$select * from public.save_activity_draft(%L::jsonb, '20000000-0000-0000-0000-000000006201')$$,
  pg_temp.draft('Pond survey', null, null, '[]'::jsonb)
));
insert into p6b_results
select 'teacher_list', public.list_class_activities('20000000-0000-0000-0000-000000006201');
insert into p6b_results
select 'teacher_draft_detail', public.get_activity_detail((select (row ->> 'activity_id')::uuid from p6b_results where label = 'draft_only'));
reset role;

select ok(
  pg_temp.result('create', '{outcome}') = 'created'
    and pg_temp.result('create', '{version_number}') = '1'
    and exists (
      select 1 from public.activity_boundaries as boundary_row
      join public.activity_versions as version on version.id = boundary_row.activity_version_id
      where version.activity_id = pg_temp.activity_id()
    ),
  'a class teacher creates an activity with a partial draft'
);

select is(
  pg_temp.result('bowtie', '{error_code}') || ':' || pg_temp.result('bowtie', '{error_details,field}'),
  'ACTIVITY_GEOMETRY_INVALID:boundary',
  'an invalid boundary is refused with the failing field'
);

select ok(
  (select title from public.activities where id = pg_temp.activity_id()) = 'Garden survey'
    and exists (
      select 1 from public.activity_boundaries as boundary_row
      join public.activity_versions as version on version.id = boundary_row.activity_version_id
      where version.activity_id = pg_temp.activity_id()
    ),
  'a refused save changes nothing'
);

select is(
  pg_temp.result('wrong_type', '{error_code}') || ':' || pg_temp.result('wrong_type', '{error_details,field}'),
  'ACTIVITY_GEOMETRY_INVALID:boundary',
  'a boundary must be a GeoJSON Polygon'
);

select is(
  pg_temp.result('duplicate_sequence', '{error_code}') || ':' || pg_temp.result('duplicate_sequence', '{error_details,field}'),
  'ACTIVITY_GEOMETRY_INVALID:checkpoints',
  'checkpoint sequence numbers must be unique'
);

select is(
  pg_temp.result('stale', '{error_code}') || ':' || pg_temp.result('stale', '{error_details,currentVersionNumber}'),
  'ACTIVITY_VERSION_CONFLICT:1',
  'a stale expected version is refused with the current version'
);

select is(
  pg_temp.result('publish_missing_route', '{error_code}') || ':' || pg_temp.result('publish_missing_route', '{error_details,reason}'),
  'ACTIVITY_GEOMETRY_INVALID:route_required',
  'publishing requires a route'
);

select is(
  pg_temp.result('publish_outside', '{error_details,reason}') || ':' || pg_temp.result('publish_outside', '{error_details,sequenceNumber}'),
  'checkpoint_outside_boundary:2',
  'publishing requires every checkpoint inside the boundary'
);

select ok(
  pg_temp.result('publish_valid', '{outcome}') = 'published'
    and (select status from public.activities where id = pg_temp.activity_id()) = 'published'
    and (
      select status from public.activity_versions
      where activity_id = pg_temp.activity_id() and version_number = 1
    ) = 'published',
  'a valid draft publishes and the activity becomes published'
);

select is(pg_temp.result('publish_replay', '{outcome}'), 'published', 'publishing is idempotent for the published version');

select is(
  (
    select string_agg(action, ',' order by action)
    from public.audit_logs
    where class_id = '20000000-0000-0000-0000-000000006201'
      and resource_id in (
        pg_temp.activity_id(),
        (select id from public.activity_versions where activity_id = pg_temp.activity_id() and version_number = 1)
      )
  ),
  'activity_created,activity_published',
  'creation and publication are audited'
);

select ok(
  pg_temp.result('save_v2', '{outcome}') = 'saved'
    and pg_temp.result('save_v2', '{version_number}') = '2',
  'editing a published activity starts the next draft version'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000006201');
set local role authenticated;
select pg_temp.call('publish_v2', format(
  $$select * from public.publish_activity(%L, 2)$$, pg_temp.activity_id()
));
reset role;

select is(
  (
    select string_agg(version_number || ':' || status, ',' order by version_number)
    from public.activity_versions
    where activity_id = pg_temp.activity_id()
  ),
  '1:superseded,2:published',
  'publishing a new version supersedes the previous one'
);

select is(
  array[
    jsonb_array_length((select row -> 'items' from p6b_results where label = 'teacher_list')),
    (
      select count(*)::integer
      from jsonb_array_elements((select row -> 'items' from p6b_results where label = 'teacher_list')) as item
      where item.value ->> 'draftVersionNumber' is not null
    )
  ],
  array[2, 2],
  'teachers list drafts alongside published activities'
);

select ok(
  pg_temp.result('teacher_draft_detail', '{published}') is null
    and pg_temp.result('teacher_draft_detail', '{draft,versionNumber}') = '1',
  'teachers read draft-only activity detail'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000006203');
set local role authenticated;
insert into p6b_results
select 'student_list', public.list_class_activities('20000000-0000-0000-0000-000000006201');
insert into p6b_results
select 'student_detail', public.get_activity_detail(pg_temp.activity_id());
select throws_ok(
  format($$select public.get_activity_detail(%L)$$, (select (row ->> 'activity_id')::uuid from p6b_results where label = 'draft_only')),
  '42501',
  'FORBIDDEN',
  'students cannot read draft-only activities'
);
reset role;

select ok(
  jsonb_array_length((select row -> 'items' from p6b_results where label = 'student_list')) = 1
    and pg_temp.result('student_list', '{items,0,draftVersionNumber}') is null,
  'students list published activities only, without draft versions'
);

select ok(
  pg_temp.result('student_detail', '{draft}') is null
    and pg_temp.result('student_detail', '{published,versionNumber}') = '2'
    and pg_temp.result('student_detail', '{published,geometry,boundary,type}') = 'Polygon'
    and pg_temp.result('student_detail', '{published,summary,checkpointCount}') = '1'
    and pg_temp.result('student_detail', '{published,summary,routeLengthM}')::integer > 0,
  'students read published GeoJSON geometry and summary but never the draft'
);

select * from finish();
rollback;
