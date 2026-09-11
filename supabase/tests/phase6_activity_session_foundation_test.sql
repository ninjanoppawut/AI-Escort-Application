begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(29);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000006101', 'p6.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006102', 'p6.outsider@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006103', 'p6.leader@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006104', 'p6.member@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000006105', 'p6.unassigned@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006102');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000006101', 'P6 School', '00000000-0000-0000-0000-000000006101'),
  ('10000000-0000-0000-0000-000000006102', 'P6 Other School', '00000000-0000-0000-0000-000000006102');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006101', 'teacher'),
  ('10000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006103', 'student'),
  ('10000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006104', 'student'),
  ('10000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006105', 'student'),
  ('10000000-0000-0000-0000-000000006102', '00000000-0000-0000-0000-000000006102', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000006101', '10000000-0000-0000-0000-000000006101', 'P6 Class', 1, 4, 3, true, 'open', '00000000-0000-0000-0000-000000006101'),
  ('20000000-0000-0000-0000-000000006102', '10000000-0000-0000-0000-000000006102', 'P6 Other Class', 1, 4, 3, true, 'open', '00000000-0000-0000-0000-000000006102');

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006101', 'teacher'),
  ('20000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006103', 'student'),
  ('20000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006104', 'student'),
  ('20000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006105', 'student'),
  ('20000000-0000-0000-0000-000000006102', '00000000-0000-0000-0000-000000006102', 'teacher');

create temporary table p6_results (label text primary key, row jsonb not null);
grant all on table p6_results to authenticated, anon;

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

create function pg_temp.group_id()
returns uuid
language sql
as $$
  select (row ->> 'group_id')::uuid from p6_results where label = 'group';
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000006103');
set local role authenticated;
insert into p6_results
select 'group', to_jsonb(created)
from public.create_student_group('20000000-0000-0000-0000-000000006101', 'Snapshot Team', null) as created;
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000006101', pg_temp.group_id(), '00000000-0000-0000-0000-000000006104', 'member', '00000000-0000-0000-0000-000000006103');

-- Activity fixtures: A1 with a published version and a later draft; D1 draft only.
insert into public.activities (id, class_id, title, status, created_by)
values
  ('60000000-0000-0000-0000-000000006101', '20000000-0000-0000-0000-000000006101', 'Garden survey', 'published', '00000000-0000-0000-0000-000000006101'),
  ('60000000-0000-0000-0000-000000006102', '20000000-0000-0000-0000-000000006101', 'Draft survey', 'draft', '00000000-0000-0000-0000-000000006101');

insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values
  ('61000000-0000-0000-0000-000000006101', '60000000-0000-0000-0000-000000006101', '20000000-0000-0000-0000-000000006101', 1, 'Garden survey', '00000000-0000-0000-0000-000000006101'),
  ('61000000-0000-0000-0000-000000006103', '60000000-0000-0000-0000-000000006102', '20000000-0000-0000-0000-000000006101', 1, 'Draft survey', '00000000-0000-0000-0000-000000006101');

insert into public.activity_boundaries (activity_version_id, boundary)
values
  ('61000000-0000-0000-0000-000000006101', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326)),
  ('61000000-0000-0000-0000-000000006103', st_geomfromtext('POLYGON((100.60 13.75, 100.61 13.75, 100.61 13.76, 100.60 13.76, 100.60 13.75))', 4326));
insert into public.activity_routes (activity_version_id, route)
values ('61000000-0000-0000-0000-000000006101', st_geomfromtext('LINESTRING(100.501 13.751, 100.509 13.759)', 4326));
insert into public.activity_checkpoints (activity_version_id, sequence_number, title, location)
values ('61000000-0000-0000-0000-000000006101', 1, 'Start', st_geomfromtext('POINT(100.501 13.751)', 4326));
insert into public.activity_plugin_configs (activity_version_id, schema_version)
values ('61000000-0000-0000-0000-000000006101', 1);

update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000006101'
where id = '61000000-0000-0000-0000-000000006101';

insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000006102', '60000000-0000-0000-0000-000000006101', '20000000-0000-0000-0000-000000006101', 2, 'Garden survey v2', '00000000-0000-0000-0000-000000006101');

-- Schema posture.
select is(
  (select extnamespace::regnamespace::text from pg_extension where extname = 'postgis'),
  'extensions',
  'PostGIS is installed in the extensions schema'
);

select is(
  (
    select count(*)
    from pg_class as table_row
    join pg_namespace as namespace on namespace.oid = table_row.relnamespace
    where namespace.nspname = 'public'
      and table_row.relrowsecurity
      and table_row.relname in (
        'activities', 'activity_versions', 'activity_boundaries', 'activity_routes',
        'activity_checkpoints', 'activity_plugin_configs', 'exploration_sessions',
        'exploration_session_groups', 'session_participants', 'session_events'
      )
  ),
  10::bigint,
  'RLS is enabled on every activity and session table'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'activities', 'activity_versions', 'activity_boundaries', 'activity_routes',
        'activity_checkpoints', 'activity_plugin_configs', 'exploration_sessions',
        'exploration_session_groups', 'session_participants', 'session_events'
      )
      and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type <> 'SELECT'))
  ),
  'browsers can only read activity and session tables; writes go through trusted RPCs'
);

