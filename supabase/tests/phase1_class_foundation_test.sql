begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(46);

select has_table('public', 'classes', 'classes table exists');
select has_table('public', 'class_members', 'class_members table exists');
select has_table('public', 'class_invites', 'class_invites table exists');

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('classes', 'class_members', 'class_invites')
      and relation.relrowsecurity
  ),
  3::bigint,
  'RLS is enabled on every exposed class table'
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-000000000101',
    'teacher.a@example.edu',
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'teacher.b@example.edu',
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    'student.a1@example.edu',
    now(),
    jsonb_build_object('account_type', 'teacher')
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    'student.a2@example.edu',
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000105',
    'student.b1@example.edu',
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000106',
    'unconfirmed.member@example.edu',
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000107',
    'inactive.member@example.edu',
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000108',
    'outsider@example.edu',
    now(),
    '{}'::jsonb
  );

update public.profiles
set account_type = 'teacher'
where id in (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102'
);

select is(
  (
    select account_type
    from public.profiles
    where id = '00000000-0000-0000-0000-000000000103'
  ),
  'student',
  'user metadata cannot grant teacher capability'
);

insert into public.schools (id, name, created_by)
values
  (
    '10000000-0000-0000-0000-000000000101',
    'School A',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '10000000-0000-0000-0000-000000000102',
    'School B',
    '00000000-0000-0000-0000-000000000102'
  );

insert into public.school_memberships (school_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    'teacher'
  ),
  (
    '10000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000102',
    'teacher'
  ),
  (
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000103',
    'student'
  ),
  (
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000104',
    'student'
  ),
  (
    '10000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000105',
    'student'
  ),
  (
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000106',
    'student'
  ),
  (
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000107',
    'student'
  );

insert into public.classes (
  id,
  school_id,
  name,
  subject,
  academic_year,
  semester,
  min_group_size,
  max_group_size,
  maximum_groups,
  allow_student_groups,
  group_formation_status,
  created_by
)
values
  (
    '40000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000101',
    'Class A',
    'Biology',
    '2569',
    '1',
    3,
    5,
    8,
    true,
    'open',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '40000000-0000-0000-0000-000000000102',
    '10000000-0000-0000-0000-000000000102',
    'Class B',
    'Science',
    '2569',
    '1',
    2,
    4,
    4,
    false,
    'closed',
    '00000000-0000-0000-0000-000000000102'
  );

insert into public.class_members (class_id, user_id, role)
values
  (
    '40000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    'teacher'
  ),
  (
    '40000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000103',
    'student'
  ),
  (
    '40000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000104',
    'student'
  ),
  (
    '40000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000106',
    'student'
  ),
  (
    '40000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000107',
    'student'
  ),
  (
    '40000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000102',
    'teacher'
  ),
  (
    '40000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000105',
    'student'
  );

insert into public.class_invites (
  id,
  class_id,
  code,
  token_hash,
  created_by,
  expires_at,
  max_uses,
  used_count,
  status,
  disabled_by,
  disabled_at,
  created_at
)
values
  (
    '50000000-0000-0000-0000-000000000101',
    '40000000-0000-0000-0000-000000000101',
    'CLASSA1',
    repeat('a', 64),
    '00000000-0000-0000-0000-000000000101',
    now() + interval '1 day',
    40,
    5,
    'active',
    null,
    null,
    now()
  ),
  (
    '50000000-0000-0000-0000-000000000102',
    '40000000-0000-0000-0000-000000000101',
    'EXPIRE1',
    repeat('b', 64),
    '00000000-0000-0000-0000-000000000101',
    now() - interval '1 day',
    10,
    2,
    'active',
    null,
    null,
    now() - interval '2 days'
  ),
  (
    '50000000-0000-0000-0000-000000000103',
    '40000000-0000-0000-0000-000000000101',
    'DISABL1',
    repeat('c', 64),
    '00000000-0000-0000-0000-000000000101',
    now() + interval '1 day',
    null,
    0,
    'disabled',
    '00000000-0000-0000-0000-000000000101',
    now(),
    now() - interval '1 hour'
  ),
  (
    '50000000-0000-0000-0000-000000000104',
    '40000000-0000-0000-0000-000000000102',
    'CLASSB1',
    repeat('d', 64),
    '00000000-0000-0000-0000-000000000102',
    null,
    null,
    0,
    'active',
    null,
    null,
    now()
  );

select is(
  (
    select row(
      min_group_size,
      max_group_size,
      maximum_groups,
      allow_student_groups,
      group_formation_status
    )::text
    from public.classes
    where id = '40000000-0000-0000-0000-000000000101'
  ),
  '(3,5,8,t,open)',
  'class configuration stores all documented group-formation controls'
);

