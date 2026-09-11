begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(25);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000005101', 'p5.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005102', 'p5.teacher.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005103', 'p5.s1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005104', 'p5.s2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005105', 'p5.s3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005106', 'p5.s4@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005107', 'p5.s5@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005108', 'p5.s6@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005109', 'p5.outsider@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005102');

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000005101', 'P5 School', '00000000-0000-0000-0000-000000005101'),
  ('10000000-0000-0000-0000-000000005102', 'P5 Other School', '00000000-0000-0000-0000-000000005102');

insert into public.school_memberships (school_id, user_id, role)
select '10000000-0000-0000-0000-000000005101', user_id, case when user_id = '00000000-0000-0000-0000-000000005101'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005103',
  '00000000-0000-0000-0000-000000005104', '00000000-0000-0000-0000-000000005105',
  '00000000-0000-0000-0000-000000005106', '00000000-0000-0000-0000-000000005107',
  '00000000-0000-0000-0000-000000005108'
]::uuid[]) as user_id;

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000005102', '00000000-0000-0000-0000-000000005102', 'teacher'),
  ('10000000-0000-0000-0000-000000005102', '00000000-0000-0000-0000-000000005109', 'student');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000005101', '10000000-0000-0000-0000-000000005101', 'P5 Class', 2, 3, 2, true, 'open', '00000000-0000-0000-0000-000000005101'),
  ('20000000-0000-0000-0000-000000005102', '10000000-0000-0000-0000-000000005102', 'P5 Other Class', 2, 3, 2, true, 'open', '00000000-0000-0000-0000-000000005102');

insert into public.class_members (class_id, user_id, role)
select '20000000-0000-0000-0000-000000005101', user_id, case when user_id = '00000000-0000-0000-0000-000000005101'::uuid then 'teacher' else 'student' end
from unnest(array[
  '00000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005103',
  '00000000-0000-0000-0000-000000005104', '00000000-0000-0000-0000-000000005105',
  '00000000-0000-0000-0000-000000005106', '00000000-0000-0000-0000-000000005107',
  '00000000-0000-0000-0000-000000005108'
]::uuid[]) as user_id;

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000005102', '00000000-0000-0000-0000-000000005102', 'teacher'),
  ('20000000-0000-0000-0000-000000005102', '00000000-0000-0000-0000-000000005109', 'student');

create temporary table p5_results (label text primary key, row jsonb not null);
grant all on table p5_results to authenticated, anon;

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
  select row ->> key from p5_results where label = label_value;
$$;

create function pg_temp.leader_of(label_value text)
returns uuid
language sql
as $$
  select member.user_id
  from public.group_members as member
  where member.group_id = (select (row ->> 'group_id')::uuid from p5_results where label = label_value)
    and member.role = 'leader'
    and member.status = 'active';
$$;

create function pg_temp.members_of(label_value text)
returns bigint
language sql
as $$
  select count(*)
  from public.group_members as member
  where member.group_id = (select (row ->> 'group_id')::uuid from p5_results where label = label_value)
    and member.status = 'active';
$$;

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname in ('create_teacher_group', 'move_student_between_groups')
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  2::bigint,
  'teacher group RPCs are security definer with empty search paths'
);

