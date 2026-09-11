begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(37);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000003101', 'p3.teacher.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003102', 'p3.teacher.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003103', 'p3.student.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003104', 'p3.student.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003105', 'p3.student.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003106', 'p3.student.b1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003107', 'p3.outsider@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in (
  '00000000-0000-0000-0000-000000003101',
  '00000000-0000-0000-0000-000000003102'
);

insert into public.schools (id, name, created_by)
values
  (
    '10000000-0000-0000-0000-000000003101',
    'P3 School A',
    '00000000-0000-0000-0000-000000003101'
  ),
  (
    '10000000-0000-0000-0000-000000003102',
    'P3 School B',
    '00000000-0000-0000-0000-000000003102'
  );

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000003101', 'teacher'),
  ('10000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-000000003102', 'teacher'),
  ('10000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000003103', 'student'),
  ('10000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000003104', 'student'),
  ('10000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000003105', 'student'),
  ('10000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-000000003106', 'student');

insert into public.classes (
  id,
  school_id,
  name,
  subject,
  min_group_size,
  max_group_size,
  maximum_groups,
  allow_student_groups,
  group_formation_status,
  created_by
)
values
  (
    '20000000-0000-0000-0000-000000003101',
    '10000000-0000-0000-0000-000000003101',
    'P3 Class A',
    'Biology',
    2,
    4,
    3,
    true,
    'open',
    '00000000-0000-0000-0000-000000003101'
  ),
  (
    '20000000-0000-0000-0000-000000003102',
    '10000000-0000-0000-0000-000000003102',
    'P3 Class B',
    'Science',
    2,
    4,
    3,
    true,
    'open',
    '00000000-0000-0000-0000-000000003102'
  );

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000003101', 'teacher'),
  ('20000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000003103', 'student'),
  ('20000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000003104', 'student'),
  ('20000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000003105', 'student'),
  ('20000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-000000003102', 'teacher'),
  ('20000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-000000003106', 'student');

select has_table('public', 'groups', 'groups table exists');
select has_table('public', 'group_members', 'group_members table exists');
select has_table(
  'public',
  'student_group_creation_claims',
  'student creation claims table exists'
);
select has_table(
  'public',
  'group_membership_history',
  'group membership history table exists'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.groups',
      'public.group_members',
      'public.student_group_creation_claims',
      'public.group_membership_history'
    ]) as table_name
    where (
      select relrowsecurity
      from pg_class
      where oid = table_name::regclass
    )
  ),
  4::bigint,
  'RLS is enabled on every exposed group table'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.groups',
      'public.group_members',
      'public.student_group_creation_claims',
      'public.group_membership_history'
    ]) as table_name
    where has_table_privilege('authenticated', table_name, 'INSERT')
       or has_table_privilege('authenticated', table_name, 'UPDATE')
       or has_table_privilege('authenticated', table_name, 'DELETE')
  ),
  0::bigint,
  'authenticated browser roles cannot mutate group foundation tables directly'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.groups',
      'public.group_members',
      'public.student_group_creation_claims',
      'public.group_membership_history'
    ]) as table_name
    where has_table_privilege('anon', table_name, 'SELECT')
       or has_table_privilege('anon', table_name, 'INSERT')
       or has_table_privilege('anon', table_name, 'UPDATE')
       or has_table_privilege('anon', table_name, 'DELETE')
  ),
  0::bigint,
  'anonymous users have no group-table privileges'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'one_active_leader_per_group'
      and indexdef like '%WHERE%role%leader%status%active%'
  ),
  'partial unique index enforces at most one active leader per group'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'one_active_group_per_student_per_class'
      and indexdef like '%WHERE%status%active%'
  ),
  'partial unique index enforces one current group per student per class'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'one_unreset_student_group_creation_claim_per_class'
      and indexdef like '%WHERE%status%claimed%'
  ),
  'partial unique index enforces one unreset creation claim per student per class'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'groups',
        'group_members',
        'student_group_creation_claims',
        'group_membership_history'
      )
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ),
  4::bigint,
  'group foundation tables define authenticated select policies'
);

