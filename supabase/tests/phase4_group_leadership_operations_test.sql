begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(29);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000004501', 'p4-04.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004502', 'p4-04.leader@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004503', 'p4-04.m1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004504', 'p4-04.m2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004505', 'p4-04.classmate@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004506', 'p4-04.outsider@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004507', 'p4-04.teacher.b@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004507');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000004501', 'P4-04 School', '00000000-0000-0000-0000-000000004501'),
  ('10000000-0000-0000-0000-000000004502', 'P4-04 Other School', '00000000-0000-0000-0000-000000004507');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004501', 'teacher'),
  ('10000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004502', 'student'),
  ('10000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004503', 'student'),
  ('10000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004504', 'student'),
  ('10000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004505', 'student'),
  ('10000000-0000-0000-0000-000000004502', '00000000-0000-0000-0000-000000004507', 'teacher'),
  ('10000000-0000-0000-0000-000000004502', '00000000-0000-0000-0000-000000004506', 'student');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000004501', '10000000-0000-0000-0000-000000004501', 'P4-04 Class', 2, 4, 3, true, 'open', '00000000-0000-0000-0000-000000004501'),
  ('20000000-0000-0000-0000-000000004502', '10000000-0000-0000-0000-000000004502', 'P4-04 Other Class', 2, 4, 3, true, 'open', '00000000-0000-0000-0000-000000004507');

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004501', 'teacher'),
  ('20000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004502', 'student'),
  ('20000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004503', 'student'),
  ('20000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004504', 'student'),
  ('20000000-0000-0000-0000-000000004501', '00000000-0000-0000-0000-000000004505', 'student'),
  ('20000000-0000-0000-0000-000000004502', '00000000-0000-0000-0000-000000004507', 'teacher'),
  ('20000000-0000-0000-0000-000000004502', '00000000-0000-0000-0000-000000004506', 'student');

create temporary table p4_04_results (label text primary key, row jsonb not null);
grant all on table p4_04_results to authenticated, anon;

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

create function pg_temp.result(label_value text, key text)
returns text
language sql
as $$
  select row ->> key from p4_04_results where label = label_value;
$$;

create function pg_temp.group_id()
returns uuid
language sql
as $$
  select (row ->> 'group_id')::uuid from p4_04_results where label = 'group';
$$;

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname in ('mark_group_ready', 'transfer_group_leadership', 'remove_group_member')
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  3::bigint,
  'leadership RPCs are security definer with empty search paths'
);