select ok(
  has_function_privilege('authenticated', 'public.create_teacher_group(uuid,text,text,uuid,uuid[])', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.move_student_between_groups(uuid,uuid,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.create_teacher_group(uuid,text,text,uuid,uuid[])', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.group_in_active_session(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.require_class_teacher(uuid,boolean)', 'EXECUTE'),
  'teacher RPCs are authenticated-only and their helpers are private'
);

-- Teacher-created groups.
select pg_temp.act_as('00000000-0000-0000-0000-000000005103');
set local role authenticated;
select throws_ok(
  $$select * from public.create_teacher_group('20000000-0000-0000-0000-000000005101', 'Student Try', null, null, '{}')$$,
  '42501',
  'FORBIDDEN',
  'students cannot use teacher group creation'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000005102');
set local role authenticated;
select throws_ok(
  $$select * from public.create_teacher_group('20000000-0000-0000-0000-000000005101', 'Other Teacher', null, null, '{}')$$,
  '42501',
  'FORBIDDEN',
  'a teacher of another class cannot create groups here'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000005101');
set local role authenticated;
insert into p5_results
select 'teacher_team', to_jsonb(created)
from public.create_teacher_group(
  '20000000-0000-0000-0000-000000005101', 'Teacher Team', null,
  '00000000-0000-0000-0000-000000005103', array['00000000-0000-0000-0000-000000005104']::uuid[]
) as created;
insert into p5_results
select 'no_leader', to_jsonb(created)
from public.create_teacher_group(
  '20000000-0000-0000-0000-000000005101', 'No Leader', null,
  null, array['00000000-0000-0000-0000-000000005105']::uuid[]
) as created;
insert into p5_results
select 'already_grouped', to_jsonb(created)
from public.create_teacher_group(
  '20000000-0000-0000-0000-000000005101', 'Grouped', null,
  '00000000-0000-0000-0000-000000005103', '{}'
) as created;
insert into p5_results
select 'too_big', to_jsonb(created)
from public.create_teacher_group(
  '20000000-0000-0000-0000-000000005101', 'Too Big', null,
  '00000000-0000-0000-0000-000000005105',
  array['00000000-0000-0000-0000-000000005106', '00000000-0000-0000-0000-000000005107', '00000000-0000-0000-0000-000000005108']::uuid[]
) as created;
reset role;

select is(
  array[pg_temp.result('teacher_team', 'outcome'), pg_temp.result('teacher_team', 'member_count')],
  array['created', '2'],
  'teacher creates a group with a leader and members'
);

select ok(
  pg_temp.leader_of('teacher_team') = '00000000-0000-0000-0000-000000005103'
    and exists (
      select 1 from public.groups
      where id = pg_temp.result('teacher_team', 'group_id')::uuid and creator_type = 'teacher'
    )
    and not exists (
      select 1 from public.student_group_creation_claims
      where student_id = '00000000-0000-0000-0000-000000005103'
    ),
  'teacher-created groups set the chosen leader and use no student creation claim'
);

select is(
  array[
    (select count(*) from public.notifications where recipient_id = '00000000-0000-0000-0000-000000005103' and type = 'leadership_assigned'),
    (select count(*) from public.notifications where recipient_id = '00000000-0000-0000-0000-000000005104' and type = 'student_moved_group')
  ],
  array[1, 1]::bigint[],
  'placed students are notified'
);

select is(
  array[
    pg_temp.result('no_leader', 'error_code'),
    pg_temp.result('already_grouped', 'error_code'),
    pg_temp.result('too_big', 'error_code')
  ],
  array['LEADER_SUCCESSOR_REQUIRED', 'STUDENT_ALREADY_IN_GROUP', 'GROUP_FULL'],
  'teacher creation requires a leader for members, unassigned students, and group capacity'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000005101');
set local role authenticated;
insert into p5_results
select 'empty_team', to_jsonb(created)
from public.create_teacher_group('20000000-0000-0000-0000-000000005101', 'Empty Team', null, null, '{}') as created;
insert into p5_results
select 'over_limit', to_jsonb(created)
from public.create_teacher_group('20000000-0000-0000-0000-000000005101', 'Over Limit', null, null, '{}') as created;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000005105');
set local role authenticated;
insert into p5_results
select 'student_over_limit', to_jsonb(created)
from public.create_student_group('20000000-0000-0000-0000-000000005101', 'Student Late', null) as created;
reset role;

select is(
  array[pg_temp.result('empty_team', 'outcome'), pg_temp.result('empty_team', 'member_count')],
  array['created', '0'],
  'a teacher may create an empty group'
);

select is(
  array[pg_temp.result('over_limit', 'error_code'), pg_temp.result('student_over_limit', 'error_code')],
  array['GROUP_LIMIT_REACHED', 'GROUP_LIMIT_REACHED'],
  'the maximum group count is absolute for teachers and students'
);

select is(
  (
    select count(*)
    from public.research_events
    where event_name = 'group_created'
      and class_id = '20000000-0000-0000-0000-000000005101'
      and payload ->> 'creator_type' = 'teacher'
  ),
  2::bigint,
  'teacher creation writes group_created research events'
);

-- Moves.
select pg_temp.act_as('00000000-0000-0000-0000-000000005101');
set local role authenticated;
insert into p5_results
select 'move_s2_empty', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005104',
  pg_temp.result('empty_team', 'group_id')::uuid, null
) as moved;
reset role;

select ok(
  pg_temp.result('move_s2_empty', 'outcome') = 'moved'
    and pg_temp.leader_of('empty_team') = '00000000-0000-0000-0000-000000005104'
    and pg_temp.members_of('teacher_team') = 1,
  'moving a student into an empty group makes them its leader'
);

select is(
  (
    select array_agg(event_type order by event_type)
    from public.group_membership_history
    where user_id = '00000000-0000-0000-0000-000000005104'
      and payload ->> 'source' in ('teacher', 'teacher_move_into_empty_group')
  ),
  array['became_leader', 'moved_in', 'moved_out'],
  'a move appends moved_out, moved_in, and leadership history'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000005101');
set local role authenticated;
insert into p5_results
select 'remove_s1', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005103', null, null
) as moved;
insert into p5_results
select 'place_s3', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005105',
  pg_temp.result('teacher_team', 'group_id')::uuid, null
) as moved;
insert into p5_results
select 'place_s4', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005106',
  pg_temp.result('teacher_team', 'group_id')::uuid, null
) as moved;
reset role;

select ok(
  pg_temp.result('remove_s1', 'outcome') = 'moved'
    and pg_temp.members_of('teacher_team') = 2
    and pg_temp.leader_of('teacher_team') = '00000000-0000-0000-0000-000000005105'
    and not exists (
      select 1 from public.group_members
      where user_id = '00000000-0000-0000-0000-000000005103' and status = 'active'
    ),
  'a sole leader can return to unassigned and the emptied group accepts a new leader'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000005101');
set local role authenticated;
insert into p5_results
select 'move_leader_no_successor', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005105',
  pg_temp.result('empty_team', 'group_id')::uuid, null
) as moved;
insert into p5_results
select 'move_leader_bad_successor', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005105',
  pg_temp.result('empty_team', 'group_id')::uuid, '00000000-0000-0000-0000-000000005107'
) as moved;
insert into p5_results
select 'move_leader', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005105',
  pg_temp.result('empty_team', 'group_id')::uuid, '00000000-0000-0000-0000-000000005106'
) as moved;
reset role;