select throws_ok(
  $$
    insert into public.classes (
      school_id, name, min_group_size, max_group_size, created_by
    )
    values (
      '10000000-0000-0000-0000-000000000101',
      'Invalid sizes',
      5,
      4,
      '00000000-0000-0000-0000-000000000101'
    )
  $$,
  '23514',
  'new row for relation ' || chr(34) || 'classes' || chr(34) ||
    ' violates check constraint ' || chr(34) ||
    'classes_max_group_size_check' || chr(34),
  'maximum group size cannot be below minimum group size'
);

select throws_ok(
  $$
    insert into public.classes (
      school_id, name, maximum_groups, created_by
    )
    values (
      '10000000-0000-0000-0000-000000000101',
      'Invalid group count',
      0,
      '00000000-0000-0000-0000-000000000101'
    )
  $$,
  '23514',
  'new row for relation ' || chr(34) || 'classes' || chr(34) ||
    ' violates check constraint ' || chr(34) ||
    'classes_maximum_groups_check' || chr(34),
  'maximum group count must be positive'
);

select throws_ok(
  $$
    insert into public.classes (school_id, name, created_by)
    values (
      '10000000-0000-0000-0000-000000000101',
      'Student-owned class',
      '00000000-0000-0000-0000-000000000103'
    )
  $$,
  '42501',
  'FORBIDDEN',
  'a student profile cannot own a class'
);

select throws_ok(
  $$
    insert into public.class_members (class_id, user_id, role)
    values (
      '40000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103',
      'assistant_teacher'
    )
  $$,
  '42501',
  'FORBIDDEN',
  'an invalid class membership role is rejected'
);

select throws_ok(
  $$
    insert into public.class_members (class_id, user_id, role)
    values (
      '40000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000103',
      'student'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint ' || chr(34) ||
    'class_members_class_user_unique' || chr(34),
  'a user cannot receive duplicate memberships in one class'
);

select throws_ok(
  $$
    insert into public.class_invites (
      class_id, code, token_hash, created_by
    )
    values (
      '40000000-0000-0000-0000-000000000101',
      'REPLAY1',
      repeat('a', 64),
      '00000000-0000-0000-0000-000000000101'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint ' || chr(34) ||
    'class_invites_token_hash_key' || chr(34),
  'an invitation token hash cannot be replayed into a second record'
);

select throws_ok(
  $$
    insert into public.class_invites (
      class_id, code, token_hash, created_by, max_uses, used_count
    )
    values (
      '40000000-0000-0000-0000-000000000101',
      'OVERUSE',
      repeat('e', 64),
      '00000000-0000-0000-0000-000000000101',
      1,
      2
    )
  $$,
  '23514',
  'new row for relation ' || chr(34) || 'class_invites' || chr(34) ||
    ' violates check constraint ' || chr(34) ||
    'class_invites_used_count_check' || chr(34),
  'invitation usage cannot exceed its configured maximum'
);

select is(
  (
    select count(*)
    from public.class_invites
    where expires_at <= now()
  ),
  1::bigint,
  'an expired invitation is represented by its immutable expiry boundary'
);

select is(
  (
    select count(*)
    from public.class_invites
    where status = 'disabled'
      and disabled_by is not null
      and disabled_at is not null
  ),
  1::bigint,
  'a revoked invitation records disabled state, actor, and time'
);

select ok(
  not has_column_privilege(
    'authenticated', 'public.class_invites', 'token_hash', 'SELECT'
  ),
  'opaque invitation token hashes are not exposed through the Data API'
);

select ok(
  has_column_privilege(
    'authenticated', 'public.class_invites', 'code', 'SELECT'
  ),
  'authorized invitation reads may project the teacher-visible classroom code'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.classes',
      'public.class_members',
      'public.class_invites'
    ]) as table_name
    where has_table_privilege('authenticated', table_name, 'INSERT')
       or has_table_privilege('authenticated', table_name, 'UPDATE')
       or has_table_privilege('authenticated', table_name, 'DELETE')
  ),
  0::bigint,
  'authenticated browser roles cannot mutate trusted class tables directly'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.classes',
      'public.class_members',
      'public.class_invites'
    ]) as table_name
    where has_table_privilege('anon', table_name, 'SELECT')
       or has_table_privilege('anon', table_name, 'INSERT')
       or has_table_privilege('anon', table_name, 'UPDATE')
       or has_table_privilege('anon', table_name, 'DELETE')
  ),
  0::bigint,
  'anonymous users have no class-table privileges'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and cmd = 'UPDATE'
      and (qual is null or with_check is null)
  ),
  0::bigint,
  'every public update policy defines USING and WITH CHECK'
);

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
        'public.classes'::regclass,
        'public.class_members'::regclass,
        'public.class_invites'::regclass
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
  'every class-foundation foreign key has a supporting index'
);