-- Geometry validation.
select throws_ok(
  $$update public.activity_boundaries
    set boundary = st_geomfromtext('POLYGON((100.60 13.75, 100.61 13.76, 100.61 13.75, 100.60 13.76, 100.60 13.75))', 4326)
    where activity_version_id = '61000000-0000-0000-0000-000000006103'$$,
  '23514',
  null,
  'self-intersecting boundaries are rejected'
);

select throws_ok(
  $$insert into public.activity_routes (activity_version_id, route)
    values ('61000000-0000-0000-0000-000000006103', st_geomfromtext('LINESTRING(100.60 13.75, 100.60 13.75)', 4326))$$,
  '23514',
  null,
  'degenerate routes are rejected'
);

select throws_like(
  $$insert into public.activity_checkpoints (activity_version_id, sequence_number, title, location)
    values ('61000000-0000-0000-0000-000000006103', 1, 'No SRID', st_geomfromtext('POINT(100.60 13.75)'))$$,
  '%SRID%',
  'geometry without SRID 4326 is rejected'
);

-- Published versions are immutable.
select throws_ok(
  $$update public.activity_versions set title = 'Changed' where id = '61000000-0000-0000-0000-000000006101'$$,
  '55000',
  'INVALID_STATUS_TRANSITION',
  'published version content cannot change'
);

select throws_ok(
  $$update public.activity_boundaries
    set boundary = st_geomfromtext('POLYGON((100.50 13.75, 100.52 13.75, 100.52 13.77, 100.50 13.77, 100.50 13.75))', 4326)
    where activity_version_id = '61000000-0000-0000-0000-000000006101'$$,
  '55000',
  'INVALID_STATUS_TRANSITION',
  'published geometry cannot change'
);

select throws_ok(
  $$insert into public.activity_checkpoints (activity_version_id, sequence_number, title, location)
    values ('61000000-0000-0000-0000-000000006101', 2, 'Late', st_geomfromtext('POINT(100.505 13.755)', 4326))$$,
  '55000',
  'INVALID_STATUS_TRANSITION',
  'checkpoints cannot be added to a published version'
);

select throws_ok(
  $$delete from public.activity_versions where id = '61000000-0000-0000-0000-000000006101'$$,
  '55000',
  'INVALID_STATUS_TRANSITION',
  'published versions cannot be deleted'
);

select throws_ok(
  $$update public.activity_versions
    set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000006101'
    where id = '61000000-0000-0000-0000-000000006102'$$,
  '23505',
  null,
  'an activity has at most one published version'
);

select lives_ok(
  $$update public.activity_versions set status = 'superseded' where id = '61000000-0000-0000-0000-000000006101';
    update public.activity_versions
    set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000006101'
    where id = '61000000-0000-0000-0000-000000006102'$$,
  'publishing a new version supersedes the previous one'
);

