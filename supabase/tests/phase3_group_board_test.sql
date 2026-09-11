begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(33);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000003301', 'p3-03.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003302', 'p3-03.student.s1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003303', 'p3-03.student.s2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003304', 'p3-03.student.s3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003305', 'p3-03.student.s4@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003306', 'p3-03.outsider@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000003301';

update public.profiles as profile
set display_name = names.display_name
from (
  values
    ('00000000-0000-0000-0000-000000003301'::uuid, 'Teacher Board'),
    ('00000000-0000-0000-0000-000000003302'::uuid, 'Ada Leader'),
    ('00000000-0000-0000-0000-000000003303'::uuid, 'Bo Member'),
    ('00000000-0000-0000-0000-000000003304'::uuid, 'Cy Student'),
    ('00000000-0000-0000-0000-000000003305'::uuid, 'Di Student'),
    ('00000000-0000-0000-0000-000000003306'::uuid, 'Ex Outsider')
) as names(id, display_name)
where profile.id = names.id;

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000003301', 'P3-03 School', '00000000-0000-0000-0000-000000003301'),
  ('10000000-0000-0000-0000-000000003302', 'P3-03 Other School', '00000000-0000-0000-0000-000000003301');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003301', 'teacher'),
  ('10000000-0000-0000-0000-000000003302', '00000000-0000-0000-0000-000000003301', 'teacher'),
  ('10000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003302', 'student'),
  ('10000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003303', 'student'),
  ('10000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003304', 'student'),
  ('10000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003305', 'student'),
  ('10000000-0000-0000-0000-000000003302', '00000000-0000-0000-0000-000000003306', 'student');

insert into public.classes (
  id,
  school_id,
  name,
  min_group_size,
  max_group_size,
  maximum_groups,
  allow_student_groups,
  group_formation_status,
  created_by
)
values
  ('20000000-0000-0000-0000-000000003301', '10000000-0000-0000-0000-000000003301', 'P3-03 Class', 2, 3, 2, true, 'open', '00000000-0000-0000-0000-000000003301'),
  ('20000000-0000-0000-0000-000000003302', '10000000-0000-0000-0000-000000003302', 'P3-03 Other Class', 2, 3, 2, true, 'open', '00000000-0000-0000-0000-000000003301'),
  ('20000000-0000-0000-0000-000000003303', '10000000-0000-0000-0000-000000003301', 'P3-03 Archived Class', 2, 3, 2, true, 'open', '00000000-0000-0000-0000-000000003301');

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003301', 'teacher'),
  ('20000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003302', 'student'),
  ('20000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003303', 'student'),
  ('20000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003304', 'student'),
  ('20000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000003305', 'student'),
  ('20000000-0000-0000-0000-000000003302', '00000000-0000-0000-0000-000000003301', 'teacher'),
  ('20000000-0000-0000-0000-000000003302', '00000000-0000-0000-0000-000000003306', 'student'),
  ('20000000-0000-0000-0000-000000003303', '00000000-0000-0000-0000-000000003301', 'teacher'),
  ('20000000-0000-0000-0000-000000003303', '00000000-0000-0000-0000-000000003305', 'student');

update public.classes
set status = 'archived'
where id = '20000000-0000-0000-0000-000000003303';

create temporary table p3_03_boards (
  label text primary key,
  board jsonb not null
);
grant all on table p3_03_boards to authenticated;

create temporary table p3_03_created (
  label text primary key,
  group_id uuid
);
grant all on table p3_03_created to authenticated;

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

select has_function(
  'public',
  'get_class_group_board',
  array['uuid'],
  'get_class_group_board RPC exists'
);