select is(
  (
    select count(*)
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'private'
      and function_row.proname in (
        'is_active_class_student',
        'current_user_is_class_student',
        'is_active_group_leader',
        'validate_group_actor',
        'validate_group_member',
        'validate_student_group_creation_claim',
        'validate_group_membership_history',
        'prevent_group_membership_history_mutation',
        'enforce_group_active_leader'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  9::bigint,
  'all group authorization and validation helpers are private security definers with empty search paths'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.is_active_class_student(uuid,uuid)',
    'EXECUTE'
  ),
  'actor-parameter student helper is not callable by authenticated users'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.current_user_is_class_student(uuid)',
    'EXECUTE'
  ),
  'current-user class-student helper is callable by authenticated users'
);

insert into public.groups (id, class_id, name, created_by, creator_type)
values (
  '30000000-0000-0000-0000-000000003101',
  '20000000-0000-0000-0000-000000003101',
  'Leaf Team',
  '00000000-0000-0000-0000-000000003103',
  'student'
);

insert into public.group_members (id, class_id, group_id, user_id, role)
values (
  '40000000-0000-0000-0000-000000003101',
  '20000000-0000-0000-0000-000000003101',
  '30000000-0000-0000-0000-000000003101',
  '00000000-0000-0000-0000-000000003103',
  'leader'
);

insert into public.student_group_creation_claims (
  id,
  class_id,
  student_id,
  group_id
)
values (
  '50000000-0000-0000-0000-000000003101',
  '20000000-0000-0000-0000-000000003101',
  '00000000-0000-0000-0000-000000003103',
  '30000000-0000-0000-0000-000000003101'
);

insert into public.group_membership_history (
  id,
  class_id,
  group_id,
  user_id,
  event_type,
  actor_id,
  payload
)
values (
  '60000000-0000-0000-0000-000000003101',
  '20000000-0000-0000-0000-000000003101',
  '30000000-0000-0000-0000-000000003101',
  '00000000-0000-0000-0000-000000003103',
  'joined',
  '00000000-0000-0000-0000-000000003103',
  '{"source":"p3_test"}'::jsonb
);

select is((select count(*) from public.groups), 1::bigint,
  'trusted insert can create a student group with one leader');

select throws_ok(
  $$insert into public.group_members (class_id, group_id, user_id, role)
    values (
      '20000000-0000-0000-0000-000000003101',
      '30000000-0000-0000-0000-000000003101',
      '00000000-0000-0000-0000-000000003104',
      'leader'
    )$$,
  '23505',
  null,
  'a group cannot have two active leaders'
);

insert into public.groups (id, class_id, name, created_by, creator_type)
values (
  '30000000-0000-0000-0000-000000003102',
  '20000000-0000-0000-0000-000000003101',
  'Bark Team',
  '00000000-0000-0000-0000-000000003101',
  'teacher'
);

insert into public.group_members (id, class_id, group_id, user_id, role)
values (
  '40000000-0000-0000-0000-000000003102',
  '20000000-0000-0000-0000-000000003101',
  '30000000-0000-0000-0000-000000003102',
  '00000000-0000-0000-0000-000000003104',
  'leader'
);

select throws_ok(
  $$insert into public.group_members (class_id, group_id, user_id, role)
    values (
      '20000000-0000-0000-0000-000000003101',
      '30000000-0000-0000-0000-000000003101',
      '00000000-0000-0000-0000-000000003104',
      'member'
    )$$,
  '23505',
  null,
  'a student cannot have two active group memberships in one class'
);

select throws_ok(
  $$update public.group_members
    set role = 'member'
    where id = '40000000-0000-0000-0000-000000003102';
    set constraints group_members_one_active_leader immediate$$,
  '23514',
  'ONE_ACTIVE_LEADER_REQUIRED',
  'a populated current group cannot be committed without one active leader'
);

select throws_ok(
  $$insert into public.student_group_creation_claims (class_id, student_id, group_id)
    values (
      '20000000-0000-0000-0000-000000003101',
      '00000000-0000-0000-0000-000000003103',
      '30000000-0000-0000-0000-000000003101'
    )$$,
  '23505',
  null,
  'a student cannot hold two unreset group creation claims in one class'
);

update public.student_group_creation_claims
set
  status = 'reset_by_teacher',
  reset_by = '00000000-0000-0000-0000-000000003101',
  reset_at = now(),
  reset_reason = 'resolved duplicate test group'
where id = '50000000-0000-0000-0000-000000003101';