select ok(
  (
    select bool_and(
      has_function_privilege('authenticated', signature, 'EXECUTE')
      and not has_function_privilege('anon', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.mark_group_ready(uuid)',
      'public.transfer_group_leadership(uuid,uuid)',
      'public.remove_group_member(uuid,uuid)'
    ]) as signature
  ),
  'leadership RPCs are executable by authenticated users only'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004502');
set local role authenticated;
insert into p4_04_results
select 'group', to_jsonb(created)
from public.create_student_group('20000000-0000-0000-0000-000000004501', 'Lead Team', null) as created;
insert into p4_04_results
select 'ready_alone', to_jsonb(ready)
from public.mark_group_ready(pg_temp.group_id()) as ready;
reset role;

select is(
  pg_temp.result('ready_alone', 'error_code'),
  'INVALID_STATUS_TRANSITION',
  'a group below minimum size cannot be marked ready'
);

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values
  ('20000000-0000-0000-0000-000000004501', pg_temp.group_id(), '00000000-0000-0000-0000-000000004503', 'member', '00000000-0000-0000-0000-000000004502'),
  ('20000000-0000-0000-0000-000000004501', pg_temp.group_id(), '00000000-0000-0000-0000-000000004504', 'member', '00000000-0000-0000-0000-000000004502');

-- Readiness.
select pg_temp.act_as('00000000-0000-0000-0000-000000004503');
set local role authenticated;
select throws_ok(
  format($$select * from public.mark_group_ready(%L)$$, pg_temp.group_id()),
  '42501',
  'NOT_GROUP_LEADER',
  'members cannot mark the group ready'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004502');
set local role authenticated;
insert into p4_04_results
select 'ready', to_jsonb(ready)
from public.mark_group_ready(pg_temp.group_id()) as ready;
insert into p4_04_results
select 'ready_again', to_jsonb(ready)
from public.mark_group_ready(pg_temp.group_id()) as ready;
reset role;

select is(
  array[pg_temp.result('ready', 'outcome'), (select status from public.groups where id = pg_temp.group_id())],
  array['ready', 'ready'],
  'leader marks a group at minimum size ready'
);

select is(
  (
    select count(*)
    from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000004501'
      and type = 'group_approval_requested'
      and group_id = pg_temp.group_id()
  ),
  1::bigint,
  'class teachers receive exactly one approval request'
);

select is(pg_temp.result('ready_again', 'outcome'), 'ready', 'marking ready is idempotent');

select pg_temp.act_as('00000000-0000-0000-0000-000000004501');
set local role authenticated;
select throws_ok(
  format($$select * from public.mark_group_ready(%L)$$, pg_temp.group_id()),
  '42501',
  'NOT_GROUP_LEADER',
  'teachers approve groups rather than marking them ready'
);
reset role;

-- Transfer.
select pg_temp.act_as('00000000-0000-0000-0000-000000004503');
set local role authenticated;
select throws_ok(
  format($$select * from public.transfer_group_leadership(%L, '00000000-0000-0000-0000-000000004504')$$, pg_temp.group_id()),
  '42501',
  'NOT_GROUP_LEADER',
  'members cannot transfer leadership'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004502');
set local role authenticated;
insert into p4_04_results
select 'transfer_non_member', to_jsonb(transferred)
from public.transfer_group_leadership(pg_temp.group_id(), '00000000-0000-0000-0000-000000004505') as transferred;
insert into p4_04_results
select 'transfer', to_jsonb(transferred)
from public.transfer_group_leadership(pg_temp.group_id(), '00000000-0000-0000-0000-000000004503') as transferred;
reset role;

select is(
  pg_temp.result('transfer_non_member', 'error_code'),
  'INVALID_STATUS_TRANSITION',
  'leadership can move only to an active member of the group'
);

select is(
  (
    select array_agg(user_id::text || ':' || role order by user_id)
    from public.group_members
    where group_id = pg_temp.group_id()
      and status = 'active'
  ),
  array[
    '00000000-0000-0000-0000-000000004502:member',
    '00000000-0000-0000-0000-000000004503:leader',
    '00000000-0000-0000-0000-000000004504:member'
  ],
  'transfer demotes the old leader and promotes the chosen member'
);

select lives_ok(
  $$set constraints all immediate$$,
  'the deferred one-active-leader constraint holds after transfer'
);
set constraints all deferred;

select is(
  (
    select count(*)
    from public.group_membership_history
    where group_id = pg_temp.group_id()
      and event_type in ('leadership_transferred', 'became_leader')
      and actor_id = '00000000-0000-0000-0000-000000004502'
  ),
  2::bigint,
  'transfer appends leadership history for both students'
);

select is(
  array[
    (select count(*) from public.notifications where recipient_id = '00000000-0000-0000-0000-000000004503' and type = 'leadership_assigned'),
    (select count(*) from public.notifications where type = 'leadership_transferred' and group_id = pg_temp.group_id())
  ],
  array[1, 2]::bigint[],
  'the new leader is assigned and the other members are told leadership changed'
);

select is(
  (
    select count(*)
    from public.research_events
    where event_name = 'group_leader_changed'
      and group_id = pg_temp.group_id()
      and payload = '{"reason_category": "leader_transfer"}'::jsonb
  ),
  1::bigint,
  'transfer writes a group_leader_changed research event'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004502');
set local role authenticated;
select throws_ok(
  format($$select * from public.transfer_group_leadership(%L, '00000000-0000-0000-0000-000000004504')$$, pg_temp.group_id()),
  '42501',
  'NOT_GROUP_LEADER',
  'a former leader''s stale transfer is refused'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004503');
set local role authenticated;
insert into p4_04_results
select 'transfer_self', to_jsonb(transferred)
from public.transfer_group_leadership(pg_temp.group_id(), '00000000-0000-0000-0000-000000004503') as transferred;
reset role;

select is(
  array[
    pg_temp.result('transfer_self', 'outcome'),
    (select count(*)::text from public.group_membership_history where group_id = pg_temp.group_id() and event_type = 'became_leader')
  ],
  array['transferred', '2'],
  'transferring to the current leader is an idempotent no-op'
);

update public.groups set status = 'locked', locked_at = now() where id = pg_temp.group_id();

select pg_temp.act_as('00000000-0000-0000-0000-000000004503');
set local role authenticated;
insert into p4_04_results
select 'transfer_locked', to_jsonb(transferred)
from public.transfer_group_leadership(pg_temp.group_id(), '00000000-0000-0000-0000-000000004502') as transferred;
insert into p4_04_results
select 'remove_locked', to_jsonb(removed)
from public.remove_group_member(pg_temp.group_id(), '00000000-0000-0000-0000-000000004504') as removed;
reset role;

select is(
  array[pg_temp.result('transfer_locked', 'error_code'), pg_temp.result('remove_locked', 'error_code')],
  array['GROUP_LOCKED', 'GROUP_LOCKED'],
  'a locked group blocks transfer and removal'
);

update public.groups set status = 'ready' where id = pg_temp.group_id();

-- Removal.
select pg_temp.act_as('00000000-0000-0000-0000-000000004504');
set local role authenticated;
select throws_ok(
  format($$select * from public.remove_group_member(%L, '00000000-0000-0000-0000-000000004502')$$, pg_temp.group_id()),
  '42501',
  'NOT_GROUP_LEADER',
  'members cannot remove other members'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004503');
set local role authenticated;
insert into p4_04_results
select 'remove_self', to_jsonb(removed)
from public.remove_group_member(pg_temp.group_id(), '00000000-0000-0000-0000-000000004503') as removed;
insert into p4_04_results
select 'remove_m2', to_jsonb(removed)
from public.remove_group_member(pg_temp.group_id(), '00000000-0000-0000-0000-000000004504') as removed;
insert into p4_04_results
select 'remove_old_leader', to_jsonb(removed)
from public.remove_group_member(pg_temp.group_id(), '00000000-0000-0000-0000-000000004502') as removed;
insert into p4_04_results
select 'remove_again', to_jsonb(removed)
from public.remove_group_member(pg_temp.group_id(), '00000000-0000-0000-0000-000000004502') as removed;
reset role;

select is(
  pg_temp.result('remove_self', 'error_code'),
  'LEADER_SUCCESSOR_REQUIRED',
  'a leader must transfer leadership before leaving'
);

select is(
  array[pg_temp.result('remove_m2', 'outcome'), pg_temp.result('remove_m2', 'member_count'), pg_temp.result('remove_m2', 'status')],
  array['removed', '2', 'ready'],
  'removing a member at minimum size keeps the group ready'
);

select is(
  array[pg_temp.result('remove_old_leader', 'member_count'), (select status from public.groups where id = pg_temp.group_id())],
  array['1', 'forming'],
  'a ready group that drops below minimum returns to forming'
);

select is(
  (
    select count(*)
    from public.group_membership_history
    where group_id = pg_temp.group_id()
      and event_type = 'removed'
  ),
  2::bigint,
  'each removal appends one history row'
);

select is(pg_temp.result('remove_again', 'outcome'), 'removed', 'removal is idempotent');

select pg_temp.act_as('00000000-0000-0000-0000-000000004503');
set local role authenticated;
select throws_ok(
  format($$select * from public.remove_group_member(%L, '00000000-0000-0000-0000-000000004505')$$, pg_temp.group_id()),
  '42501',
  'FORBIDDEN',
  'a classmate who never joined cannot be removed'
);
reset role;

-- Formation closed and authorization.
update public.group_members
set status = 'active', left_at = null
where group_id = pg_temp.group_id()
  and user_id = '00000000-0000-0000-0000-000000004504';

update public.classes
set group_formation_status = 'closed'
where id = '20000000-0000-0000-0000-000000004501';

select pg_temp.act_as('00000000-0000-0000-0000-000000004503');
set local role authenticated;
insert into p4_04_results
select 'ready_closed', to_jsonb(ready)
from public.mark_group_ready(pg_temp.group_id()) as ready;
reset role;

select is(
  pg_temp.result('ready_closed', 'error_code'),
  'GROUP_FORMATION_CLOSED',
  'readiness requires open formation'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004506');
set local role authenticated;
select throws_ok(
  format($$select * from public.transfer_group_leadership(%L, '00000000-0000-0000-0000-000000004504')$$, pg_temp.group_id()),
  '42501',
  'FORBIDDEN',
  'a student of another class cannot transfer leadership'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004501');
set local role authenticated;
insert into p4_04_results
select 'teacher_transfer', to_jsonb(transferred)
from public.transfer_group_leadership(pg_temp.group_id(), '00000000-0000-0000-0000-000000004504') as transferred;
reset role;

select is(
  array[
    pg_temp.result('teacher_transfer', 'outcome'),
    (
      select count(*)::text
      from public.research_events
      where event_name = 'group_leader_changed'
        and group_id = pg_temp.group_id()
        and payload ->> 'reason_category' = 'teacher_change'
    )
  ],
  array['transferred', '1'],
  'a class teacher may change the leader, recorded as a teacher change'
);

select ok(
  exists (
    select 1
    from realtime.messages as message
    where message.topic = 'class:20000000-0000-0000-0000-000000004501:groups'
      and message.event = 'group.leader_changed'
  ),
  'leadership changes emit group.leader_changed signals'
);

set local role anon;
select throws_ok(
  format($$select * from public.mark_group_ready(%L)$$, pg_temp.group_id()),
  '42501',
  'permission denied for function mark_group_ready',
  'anonymous callers cannot mark groups ready'
);
reset role;

select * from finish();
rollback;