select ok(
  (
    select function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
    from pg_proc as function_row
    where function_row.oid = 'public.get_class_group_board(uuid)'::regprocedure
  ),
  'get_class_group_board is security definer with an empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'public.get_class_group_board(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_class_group_board(uuid)', 'EXECUTE'),
  'only authenticated callers may execute get_class_group_board'
);

-- S1 creates a group; S2 joins it as a member through a trusted insert.
select pg_temp.act_as('00000000-0000-0000-0000-000000003302');
set local role authenticated;
insert into p3_03_created
select 's1', group_id
from public.create_student_group('20000000-0000-0000-0000-000000003301', 'Leaf Team', null);
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
select
  '20000000-0000-0000-0000-000000003301',
  group_id,
  '00000000-0000-0000-0000-000000003303',
  'member',
  '00000000-0000-0000-0000-000000003302'
from p3_03_created
where label = 's1';

select pg_temp.act_as('00000000-0000-0000-0000-000000003302');
set local role authenticated;
insert into p3_03_boards
select 's1', public.get_class_group_board('20000000-0000-0000-0000-000000003301');
reset role;

select is(
  (
    select jsonb_build_object(
      'currentGroupCount', board -> 'currentGroupCount',
      'remainingGroupSlots', board -> 'remainingGroupSlots',
      'maximumGroups', board -> 'maximumGroups',
      'minimumGroupSize', board -> 'minimumGroupSize',
      'maximumGroupSize', board -> 'maximumGroupSize',
      'formationStatus', board -> 'formationStatus'
    )
    from p3_03_boards
    where label = 's1'
  ),
  '{"currentGroupCount": 1, "remainingGroupSlots": 1, "maximumGroups": 2, "minimumGroupSize": 2, "maximumGroupSize": 3, "formationStatus": "open"}'::jsonb,
  'board returns authoritative slot counts and formation settings'
);

select is(
  (select board -> 'viewer' from p3_03_boards where label = 's1'),
  jsonb_build_object(
    'userId', '00000000-0000-0000-0000-000000003302',
    'role', 'student',
    'currentGroupId', (select group_id from p3_03_created where label = 's1'),
    'isLeader', true,
    'hasCreatedStudentGroup', true,
    'canCreateGroup', false,
    'cannotCreateReason', 'STUDENT_ALREADY_IN_GROUP'
  ),
  'leader viewer sees current group, leadership, claim, and the already-in-group reason'
);

select is(
  (
    select jsonb_build_object(
      'name', board -> 'groups' -> 0 -> 'name',
      'status', board -> 'groups' -> 0 -> 'status',
      'leader', board -> 'groups' -> 0 -> 'leader' -> 'displayName',
      'memberCount', board -> 'groups' -> 0 -> 'memberCount',
      'availableSeats', board -> 'groups' -> 0 -> 'availableSeats',
      'meetsMinimumSize', board -> 'groups' -> 0 -> 'meetsMinimumSize',
      'isAcceptingMembers', board -> 'groups' -> 0 -> 'isAcceptingMembers'
    )
    from p3_03_boards
    where label = 's1'
  ),
  '{"name": "Leaf Team", "status": "forming", "leader": "Ada Leader", "memberCount": 2, "availableSeats": 1, "meetsMinimumSize": true, "isAcceptingMembers": true}'::jsonb,
  'group card carries leader, capacity, minimum-size, and accepting state'
);

select is(
  (
    select array(
      select member ->> 'displayName' || ':' || (member ->> 'role')
      from jsonb_array_elements(board -> 'groups' -> 0 -> 'members') as member
    )
    from p3_03_boards
    where label = 's1'
  ),
  array['Ada Leader:leader', 'Bo Member:member'],
  'group members list the leader first'
);

select is(
  (
    select array(
      select student ->> 'displayName'
      from jsonb_array_elements(board -> 'unassignedStudents') as student
    )
    from p3_03_boards
    where label = 's1'
  ),
  array['Cy Student', 'Di Student'],
  'unassigned students exclude current group members and teachers'
);

select ok(
  (select board::text not like '%@example.edu%' from p3_03_boards where label = 's1'),
  'board never exposes email addresses'
);

-- An unassigned student with an open slot may create.
select pg_temp.act_as('00000000-0000-0000-0000-000000003304');
set local role authenticated;
insert into p3_03_boards
select 's3_open', public.get_class_group_board('20000000-0000-0000-0000-000000003301');
reset role;

select is(
  (select board -> 'viewer' -> 'canCreateGroup' from p3_03_boards where label = 's3_open'),
  'true'::jsonb,
  'eligible unassigned student can create a group'
);

select is(
  (select board -> 'viewer' -> 'cannotCreateReason' from p3_03_boards where label = 's3_open'),
  'null'::jsonb,
  'eligible student has no cannot-create reason'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000003304');
set local role authenticated;
insert into p3_03_created
select 's3', group_id
from public.create_student_group('20000000-0000-0000-0000-000000003301', 'Root Team', null);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000003305');
set local role authenticated;
insert into p3_03_boards
select 's4_full', public.get_class_group_board('20000000-0000-0000-0000-000000003301');
reset role;

select is(
  (
    select jsonb_build_object(
      'canCreateGroup', board -> 'viewer' -> 'canCreateGroup',
      'cannotCreateReason', board -> 'viewer' -> 'cannotCreateReason',
      'remainingGroupSlots', board -> 'remainingGroupSlots',
      'groupCount', jsonb_array_length(board -> 'groups')
    )
    from p3_03_boards
    where label = 's4_full'
  ),
  '{"canCreateGroup": false, "cannotCreateReason": "GROUP_LIMIT_REACHED", "remainingGroupSlots": 0, "groupCount": 2}'::jsonb,
  'when all slots are used the board disables creation with GROUP_LIMIT_REACHED'
);

select is(
  (
    select board -> 'groups' -> 1 -> 'isAcceptingMembers'
    from p3_03_boards
    where label = 's4_full'
  ),
  'true'::jsonb,
  'a one-member group below capacity still accepts members'
);

-- Formation settings take precedence over slot state.
update public.classes
set group_formation_status = 'closed'
where id = '20000000-0000-0000-0000-000000003301';

select pg_temp.act_as('00000000-0000-0000-0000-000000003305');
set local role authenticated;
select is(
  public.get_class_group_board('20000000-0000-0000-0000-000000003301') -> 'viewer' ->> 'cannotCreateReason',
  'GROUP_FORMATION_CLOSED',
  'closed formation reason is shown'
);
reset role;

update public.classes
set allow_student_groups = false
where id = '20000000-0000-0000-0000-000000003301';

select pg_temp.act_as('00000000-0000-0000-0000-000000003305');
set local role authenticated;
select is(
  public.get_class_group_board('20000000-0000-0000-0000-000000003301') -> 'viewer' ->> 'cannotCreateReason',
  'STUDENT_GROUP_CREATION_DISABLED',
  'disabled student creation reason takes precedence'
);
reset role;

update public.classes
set allow_student_groups = true,
    group_formation_status = 'open'
where id = '20000000-0000-0000-0000-000000003301';

-- Soft-deleted groups disappear and release a slot; the creator claim remains.
update public.group_members
set status = 'removed',
    left_at = now()
where group_id = (select group_id from p3_03_created where label = 's3');

update public.groups
set deleted_at = now()
where id = (select group_id from p3_03_created where label = 's3');

select pg_temp.act_as('00000000-0000-0000-0000-000000003304');
set local role authenticated;
insert into p3_03_boards
select 's3_after_delete', public.get_class_group_board('20000000-0000-0000-0000-000000003301');
reset role;

select is(
  (
    select jsonb_build_object(
      'groupCount', jsonb_array_length(board -> 'groups'),
      'currentGroupCount', board -> 'currentGroupCount',
      'remainingGroupSlots', board -> 'remainingGroupSlots',
      'cannotCreateReason', board -> 'viewer' -> 'cannotCreateReason',
      'hasCreatedStudentGroup', board -> 'viewer' -> 'hasCreatedStudentGroup'
    )
    from p3_03_boards
    where label = 's3_after_delete'
  ),
  '{"groupCount": 1, "currentGroupCount": 1, "remainingGroupSlots": 1, "cannotCreateReason": "STUDENT_GROUP_ALREADY_CREATED", "hasCreatedStudentGroup": true}'::jsonb,
  'deleted groups leave the board and free a slot while the creation claim still blocks'
);

select ok(
  (
    select exists (
      select 1
      from jsonb_array_elements(board -> 'unassignedStudents') as student
      where student ->> 'displayName' = 'Cy Student'
    )
    from p3_03_boards
    where label = 's3_after_delete'
  ),
  'removed members return to the unassigned list'
);

-- Archived groups are also excluded.
update public.groups
set status = 'archived',
    archived_at = now()
where id = (select group_id from p3_03_created where label = 's3');

select pg_temp.act_as('00000000-0000-0000-0000-000000003305');
set local role authenticated;
select is(
  jsonb_array_length(public.get_class_group_board('20000000-0000-0000-0000-000000003301') -> 'groups'),
  1,
  'archived groups are excluded from the current board'
);

-- Teacher view is read-only for creation.
select pg_temp.act_as('00000000-0000-0000-0000-000000003301');
select is(
  (
    select jsonb_build_object(
      'role', board -> 'viewer' -> 'role',
      'canCreateGroup', board -> 'viewer' -> 'canCreateGroup',
      'cannotCreateReason', board -> 'viewer' -> 'cannotCreateReason'
    )
    from (select public.get_class_group_board('20000000-0000-0000-0000-000000003301') as board) as teacher_board
  ),
  '{"role": "teacher", "canCreateGroup": false, "cannotCreateReason": "FORBIDDEN"}'::jsonb,
  'class teacher can read the board but not use student creation'
);

-- Authorization failures.
select pg_temp.act_as('00000000-0000-0000-0000-000000003306');
select throws_ok(
  $$select public.get_class_group_board('20000000-0000-0000-0000-000000003301')$$,
  '42501',
  'FORBIDDEN',
  'cross-class student cannot read another class board'
);

select throws_ok(
  $$select public.get_class_group_board('20000000-0000-0000-0000-00000000ffff')$$,
  '42501',
  'FORBIDDEN',
  'unknown class returns FORBIDDEN'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000003305');
select throws_ok(
  $$select public.get_class_group_board('20000000-0000-0000-0000-000000003303')$$,
  '42501',
  'CLASS_NOT_ACTIVE',
  'archived class returns CLASS_NOT_ACTIVE to its member'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.get_class_group_board('20000000-0000-0000-0000-000000003301')$$,
  '42501',
  'AUTH_REQUIRED',
  'missing auth subject returns AUTH_REQUIRED'
);
reset role;

update public.class_members
set status = 'left',
    left_at = now()
where class_id = '20000000-0000-0000-0000-000000003301'
  and user_id = '00000000-0000-0000-0000-000000003305';

select pg_temp.act_as('00000000-0000-0000-0000-000000003305');
set local role authenticated;
select throws_ok(
  $$select public.get_class_group_board('20000000-0000-0000-0000-000000003301')$$,
  '42501',
  'FORBIDDEN',
  'a student who left the class loses board access'
);
reset role;

update public.class_members
set status = 'active',
    left_at = null
where class_id = '20000000-0000-0000-0000-000000003301'
  and user_id = '00000000-0000-0000-0000-000000003305';

update public.profiles
set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000003305';

select pg_temp.act_as('00000000-0000-0000-0000-000000003305');
set local role authenticated;
select throws_ok(
  $$select public.get_class_group_board('20000000-0000-0000-0000-000000003301')$$,
  '42501',
  'ACCOUNT_DISABLED',
  'deactivated account returns ACCOUNT_DISABLED'
);
reset role;

update public.profiles
set status = 'active'
where id = '00000000-0000-0000-0000-000000003305';

set local role anon;
select throws_ok(
  $$select public.get_class_group_board('20000000-0000-0000-0000-000000003301')$$,
  '42501',
  'permission denied for function get_class_group_board',
  'anonymous callers cannot execute get_class_group_board'
);
reset role;

-- Member list now reports the current group.
select pg_temp.act_as('00000000-0000-0000-0000-000000003303');
set local role authenticated;
select is(
  (
    select array_agg(display_name || ':' || coalesce(current_group_name, '-') order by display_name)
    from public.list_class_members('20000000-0000-0000-0000-000000003301', 'student', 'active', 50, null, null)
  ),
  array['Ada Leader:Leaf Team', 'Bo Member:Leaf Team', 'Cy Student:-', 'Di Student:-'],
  'student member list shows current group names and unassigned classmates'
);

select is(
  (
    select count(*)
    from public.list_class_members('20000000-0000-0000-0000-000000003301', 'student', 'active', 50, null, null)
    where email is not null
  ),
  0::bigint,
  'student member list still omits classmate emails'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000003301');
set local role authenticated;
select is(
  (
    select current_group_id
    from public.list_class_members('20000000-0000-0000-0000-000000003301', 'student', 'active', 50, null, null)
    where display_name = 'Bo Member'
  ),
  (select group_id from p3_03_created where label = 's1'),
  'teacher member list reports the current group id'
);

select is(
  (
    select current_group_id
    from public.list_class_members('20000000-0000-0000-0000-000000003301', 'student', 'active', 50, null, null)
    where display_name = 'Cy Student'
  ),
  null::uuid,
  'members of deleted or archived groups show no current group'
);

select ok(
  (
    select bool_and(email is not null)
    from public.list_class_members('20000000-0000-0000-0000-000000003301', null, 'active', 50, null, null)
  ),
  'teacher member list keeps emails'
);
reset role;

select ok(
  has_function_privilege('authenticated', 'public.list_class_members(uuid,text,text,integer,text,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.list_class_members(uuid,text,text,integer,text,uuid)', 'EXECUTE'),
  'replaced member-list RPC keeps authenticated-only execute grants'
);

select ok(
  (
    select function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
    from pg_proc as function_row
    where function_row.oid = 'public.list_class_members(uuid,text,text,integer,text,uuid)'::regprocedure
  ),
  'replaced member-list RPC keeps security definer and empty search_path'
);

select * from finish();
rollback;