-- Activity RLS.
select pg_temp.act_as('00000000-0000-0000-0000-000000006101');
set local role authenticated;
select is(
  array[
    (select count(*) from public.activities),
    (select count(*) from public.activity_versions),
    (select count(*) from public.activity_boundaries)
  ],
  array[2, 3, 2]::bigint[],
  'class teachers read drafts and published activity content'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000006105');
set local role authenticated;
select is(
  array[
    (select count(*) from public.activities),
    (select count(*) from public.activity_versions),
    (select count(*) from public.activity_boundaries),
    (select count(*) from public.activity_checkpoints)
  ],
  array[1, 2, 1, 1]::bigint[],
  'students read published and superseded versions but never drafts'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000006102');
set local role authenticated;
select is(
  array[
    (select count(*) from public.activities),
    (select count(*) from public.activity_boundaries)
  ],
  array[0, 0]::bigint[],
  'teachers of other classes read no activity content'
);
reset role;

-- Sessions and snapshots.
select throws_ok(
  $$insert into public.exploration_sessions (class_id, activity_id, activity_version_id, title, created_by)
    values ('20000000-0000-0000-0000-000000006101', '60000000-0000-0000-0000-000000006102',
      '61000000-0000-0000-0000-000000006102', 'Mismatched', '00000000-0000-0000-0000-000000006101')$$,
  '23503',
  null,
  'a session version must belong to the session activity'
);

insert into public.exploration_sessions (
  id, class_id, activity_id, activity_version_id, title, status, opened_by, opened_at, created_by
)
values (
  '62000000-0000-0000-0000-000000006101', '20000000-0000-0000-0000-000000006101',
  '60000000-0000-0000-0000-000000006101', '61000000-0000-0000-0000-000000006102',
  'Morning round', 'open', '00000000-0000-0000-0000-000000006101', now(),
  '00000000-0000-0000-0000-000000006101'
);

insert into public.exploration_session_groups (id, session_id, class_id, group_id, queue_position)
values (
  '63000000-0000-0000-0000-000000006101', '62000000-0000-0000-0000-000000006101',
  '20000000-0000-0000-0000-000000006101', pg_temp.group_id(), 1
);

insert into public.session_participants (session_id, class_id, session_group_id, user_id, role_at_start)
values
  ('62000000-0000-0000-0000-000000006101', '20000000-0000-0000-0000-000000006101', '63000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006103', 'leader'),
  ('62000000-0000-0000-0000-000000006101', '20000000-0000-0000-0000-000000006101', '63000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006104', 'member');

insert into public.session_events (session_id, class_id, actor_id, event_type, from_status, to_status)
values ('62000000-0000-0000-0000-000000006101', '20000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006101', 'session_opened', 'scheduled', 'open');

select ok(
  private.group_has_session_history(pg_temp.group_id())
    and private.group_in_active_session(pg_temp.group_id()),
  'a snapshotted group has session history and is in an active session'
);

select throws_ok(
  $$insert into public.exploration_sessions (
      class_id, activity_id, activity_version_id, title, status, opened_by, opened_at, created_by
    )
    values ('20000000-0000-0000-0000-000000006101', '60000000-0000-0000-0000-000000006101',
      '61000000-0000-0000-0000-000000006102', 'Second round', 'open',
      '00000000-0000-0000-0000-000000006101', now(), '00000000-0000-0000-0000-000000006101')$$,
  '23505',
  null,
  'a class has at most one open or paused session'
);

select throws_ok(
  $$update public.session_participants set role_at_start = 'member'
    where user_id = '00000000-0000-0000-0000-000000006103'$$,
  '55000',
  'INVALID_STATUS_TRANSITION',
  'participant leadership snapshots are immutable'
);

select throws_ok(
  $$update public.exploration_session_groups set queue_position = 2
    where id = '63000000-0000-0000-0000-000000006101'$$,
  '55000',
  'INVALID_STATUS_TRANSITION',
  'session group identity and queue position are immutable'
);

select lives_ok(
  $$update public.session_participants set participation_status = 'left', left_at = now()
    where user_id = '00000000-0000-0000-0000-000000006104'$$,
  'participation status may change without touching the snapshot'
);

select throws_ok(
  $$delete from public.session_participants where user_id = '00000000-0000-0000-0000-000000006103'$$,
  '55000',
  'INVALID_STATUS_TRANSITION',
  'snapshot rows cannot be deleted'
);

select throws_ok(
  $$update public.session_events set to_status = 'paused'$$,
  '55000',
  'INVALID_STATUS_TRANSITION',
  'session events are append-only'
);

select throws_ok(
  $$update public.exploration_sessions set activity_version_id = '61000000-0000-0000-0000-000000006101'
    where id = '62000000-0000-0000-0000-000000006101'$$,
  '55000',
  'INVALID_STATUS_TRANSITION',
  'an opened session keeps its activity version'
);

-- Session RLS.
select pg_temp.act_as('00000000-0000-0000-0000-000000006103');
set local role authenticated;
select is(
  array[
    (select count(*) from public.exploration_sessions),
    (select count(*) from public.exploration_session_groups),
    (select count(*) from public.session_participants),
    (select count(*) from public.session_events)
  ],
  array[1, 1, 2, 0]::bigint[],
  'participants read their session roster but not session events'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000006105');
set local role authenticated;
select is(
  array[
    (select count(*) from public.exploration_sessions),
    (select count(*) from public.session_participants)
  ],
  array[1, 0]::bigint[],
  'non-participant classmates see the session but not its participants'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000006101');
set local role authenticated;
select is(
  array[
    (select count(*) from public.session_participants),
    (select count(*) from public.session_events)
  ],
  array[2, 1]::bigint[],
  'class teachers read participants and session events'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000006102');
set local role authenticated;
select is(
  (select count(*) from public.exploration_sessions),
  0::bigint,
  'teachers of other classes read no sessions'
);
reset role;

-- Later group changes never rewrite the snapshot.
update public.group_members
set status = 'left', left_at = now()
where group_id = pg_temp.group_id() and user_id = '00000000-0000-0000-0000-000000006103';
update public.group_members
set role = 'leader'
where group_id = pg_temp.group_id() and user_id = '00000000-0000-0000-0000-000000006104';

select is(
  (
    select string_agg(user_id::text || ':' || role_at_start, ',' order by user_id)
    from public.session_participants
    where session_id = '62000000-0000-0000-0000-000000006101'
  ),
  '00000000-0000-0000-0000-000000006103:leader,00000000-0000-0000-0000-000000006104:member',
  'current membership and leadership changes leave the session snapshot unchanged'
);

update public.exploration_sessions
set status = 'completed', completed_at = now(), completed_by = '00000000-0000-0000-0000-000000006101'
where id = '62000000-0000-0000-0000-000000006101';

select ok(
  private.group_has_session_history(pg_temp.group_id())
    and not private.group_in_active_session(pg_temp.group_id()),
  'completing a session keeps history and releases the active-session restriction'
);

select * from finish();
rollback;
