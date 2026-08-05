begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(26);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'platform_admins', 'platform_admins table exists');
select has_table('public', 'schools', 'schools table exists');
select has_table('public', 'school_memberships', 'school_memberships table exists');
select has_table('public', 'teacher_invitations', 'teacher_invitations table exists');

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'profiles',
        'platform_admins',
        'schools',
        'school_memberships',
        'teacher_invitations'
      )
      and relation.relrowsecurity
  ),
  5::bigint,
  'RLS is enabled on every exposed identity table'
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-000000000001',
  'STUDENT.A1@EXAMPLE.EDU',
  now(),
  jsonb_build_object('account_type', 'teacher')
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-000000000002',
    'student.b1@example.edu',
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'unconfirmed@example.edu',
    null,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'admin.a@example.edu',
    now(),
    '{}'::jsonb
  );

select is(
  (
    select count(*)
    from public.profiles
    where id between
      '00000000-0000-0000-0000-000000000001'::uuid and
      '00000000-0000-0000-0000-000000000004'::uuid
  ),
  4::bigint,
  'auth.users trigger creates one profile per identity'
);

select is(
  (
    select account_type from public.profiles
    where id = '00000000-0000-0000-0000-000000000001'
  ),
  'student',
  'user metadata cannot grant teacher capability'
);

select is(
  (
    select email from public.profiles
    where id = '00000000-0000-0000-0000-000000000001'
  ),
  'student.a1@example.edu',
  'profile email is normalized from the trusted Auth identity'
);

insert into public.platform_admins (user_id, reason)
values (
  '00000000-0000-0000-0000-000000000004',
  'Deterministic test bootstrap'
);

insert into public.schools (id, name, created_by)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'School A',
    '00000000-0000-0000-0000-000000000004'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'School B',
    '00000000-0000-0000-0000-000000000004'
  );

insert into public.school_memberships (school_id, user_id, role)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'student'
);

insert into public.teacher_invitations (
  id,
  school_id,
  email,
  token_hash,
  created_by,
  expires_at
)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'teacher.a@example.edu',
  repeat('a', 64),
  '00000000-0000-0000-0000-000000000004',
  now() + interval '1 day'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from public.profiles),
  0::bigint,
  'an unconfirmed identity cannot read protected profile data'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'a confirmed active user can read their own profile'
);

select is(
  (
    select count(*) from public.profiles
    where id = '00000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'a confirmed user cannot read another profile'
);

reset role;

select ok(
  has_column_privilege(
    'authenticated', 'public.profiles', 'display_name', 'UPDATE'
  ),
  'authenticated users may update the presentation name column'
);

select ok(
  not has_column_privilege(
    'authenticated', 'public.profiles', 'account_type', 'UPDATE'
  ),
  'authenticated users cannot update trusted account capability'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$update public.profiles set display_name = 'Student A1'
    where id = '00000000-0000-0000-0000-000000000001'$$,
  'a user can update their own presentation name'
);

select results_eq(
  $$
    update public.profiles set display_name = 'Cross-user write'
    where id = '00000000-0000-0000-0000-000000000002'
    returning id
  $$,
  $$select null::uuid where false$$,
  'RLS turns a cross-user presentation update into a no-op'
);

select is(
  (select count(*) from public.schools),
  1::bigint,
  'a school member sees only their school'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from public.schools),
  0::bigint,
  'a user without membership cannot read a school'
);

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from public.schools),
  0::bigint,
  'an admin grant without aal2 cannot read admin-scoped school data'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'aal', 'aal2')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from public.schools),
  2::bigint,
  'an active admin with aal2 can read schools'
);

reset role;

select ok(
  not has_table_privilege(
    'authenticated', 'public.teacher_invitations', 'SELECT'
  ),
  'teacher invitation rows are not directly readable by authenticated users'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.profiles',
      'public.platform_admins',
      'public.schools',
      'public.school_memberships',
      'public.teacher_invitations'
    ]) as table_name
    where has_table_privilege('anon', table_name, 'SELECT')
       or has_table_privilege('anon', table_name, 'INSERT')
       or has_table_privilege('anon', table_name, 'UPDATE')
       or has_table_privilege('anon', table_name, 'DELETE')
  ),
  0::bigint,
  'anonymous users have no identity-table privileges'
);

select is(
  (
    select count(*) from pg_policies
    where schemaname = 'public'
      and cmd = 'UPDATE'
      and qual is not null
      and with_check is not null
  ),
  1::bigint,
  'every identity update policy defines USING and WITH CHECK'
);

select throws_ok(
  $$
    insert into public.teacher_invitations (
      school_id, email, token_hash, created_by, expires_at
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      'teacher.a@example.edu',
      repeat('b', 64),
      '00000000-0000-0000-0000-000000000004',
      now() + interval '2 days'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint ' || chr(34) ||
    'teacher_invitations_one_pending_school_email_idx' || chr(34),
  'only one pending teacher invitation exists per school and email'
);

select is(
  (
    select count(*)
    from pg_constraint constraint_row
    join pg_namespace namespace
      on namespace.oid = constraint_row.connamespace
    join pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = any(constraint_row.conkey)
    where namespace.nspname = 'public'
      and constraint_row.contype = 'f'
      and not exists (
        select 1 from pg_index index_row
        where index_row.indrelid = constraint_row.conrelid
          and attribute.attnum = any(index_row.indkey)
      )
  ),
  0::bigint,
  'every identity foreign-key column has an index'
);

select is(
  (
    select count(*)
    from pg_proc function_row
    join pg_namespace namespace
      on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'private'
      and function_row.proname in (
        'current_profile_is_active',
        'current_user_is_active_admin_aal2',
        'current_user_is_school_member',
        'sync_profile_from_auth_user'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  4::bigint,
  'security-definer functions are private and pin an empty search_path'
);

select * from finish();
rollback;
