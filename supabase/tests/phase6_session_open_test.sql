begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(22);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000006301', 'p6c.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006302', 'p6c.outsider@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006303', 'p6c.leader.one@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006304', 'p6c.member.one@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006305', 'p6c.leader.two@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006306', 'p6c.unassigned@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000006301', '00000000-0000-0000-0000-000000006302');

update public.profiles as profile
set display_name = names.display_name
from (
  values
    ('00000000-0000-0000-0000-000000006303'::uuid, 'Ada Leader'),
    ('00000000-0000-0000-0000-000000006304'::uuid, 'Bo Member'),
    ('00000000-0000-0000-0000-000000006305'::uuid, 'Cy Leader'),
    ('00000000-0000-0000-0000-000000006306'::uuid, 'Di Unassigned')
) as names(id, display_name)
where profile.id = names.id;

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000006301', 'P6C School', '00000000-0000-0000-0000-000000006301'),
  ('10000000-0000-0000-0000-000000006302', 'P6C Other School', '00000000-0000-0000-0000-000000006302');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000006301', user_id,
  case when user_id = '00000000-0000-0000-0000-000000006301'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000006301', '00000000-0000-0000-0000-000000006303',
  '00000000-0000-0000-0000-000000006304', '00000000-0000-0000-0000-000000006305',
  '00000000-0000-0000-0000-000000006306'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000006302', '00000000-0000-0000-0000-000000006302', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000006301', '10000000-0000-0000-0000-000000006301', 'P6C Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000006301'),
  ('20000000-0000-0000-0000-000000006302', '10000000-0000-0000-0000-000000006302', 'P6C Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000006302');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000006301', user_id,
  case when user_id = '00000000-0000-0000-0000-000000006301'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000006301', '00000000-0000-0000-0000-000000006303',
  '00000000-0000-0000-0000-000000006304', '00000000-0000-0000-0000-000000006305',
  '00000000-0000-0000-0000-000000006306'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000006302', '00000000-0000-0000-0000-000000006302', 'teacher');

create temporary table p6c_results (label text primary key, row jsonb not null);
grant all on table p6c_results to authenticated, anon;

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
  execute format('insert into p6c_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p6c_results where label = label_value;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000006301' and name = group_name;
$$;

-- Groups: Leaf (Ada leader, Bo member), Root (Cy leader), Empty (no members).
select pg_temp.act_as('00000000-0000-0000-0000-000000006303');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000006301', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000006301', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000006304', 'member', '00000000-0000-0000-0000-000000006303');

select pg_temp.act_as('00000000-0000-0000-0000-000000006305');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000006301', 'Root', null);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000006301');
set local role authenticated;
select * from public.create_teacher_group('20000000-0000-0000-0000-000000006301', 'Empty');
reset role;

-- Activities: one published, one draft only.
insert into public.activities (id, class_id, title, status, created_by)
values
  ('60000000-0000-0000-0000-000000006301', '20000000-0000-0000-0000-000000006301', 'Garden survey', 'published', '00000000-0000-0000-0000-000000006301'),
  ('60000000-0000-0000-0000-000000006302', '20000000-0000-0000-0000-000000006301', 'Draft survey', 'draft', '00000000-0000-0000-0000-000000006301');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values
  ('61000000-0000-0000-0000-000000006301', '60000000-0000-0000-0000-000000006301', '20000000-0000-0000-0000-000000006301', 1, 'Garden survey', '00000000-0000-0000-0000-000000006301'),
  ('61000000-0000-0000-0000-000000006302', '60000000-0000-0000-0000-000000006302', '20000000-0000-0000-0000-000000006301', 1, 'Draft survey', '00000000-0000-0000-0000-000000006301');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000006301', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