select is(
  (
    select count(*)
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'private'
      and function_row.proname in (
        'is_active_school_teacher',
        'is_active_class_teacher',
        'current_user_is_class_member',
        'current_user_is_class_teacher',
        'validate_class_creator',
        'validate_class_membership',
        'validate_class_invite_actors'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  7::bigint,
  'all class authorization helpers are private security definers with empty search paths'
);

select is(
  (
    select count(*)
    from unnest(array[
      'private.is_active_school_teacher(uuid,uuid)',
      'private.is_active_class_teacher(uuid,uuid)'
    ]) as function_name
    where has_function_privilege('authenticated', function_name, 'EXECUTE')
  ),
  0::bigint,
  'actor-parameter authorization helpers are not callable by authenticated users'
);

select is(
  (
    select count(*)
    from unnest(array[
      'private.validate_class_creator()',
      'private.validate_class_membership()',
      'private.validate_class_invite_actors()'
    ]) as function_name
    where has_function_privilege('authenticated', function_name, 'EXECUTE')
  ),
  0::bigint,
  'class validation trigger functions are not callable by authenticated users'
);

select ok(
  position('student' in (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.class_members'::regclass
      and conname = 'class_members_role_check'
  )) > 0
  and position('teacher' in (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.class_members'::regclass
      and conname = 'class_members_role_check'
  )) > 0,
  'class membership role is relationally limited to student and teacher'
);

select throws_ok(
  $$
    insert into public.classes (school_id, name, created_by)
    values (
      '10000000-0000-0000-0000-000000000102',
      'Cross-school class',
      '00000000-0000-0000-0000-000000000101'
    )
  $$,
  '42501',
  'FORBIDDEN',
  'a teacher cannot own a class outside their active teacher school membership'
);

select throws_ok(
  $$
    insert into public.class_members (class_id, user_id, role)
    values (
      '40000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000108',
      'teacher'
    )
  $$,
  '42501',
  'FORBIDDEN',
  'class membership cannot elevate a student account to teacher'
);

update auth.users
set email_confirmed_at = null
where id = '00000000-0000-0000-0000-000000000106';

update public.profiles
set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000107';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000101',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select is((select count(*) from public.classes), 1::bigint,
  'teacher A sees their authorized class only');
select is(
  (
    select count(*) from public.classes
    where id = '40000000-0000-0000-0000-000000000102'
  ),
  0::bigint,
  'teacher A cannot read a cross-school class'
);
select is((select count(*) from public.class_members), 5::bigint,
  'teacher A sees the membership rows in their class');
select is((select count(id) from public.class_invites), 3::bigint,
  'teacher A sees only invitation rows for their class');

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000103',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select is((select count(*) from public.classes), 1::bigint,
  'student A1 sees their authorized class');
select is((select count(*) from public.class_members), 5::bigint,
  'student A1 sees active membership rows in their class');
select is((select count(id) from public.class_invites), 0::bigint,
  'student A1 cannot read class invitation rows');
select is(
  (
    select count(*) from public.classes
    where id = '40000000-0000-0000-0000-000000000102'
  ),
  0::bigint,
  'student A1 cannot read a cross-class row'
);
select throws_ok(
  $$
    update public.class_members
    set role = 'teacher'
    where user_id = '00000000-0000-0000-0000-000000000103'
  $$,
  '42501',
  'permission denied for table class_members',
  'a student cannot escalate their class role through the Data API'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000102',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select is((select count(*) from public.classes), 1::bigint,
  'teacher B sees their authorized class only');
select is((select count(*) from public.class_members), 2::bigint,
  'teacher B sees only their class membership rows');
select is((select count(id) from public.class_invites), 1::bigint,
  'teacher B sees only their class invitation row');
select throws_ok(
  $$
    update public.classes
    set maximum_groups = 99
    where id = '40000000-0000-0000-0000-000000000102'
  $$,
  '42501',
  'permission denied for table classes',
  'an authorized teacher still uses a trusted operation to manage class settings'
);
select throws_ok(
  $$
    update public.class_invites
    set status = 'disabled'
    where id = '50000000-0000-0000-0000-000000000104'
  $$,
  '42501',
  'permission denied for table class_invites',
  'an authorized teacher still uses a trusted operation to revoke invitations'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000108',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select is((select count(*) from public.classes), 0::bigint,
  'an authenticated outsider sees no class rows');

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000106',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select is((select count(*) from public.classes), 0::bigint,
  'an unconfirmed class member cannot read protected class data');

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000107',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select is((select count(*) from public.classes), 0::bigint,
  'an inactive class member cannot read protected class data');

reset role;
update auth.users
set email_confirmed_at = now()
where id = '00000000-0000-0000-0000-000000000106';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000106',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select is((select count(*) from public.classes), 1::bigint,
  'class access recovers after the trusted email-confirmation state is restored');

reset role;
update public.profiles
set status = 'active'
where id = '00000000-0000-0000-0000-000000000107';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000107',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  true
);
set local role authenticated;

select is((select count(*) from public.classes), 1::bigint,
  'class access recovers after the trusted account state is reactivated');

reset role;
select * from finish();
rollback;
