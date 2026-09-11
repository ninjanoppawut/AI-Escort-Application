begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(23);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000007101', 'p7.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007102', 'p7.outsider@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007103', 'p7.leader.one@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007104', 'p7.member.one@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007105', 'p7.leader.two@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000007101', '00000000-0000-0000-0000-000000007102');

update public.profiles as profile
set display_name = names.display_name
from (
  values
    ('00000000-0000-0000-0000-000000007103'::uuid, 'Ada Leader'),
    ('00000000-0000-0000-0000-000000007104'::uuid, 'Bo Member'),
    ('00000000-0000-0000-0000-000000007105'::uuid, 'Cy Leader')
) as names(id, display_name)
where profile.id = names.id;

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000007101', 'P7 School', '00000000-0000-0000-0000-000000007101'),
  ('10000000-0000-0000-0000-000000007102', 'P7 Other School', '00000000-0000-0000-0000-000000007102');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000007101', user_id,
  case when user_id = '00000000-0000-0000-0000-000000007101'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000007101', '00000000-0000-0000-0000-000000007103',
  '00000000-0000-0000-0000-000000007104', '00000000-0000-0000-0000-000000007105'
]::uuid[]) as user_id;
insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000007102', '00000000-0000-0000-0000-000000007102', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000007101', '10000000-0000-0000-0000-000000007101', 'P7 Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000007101'),
  ('20000000-0000-0000-0000-000000007102', '10000000-0000-0000-0000-000000007102', 'P7 Other Class', 1, 4, 5, true, 'open', '00000000-0000-0000-0000-000000007102');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000007101', user_id,
  case when user_id = '00000000-0000-0000-0000-000000007101'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000007101', '00000000-0000-0000-0000-000000007103',
  '00000000-0000-0000-0000-000000007104', '00000000-0000-0000-0000-000000007105'
]::uuid[]) as user_id;
insert into public.class_members (class_id, user_id, role)
values ('20000000-0000-0000-0000-000000007102', '00000000-0000-0000-0000-000000007102', 'teacher');

create temporary table p7_results (label text primary key, row jsonb not null);
grant all on table p7_results to authenticated, anon;

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
  execute format('insert into p7_results select %L, to_jsonb(r) from (%s) as r', label_value, statement);
end;
$$;

create function pg_temp.result(label_value text, path text[])
returns text
language sql
as $$
  select row #>> path from p7_results where label = label_value;
$$;

create function pg_temp.group_named(group_name text)
returns uuid
language sql
as $$
  select id from public.groups
  where class_id = '20000000-0000-0000-0000-000000007101' and name = group_name;
$$;

create function pg_temp.session_id()
returns uuid
language sql
as $$
  select (row ->> 'session_id')::uuid from p7_results where label = 'session';
$$;

-- Groups: Leaf (Ada leader, Bo member) and Root (Cy leader).
select pg_temp.act_as('00000000-0000-0000-0000-000000007103');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000007101', 'Leaf', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000007101', pg_temp.group_named('Leaf'), '00000000-0000-0000-0000-000000007104', 'member', '00000000-0000-0000-0000-000000007103');

select pg_temp.act_as('00000000-0000-0000-0000-000000007105');
set local role authenticated;
select * from public.create_student_group('20000000-0000-0000-0000-000000007101', 'Root', null);
reset role;

insert into public.activities (id, class_id, title, status, created_by)
values ('60000000-0000-0000-0000-000000007101', '20000000-0000-0000-0000-000000007101', 'Garden survey', 'published', '00000000-0000-0000-0000-000000007101');
insert into public.activity_versions (id, activity_id, class_id, version_number, title, created_by)
values ('61000000-0000-0000-0000-000000007101', '60000000-0000-0000-0000-000000007101', '20000000-0000-0000-0000-000000007101', 1, 'Garden survey', '00000000-0000-0000-0000-000000007101');
insert into public.activity_boundaries (activity_version_id, boundary)
values ('61000000-0000-0000-0000-000000007101', st_geomfromtext('POLYGON((100.50 13.75, 100.51 13.75, 100.51 13.76, 100.50 13.76, 100.50 13.75))', 4326));
insert into public.activity_routes (activity_version_id, route)
values ('61000000-0000-0000-0000-000000007101', st_geomfromtext('LINESTRING(100.501 13.751, 100.509 13.759)', 4326));
insert into public.activity_checkpoints (activity_version_id, sequence_number, title, location)
values ('61000000-0000-0000-0000-000000007101', 1, 'Start', st_geomfromtext('POINT(100.505 13.755)', 4326));
update public.activity_versions
set status = 'published', published_at = now(), published_by = '00000000-0000-0000-0000-000000007101'
where id = '61000000-0000-0000-0000-000000007101';