insert into public.activity_routes (activity_version_id, route)
values ('61000000-0000-0000-0000-000000006301', st_geomfromtext('LINESTRING(100.501 13.751, 100.509 13.759)', 4326));
insert into public.activity_checkpoints (activity_version_id, sequence_number, title, location)
values ('61000000-0000-0000-0000-000000006301', 1, 'Start', st_geomfromtext('POINT(100.505 13.755)', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000006301'
where id = '61000000-0000-0000-0000-000000006301';

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname in (
        'create_exploration_session', 'open_exploration_session', 'get_session_setup', 'list_class_sessions'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  4::bigint,
  'session RPCs are security definer with empty search paths'
);

select ok(
  (
    select bool_and(
      has_function_privilege('authenticated', signature, 'EXECUTE')
      and not has_function_privilege('anon', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.create_exploration_session(uuid,text,timestamp with time zone)',
      'public.open_exploration_session(uuid,uuid[])',
      'public.get_session_setup(uuid)', 'public.list_class_sessions(uuid)'
    ]) as signature
  )
    and not has_function_privilege('authenticated', 'private.insert_session_research_event(text,uuid,uuid,uuid,uuid,uuid,jsonb)', 'EXECUTE'),
  'session RPCs are authenticated-only and event helpers are private'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000006303');
set local role authenticated;
select throws_ok(
  $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000006301', 'Student round')$$,
  '42501',
  'FORBIDDEN',
  'students cannot schedule sessions'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000006301');
set local role authenticated;
select pg_temp.call('draft_activity', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000006302', 'Draft round')$$);
select pg_temp.call('blank_title', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000006301', '  ')$$);
select pg_temp.call('create', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000006301', 'Morning round', '2026-09-14 09:00+07')$$);
insert into p6c_results
select 'setup_before', public.get_session_setup((select (row ->> 'session_id')::uuid from p6c_results where label = 'create'));
select pg_temp.call('open_partial', format(
  $$select * from public.open_exploration_session(%L, array[%L]::uuid[])$$,
  pg_temp.result('create', '{session_id}'), pg_temp.group_named('Leaf')
));
select pg_temp.call('open_duplicate', format(
  $$select * from public.open_exploration_session(%L, array[%L, %L]::uuid[])$$,
  pg_temp.result('create', '{session_id}'), pg_temp.group_named('Leaf'), pg_temp.group_named('Leaf')
));
select pg_temp.call('open', format(
  $$select * from public.open_exploration_session(%L, array[%L, %L]::uuid[])$$,
  pg_temp.result('create', '{session_id}'), pg_temp.group_named('Root'), pg_temp.group_named('Leaf')
));
select pg_temp.call('open_replay', format(
  $$select * from public.open_exploration_session(%L, array[%L, %L]::uuid[])$$,
  pg_temp.result('create', '{session_id}'), pg_temp.group_named('Root'), pg_temp.group_named('Leaf')
));
select pg_temp.call('second', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000006301', 'Afternoon round')$$);
select pg_temp.call('open_second', format(
  $$select * from public.open_exploration_session(%L, array[%L, %L]::uuid[])$$,
  pg_temp.result('second', '{session_id}'), pg_temp.group_named('Root'), pg_temp.group_named('Leaf')
));
select pg_temp.call('move_blocked', format(
  $$select * from public.move_student_between_groups('20000000-0000-0000-0000-000000006301', '00000000-0000-0000-0000-000000006304', %L)$$,
  pg_temp.group_named('Empty')
));
select pg_temp.call('delete_blocked', format(
  $$select * from public.delete_or_archive_group(%L)$$, pg_temp.group_named('Leaf')
));
select pg_temp.call('move_free', format(
  $$select * from public.move_student_between_groups('20000000-0000-0000-0000-000000006301', '00000000-0000-0000-0000-000000006306', %L)$$,
  pg_temp.group_named('Empty')
));
insert into p6c_results
select 'teacher_list', public.list_class_sessions('20000000-0000-0000-0000-000000006301');
reset role;

select is(
  pg_temp.result('draft_activity', '{error_code}'),
  'ACTIVITY_NOT_PUBLISHED',
  'sessions require a published activity version'
);

select is(pg_temp.result('blank_title', '{error_code}'), 'VALIDATION_FAILED', 'sessions require a title');

select ok(
  pg_temp.result('create', '{outcome}') = 'created'
    and pg_temp.result('create', '{activity_version_id}') = '61000000-0000-0000-0000-000000006301'
    and pg_temp.result('setup_before', '{session,status}') = 'scheduled',
  'a class teacher schedules a session on the published version'
);

select is(
  array[
    (select string_agg(item.value ->> 'name', ',' order by item.ordinality) from jsonb_array_elements((select row -> 'eligibleGroups' from p6c_results where label = 'setup_before')) with ordinality as item),
    (select string_agg(item.value ->> 'name' || ':' || (item.value ->> 'reason'), ',') from jsonb_array_elements((select row -> 'excludedGroups' from p6c_results where label = 'setup_before')) as item),
    pg_temp.result('setup_before', '{unassignedStudentCount}')
  ],
  array['Leaf,Root', 'Empty:no_members', '1'],
  'setup lists groups with members, excludes empty groups, and counts unassigned students'
);

select is(
  pg_temp.result('open_partial', '{error_code}') || ':' || pg_temp.result('open_partial', '{error_details,reason}'),
  'INVALID_STATUS_TRANSITION:queue_mismatch',
  'the queue must include every eligible group'
);

select is(
  pg_temp.result('open_duplicate', '{error_details,reason}'),
  'queue_mismatch',
  'the queue cannot repeat a group'
);

select ok(
  pg_temp.result('open', '{outcome}') = 'opened'
    and pg_temp.result('open', '{group_count}') = '2'
    and pg_temp.result('open', '{participant_count}') = '3'
    and (
      select status = 'open' and opened_by = '00000000-0000-0000-0000-000000006301'
      from public.exploration_sessions where id = pg_temp.result('create', '{session_id}')::uuid
    ),
  'opening snapshots two groups and three participants'
);

select is(
  (
    select string_agg(group_row.name || ':' || session_group.queue_position || ':' || session_group.status, ',' order by session_group.queue_position)
    from public.exploration_session_groups as session_group
    join public.groups as group_row on group_row.id = session_group.group_id
    where session_group.session_id = pg_temp.result('create', '{session_id}')::uuid
  ),
  'Root:1:waiting,Leaf:2:waiting',
  'the queue follows the teacher order and starts waiting'
);

select is(
  (
    select string_agg(profile.display_name || ':' || participant.role_at_start, ',' order by profile.display_name)
    from public.session_participants as participant
    join public.profiles as profile on profile.id = participant.user_id
    where participant.session_id = pg_temp.result('create', '{session_id}')::uuid
  ),
  'Ada Leader:leader,Bo Member:member,Cy Leader:leader',
  'participants snapshot membership and leadership at open'
);

select is(
  array[
    (select count(*) from public.session_events where session_id = pg_temp.result('create', '{session_id}')::uuid and event_type = 'session_opened'),
    (select count(*) from public.research_events where session_id = pg_temp.result('create', '{session_id}')::uuid and event_name = 'session_opened' and payload ->> 'participant_count' = '3' and payload ->> 'activity_version' = '1'),
    (select count(*) from public.audit_logs where resource_id = pg_temp.result('create', '{session_id}')::uuid and action in ('session_created', 'session_opened'))
  ],
  array[1, 1, 2]::bigint[],
  'opening writes a session event, a session_opened research event, and audit rows'
);

select ok(
  pg_temp.result('open_replay', '{outcome}') = 'opened'
    and pg_temp.result('open_replay', '{participant_count}') = '3'
    and (select count(*) from public.exploration_session_groups where session_id = pg_temp.result('create', '{session_id}')::uuid) = 2,
  'replaying open returns the existing snapshot without duplicating it'
);

select is(
  pg_temp.result('open_second', '{error_code}') || ':' || pg_temp.result('open_second', '{error_details,runningSessionId}'),
  'SESSION_ALREADY_RUNNING:' || pg_temp.result('create', '{session_id}'),
  'a second session cannot open while one is running'
);

select is(
  pg_temp.result('move_blocked', '{error_code}'),
  'GROUP_IN_ACTIVE_SESSION',
  'students in a running session cannot be moved'
);

select is(
  pg_temp.result('delete_blocked', '{error_code}'),
  'GROUP_IN_ACTIVE_SESSION',
  'groups in a running session cannot be deleted or archived'
);

select is(
  pg_temp.result('move_free', '{outcome}'),
  'moved',
  'students outside the session can still join groups outside the session'
);

-- A later membership change bypassing the RPCs still leaves the snapshot intact.
update public.group_members
set status = 'left', left_at = now()
where group_id = pg_temp.group_named('Leaf') and user_id = '00000000-0000-0000-0000-000000006304';

select pg_temp.act_as('00000000-0000-0000-0000-000000006301');
set local role authenticated;
insert into p6c_results
select 'setup_after', public.get_session_setup(pg_temp.result('create', '{session_id}')::uuid);
reset role;

select is(
  (
    select string_agg(participant.value ->> 'displayName' || ':' || (participant.value ->> 'roleAtStart'), ',' order by participant.ordinality)
    from jsonb_array_elements((select row -> 'queue' -> 1 -> 'participants' from p6c_results where label = 'setup_after')) with ordinality as participant
  ),
  'Ada Leader:leader,Bo Member:member',
  'the opened roster is unchanged after a later group change'
);

select is(
  array[
    jsonb_array_length((select row -> 'items' from p6c_results where label = 'teacher_list')),
    (
      select count(*)::integer
      from jsonb_array_elements((select row -> 'items' from p6c_results where label = 'teacher_list')) as item
      where item.value ->> 'status' = 'open' and item.value ->> 'participantCount' = '3'
    )
  ],
  array[2, 1],
  'teachers list scheduled and open sessions with participant counts'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000006306');
set local role authenticated;
insert into p6c_results
select 'unassigned_list', public.list_class_sessions('20000000-0000-0000-0000-000000006301');
select throws_ok(
  format($$select public.get_session_setup(%L)$$, pg_temp.result('create', '{session_id}')),
  '42501',
  'FORBIDDEN',
  'students cannot read teacher session setup'
);
reset role;

select ok(
  pg_temp.result('unassigned_list', '{viewerRole}') = 'student'
    and not exists (
      select 1
      from jsonb_array_elements((select row -> 'items' from p6c_results where label = 'unassigned_list')) as item
      where (item.value ->> 'viewerIsParticipant')::boolean
    ),
  'students outside the snapshot see sessions but are not participants'
);

select * from finish();
rollback;