insert into public.student_group_creation_claims (
  class_id,
  student_id,
  group_id
)
values (
  '20000000-0000-0000-0000-000000003101',
  '00000000-0000-0000-0000-000000003103',
  '30000000-0000-0000-0000-000000003101'
);

select is(
  (
    select count(*)
    from public.student_group_creation_claims
    where class_id = '20000000-0000-0000-0000-000000003101'
      and student_id = '00000000-0000-0000-0000-000000003103'
      and status = 'claimed'
  ),
  1::bigint,
  'teacher reset permits exactly one replacement active creation claim'
);

select throws_ok(
  $$insert into public.groups (class_id, name, created_by, creator_type)
    values (
      '20000000-0000-0000-0000-000000003101',
      'Teacher Pretending',
      '00000000-0000-0000-0000-000000003101',
      'student'
    )$$,
  '42501',
  'FORBIDDEN',
  'student-created groups require an active student class member creator'
);

select throws_ok(
  $$insert into public.group_members (class_id, group_id, user_id, role)
    values (
      '20000000-0000-0000-0000-000000003102',
      '30000000-0000-0000-0000-000000003101',
      '00000000-0000-0000-0000-000000003106',
      'member'
    )$$,
  '42501',
  'DESTINATION_GROUP_INVALID',
  'group membership class_id must match the group class'
);

select throws_ok(
  $$insert into public.group_membership_history (
      class_id,
      group_id,
      user_id,
      event_type,
      payload
    )
    values (
      '20000000-0000-0000-0000-000000003101',
      '30000000-0000-0000-0000-000000003101',
      '00000000-0000-0000-0000-000000003103',
      'joined',
      '[]'::jsonb
    )$$,
  '23514',
  null,
  'history payload must be a JSON object'
);

select throws_ok(
  $$update public.group_membership_history
    set payload = '{"changed":true}'::jsonb
    where id = '60000000-0000-0000-0000-000000003101'$$,
  '42501',
  'HISTORY_APPEND_ONLY',
  'group membership history cannot be updated'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000003103', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is((select count(*) from public.groups), 2::bigint,
  'student sees current groups in their authorized class');
select is((select count(*) from public.group_members), 2::bigint,
  'student sees active group memberships in their authorized class');
select is((select count(*) from public.student_group_creation_claims), 2::bigint,
  'student sees only their own creation-claim history');
select is((select count(*) from public.group_membership_history), 0::bigint,
  'student cannot read append-only membership history table directly');
select throws_ok(
  $$insert into public.groups (class_id, name, created_by, creator_type)
    values (
      '20000000-0000-0000-0000-000000003101',
      'Browser Forgery',
      '00000000-0000-0000-0000-000000003103',
      'student'
    )$$,
  '42501',
  'permission denied for table groups',
  'student browser cannot insert group rows directly'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000003106', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is((select count(*) from public.groups), 0::bigint,
  'cross-class student sees no groups');
select is((select count(*) from public.group_members), 0::bigint,
  'cross-class student sees no group memberships');
select is((select count(*) from public.student_group_creation_claims), 0::bigint,
  'cross-class student sees no creation claims');

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000003101', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is((select count(*) from public.groups), 2::bigint,
  'teacher sees groups in their class');
select is((select count(*) from public.group_membership_history), 1::bigint,
  'teacher can read group membership history in their class');
select is((select count(*) from public.student_group_creation_claims), 2::bigint,
  'teacher can read creation claim history in their class');

select throws_ok(
  $$update public.group_members
    set role = 'leader'
    where id = '40000000-0000-0000-0000-000000003101'$$,
  '42501',
  'permission denied for table group_members',
  'teacher browser cannot directly update group membership'
);

reset role;

select is(
  (
    select count(*)
    from pg_constraint constraint_row
    join pg_namespace namespace on namespace.oid = constraint_row.connamespace
    join pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = any(constraint_row.conkey)
    where namespace.nspname = 'public'
      and constraint_row.conrelid in (
        'public.groups'::regclass,
        'public.group_members'::regclass,
        'public.student_group_creation_claims'::regclass,
        'public.group_membership_history'::regclass
      )
      and constraint_row.contype = 'f'
      and not exists (
        select 1
        from pg_index index_row
        where index_row.indrelid = constraint_row.conrelid
          and attribute.attnum = any(index_row.indkey)
      )
  ),
  0::bigint,
  'every group-foundation foreign key has a supporting index'
);

select * from finish();
rollback;