select is(
  (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'exploration_session_groups_one_active_per_session'
  ),
  1::bigint,
  'a partial unique index allows at most one active group per session'
);

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname in (
        'activate_session_group', 'pause_exploration_session', 'resume_exploration_session',
        'complete_session_group', 'complete_exploration_session', 'get_session_live',
        'get_session_participant_view'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  7::bigint,
  'session control RPCs are security definer with empty search paths'
);

select ok(
  (
    select bool_and(
      has_function_privilege('authenticated', signature, 'EXECUTE')
      and not has_function_privilege('anon', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.activate_session_group(uuid,uuid)', 'public.pause_exploration_session(uuid)',
      'public.resume_exploration_session(uuid)', 'public.complete_session_group(uuid,uuid)',
      'public.complete_exploration_session(uuid)', 'public.get_session_live(uuid)',
      'public.get_session_participant_view(uuid)'
    ]) as signature
  )
    and not has_function_privilege('authenticated', 'private.promote_next_session_group(uuid,uuid)', 'EXECUTE'),
  'session control RPCs are authenticated-only and helpers stay private'
);

-- Open a session with Leaf first in the queue.
select pg_temp.act_as('00000000-0000-0000-0000-000000007101');
set local role authenticated;
select pg_temp.call('session', $$select * from public.create_exploration_session('60000000-0000-0000-0000-000000007101', 'Morning round')$$);
select pg_temp.call('open', format(
  $$select * from public.open_exploration_session(%L, array[%L, %L]::uuid[])$$,
  pg_temp.session_id(), pg_temp.group_named('Leaf'), pg_temp.group_named('Root')
));
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000007103');
set local role authenticated;
select throws_ok(
  format($$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')),
  '42501',
  'FORBIDDEN',
  'students cannot activate a group'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000007101');
set local role authenticated;
select pg_temp.call('activate', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
select pg_temp.call('conflict', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Root')
));
select pg_temp.call('activate_replay', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000007103');
set local role authenticated;
insert into p7_results
select 'view_active', public.get_session_participant_view(pg_temp.session_id());
reset role;

select ok(
  pg_temp.result('activate', '{outcome}') = 'activated'
    and pg_temp.result('activate', '{status}') = 'active'
    and pg_temp.result('activate', '{queue_position}') = '1',
  'a class teacher activates the first queued group'
);

select is(
  array[
    (select count(*) from public.notifications where session_id = pg_temp.session_id() and type = 'session_group_active'),
    (select count(*) from public.notifications where session_id = pg_temp.session_id() and type = 'session_group_next')
  ],
  array[2, 1]::bigint[],
  'the active group and the next group are notified'
);

select is(
  pg_temp.result('conflict', '{error_code}') || ':' || pg_temp.result('conflict', '{error_details,activeGroupId}'),
  'ACTIVE_GROUP_CONFLICT:' || pg_temp.group_named('Leaf')::text,
  'a second group cannot activate while one is active'
);

select is(pg_temp.result('activate_replay', '{outcome}'), 'activated', 'activation is idempotent');

select is(
  (
    select count(*)
    from public.research_events
    where session_id = pg_temp.session_id()
      and event_name = 'session_group_activated'
      and payload ->> 'queue_position' = '1'
      and payload ? 'wait_duration_s'
  ),
  1::bigint,
  'activation emits session_group_activated with queue position and wait duration'
);

select ok(
  pg_temp.result('view_active', '{myGroup,name}') = 'Leaf'
    and pg_temp.result('view_active', '{myGroup,status}') = 'active'
    and pg_temp.result('view_active', '{permissions,canPublishLocation}') = 'true'
    and pg_temp.result('view_active', '{geometry,boundary,type}') = 'Polygon',
  'an active participant may publish location and reads the activity geometry'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007101');
set local role authenticated;
select pg_temp.call('pause', format($$select * from public.pause_exploration_session(%L)$$, pg_temp.session_id()));
select pg_temp.call('activate_paused', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Root')
));
select pg_temp.call('resume', format($$select * from public.resume_exploration_session(%L)$$, pg_temp.session_id()));
select pg_temp.call('complete_leaf', format(
  $$select * from public.complete_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Leaf')
));
select pg_temp.call('activate_root', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Root')
));
insert into p7_results
select 'live', public.get_session_live(pg_temp.session_id());
select pg_temp.call('complete_session', format(
  $$select * from public.complete_exploration_session(%L)$$, pg_temp.session_id()
));
select pg_temp.call('activate_after', format(
  $$select * from public.activate_session_group(%L, %L)$$, pg_temp.session_id(), pg_temp.group_named('Root')
));
reset role;

select ok(
  pg_temp.result('pause', '{status}') = 'paused'
    and (
      select count(*) from public.session_events
      where session_id = pg_temp.session_id() and event_type = 'session_paused'
    ) = 1,
  'pausing the session records a session event'
);

select is(
  pg_temp.result('activate_paused', '{error_code}'),
  'SESSION_PAUSED',
  'groups cannot be activated while the session is paused'
);

select is(pg_temp.result('resume', '{status}'), 'open', 'resuming reopens the session');

select is(
  pg_temp.result('complete_leaf', '{outcome}') || ':' || coalesce(pg_temp.result('complete_leaf', '{next_ready_group_id}'), 'none'),
  'completed:' || (
    select session_group.id::text
    from public.exploration_session_groups as session_group
    where session_group.session_id = pg_temp.session_id()
      and session_group.group_id = pg_temp.group_named('Root')
  ),
  'completing a group promotes the next waiting group to ready'
);

select is(pg_temp.result('activate_root', '{status}'), 'active', 'the promoted group can be activated');

select is(
  (
    select string_agg(item.value ->> 'groupName' || ':' || (item.value ->> 'status'), ',' order by item.ordinality)
    from jsonb_array_elements((select row -> 'queue' from p7_results where label = 'live')) with ordinality as item
  ),
  'Leaf:completed,Root:active',
  'the teacher live model shows queue order and current statuses'
);

select ok(
  pg_temp.result('complete_session', '{outcome}') = 'completed'
    and pg_temp.result('complete_session', '{completed_groups}') = '1'
    and (
      select count(*) from public.exploration_session_groups
      where session_id = pg_temp.session_id() and status <> 'completed'
    ) = 0,
  'completing the session completes every remaining group'
);

select is(
  (select count(*) from public.notifications where session_id = pg_temp.session_id() and type = 'session_completed'),
  3::bigint,
  'every participant is told the session finished'
);

select is(
  (
    select count(*)
    from public.research_events
    where session_id = pg_temp.session_id()
      and event_name = 'session_completed'
      and payload ->> 'participant_count' = '3'
  ),
  1::bigint,
  'session completion emits session_completed with the participant count'
);

select is(
  pg_temp.result('activate_after', '{error_code}'),
  'SESSION_NOT_OPEN',
  'a completed session cannot activate groups'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007103');
set local role authenticated;
insert into p7_results
select 'view_done', public.get_session_participant_view(pg_temp.session_id());
reset role;

select ok(
  pg_temp.result('view_done', '{permissions,canPublishLocation}') = 'false'
    and pg_temp.result('view_done', '{permissions,blockedReason}') = 'session_completed',
  'a completed session stops location publishing with a stated reason'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000007102');
set local role authenticated;
select throws_ok(
  format($$select public.get_session_live(%L)$$, pg_temp.session_id()),
  '42501',
  'FORBIDDEN',
  'teachers of other classes cannot read the live session'
);
select throws_ok(
  format($$select public.get_session_participant_view(%L)$$, pg_temp.session_id()),
  '42501',
  'FORBIDDEN',
  'non-participants cannot read the participant view'
);
reset role;

select * from finish();
rollback;