select is(
  array[pg_temp.result('move_leader_no_successor', 'error_code'), pg_temp.result('move_leader_bad_successor', 'error_code')],
  array['LEADER_SUCCESSOR_REQUIRED', 'INVALID_STATUS_TRANSITION'],
  'moving a leader out of a populated group requires a successor from that group'
);

select ok(
  pg_temp.result('move_leader', 'leader_changed') = 'true'
    and pg_temp.leader_of('teacher_team') = '00000000-0000-0000-0000-000000005106'
    and pg_temp.members_of('empty_team') = 2
    and pg_temp.leader_of('empty_team') = '00000000-0000-0000-0000-000000005104',
  'a leader move promotes the successor in the same operation'
);

select lives_ok(
  $$set constraints all immediate$$,
  'one-active-leader constraints hold after teacher moves'
);
set constraints all deferred;

select is(
  (
    select count(*)
    from (
      select user_id
      from public.group_members
      where class_id = '20000000-0000-0000-0000-000000005101' and status = 'active'
      group by user_id
      having count(*) > 1
    ) as duplicates
  ),
  0::bigint,
  'no student holds two current groups after moves'
);

select is(
  array[
    (select count(*) from public.notifications where recipient_id = '00000000-0000-0000-0000-000000005106' and type = 'leadership_assigned'),
    (select count(*) from public.notifications where recipient_id = '00000000-0000-0000-0000-000000005105' and type = 'student_moved_group')
  ],
  array[1, 2]::bigint[],
  'successor and moved student are notified'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000005101');
set local role authenticated;
insert into p5_results
select 'move_s5_in', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005107',
  pg_temp.result('empty_team', 'group_id')::uuid, null
) as moved;
insert into p5_results
select 'move_full', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005108',
  pg_temp.result('empty_team', 'group_id')::uuid, null
) as moved;
insert into p5_results
select 'move_same', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005107',
  pg_temp.result('empty_team', 'group_id')::uuid, null
) as moved;
reset role;

select is(
  array[pg_temp.result('move_s5_in', 'outcome'), pg_temp.result('move_full', 'error_code'), pg_temp.result('move_same', 'outcome')],
  array['moved', 'GROUP_FULL', 'unchanged'],
  'destination capacity is enforced and a same-group move is a no-op'
);

update public.groups
set status = 'locked', locked_at = now()
where id = pg_temp.result('teacher_team', 'group_id')::uuid;

insert into public.groups (id, class_id, name, created_by, creator_type)
values ('30000000-0000-0000-0000-000000005199', '20000000-0000-0000-0000-000000005102', 'Other Class Group', '00000000-0000-0000-0000-000000005102', 'teacher');

select pg_temp.act_as('00000000-0000-0000-0000-000000005101');
set local role authenticated;
insert into p5_results
select 'move_locked', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005108',
  pg_temp.result('teacher_team', 'group_id')::uuid, null
) as moved;
insert into p5_results
select 'move_other_class', to_jsonb(moved)
from public.move_student_between_groups(
  '20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005108',
  '30000000-0000-0000-0000-000000005199', null
) as moved;
select throws_ok(
  $$select * from public.move_student_between_groups('20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005109', null, null)$$,
  '42501',
  'FORBIDDEN',
  'students outside the class cannot be moved'
);
reset role;

select is(
  array[pg_temp.result('move_locked', 'error_code'), pg_temp.result('move_other_class', 'error_code')],
  array['GROUP_LOCKED', 'DESTINATION_GROUP_INVALID'],
  'locked groups and groups from another class are refused'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000005107');
set local role authenticated;
select throws_ok(
  $$select * from public.move_student_between_groups('20000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000005108', null, null)$$,
  '42501',
  'FORBIDDEN',
  'students cannot move classmates'
);
reset role;

select is(
  array[
    (select count(*) from public.research_events where event_name = 'student_moved_between_groups' and payload ->> 'reason_category' = 'teacher_move'),
    (select count(*) from public.research_events where event_name = 'student_moved_between_groups' and payload ->> 'reason_category' = 'teacher_remove')
  ],
  array[5, 1]::bigint[],
  'moves and removals write student_moved_between_groups research events'
);

set local role anon;
select throws_ok(
  $$select * from public.create_teacher_group('20000000-0000-0000-0000-000000005101', 'Anon', null, null, '{}')$$,
  '42501',
  'permission denied for function create_teacher_group',
  'anonymous callers cannot create teacher groups'
);
reset role;

select * from finish();
rollback;
