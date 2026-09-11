begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(24);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000501', 'teacher.members.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000502', 'teacher.members.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000503', 'student.members.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000504', 'student.members.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000505', 'student.members.b1@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher', display_name = case id
  when '00000000-0000-0000-0000-000000000501' then 'Teacher A'
  when '00000000-0000-0000-0000-000000000502' then 'Teacher B'
  else display_name
end
where id in (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000502'
);

update public.profiles
set display_name = case id
  when '00000000-0000-0000-0000-000000000503' then 'Ada Student'
  when '00000000-0000-0000-0000-000000000504' then 'Ben Student'
  when '00000000-0000-0000-0000-000000000505' then 'Cross Student'
  else display_name
end
where id in (
  '00000000-0000-0000-0000-000000000503',
  '00000000-0000-0000-0000-000000000504',
  '00000000-0000-0000-0000-000000000505'
);

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000501', 'Members School A', '00000000-0000-0000-0000-000000000501'),
  ('10000000-0000-0000-0000-000000000502', 'Members School B', '00000000-0000-0000-0000-000000000502');

insert into public.school_memberships (school_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000501', 'teacher', 'active'),
  ('10000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000503', 'student', 'active'),
  ('10000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000504', 'student', 'active'),
  ('10000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502', 'teacher', 'active'),
  ('10000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000505', 'student', 'active');

insert into public.classes (
  id,
  school_id,
  name,
  subject,
  created_by,
  min_group_size,
  max_group_size,
  maximum_groups,
  group_formation_status
)
values
  ('20000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000501', 'Members Biology A', 'Biology', '00000000-0000-0000-0000-000000000501', 2, 4, 4, 'open'),
  ('20000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000502', 'Members Biology B', 'Biology', '00000000-0000-0000-0000-000000000502', 2, 4, 4, 'open'),
  ('20000000-0000-0000-0000-000000000503', '10000000-0000-0000-0000-000000000501', 'Archived Members A', 'Biology', '00000000-0000-0000-0000-000000000501', 2, 4, 4, 'open');

insert into public.class_members (id, class_id, user_id, role, status, joined_at)
values
  ('40000000-0000-0000-0000-000000000501', '20000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000501', 'teacher', 'active', '2026-08-01T01:00:00Z'),
  ('40000000-0000-0000-0000-000000000502', '20000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000503', 'student', 'active', '2026-08-01T02:00:00Z'),
  ('40000000-0000-0000-0000-000000000503', '20000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000504', 'student', 'active', '2026-08-01T03:00:00Z'),
  ('40000000-0000-0000-0000-000000000504', '20000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502', 'teacher', 'active', '2026-08-01T01:00:00Z'),
  ('40000000-0000-0000-0000-000000000505', '20000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000505', 'student', 'active', '2026-08-01T02:00:00Z'),
  ('40000000-0000-0000-0000-000000000506', '20000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000501', 'teacher', 'active', '2026-08-01T01:00:00Z');

update public.classes
set status = 'archived'
where id = '20000000-0000-0000-0000-000000000503';

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_authorized_classes()',
    'EXECUTE'
  ),
  'authenticated users can execute authorized class read model'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_class_members(uuid,text,text,integer,text,uuid)',
    'EXECUTE'
  ),
  'authenticated users can execute class member read model'
);

select ok(
  (
    select function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname = 'list_class_members'
  ),
  'member read RPC is security definer with fixed empty search path'
);

set local role authenticated;

select throws_ok(
  $$select * from public.list_authorized_classes()$$,
  '42501',
  null,
  'class list requires authenticated JWT subject'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000501', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select results_eq(
  $$select class_id, name, caller_role, status, active_member_count
    from public.list_authorized_classes()
    order by name asc$$,
  $$values
    ('20000000-0000-0000-0000-000000000503'::uuid, 'Archived Members A'::text, 'teacher'::text, 'archived'::text, 1::bigint),
    ('20000000-0000-0000-0000-000000000501'::uuid, 'Members Biology A'::text, 'teacher'::text, 'active'::text, 3::bigint)$$,
  'teacher sees active and archived authorized classes'
);

select is(
  (
    select count(*)
    from public.list_class_members(
      '20000000-0000-0000-0000-000000000501',
      null,
      'active',
      50,
      null,
      null
    )
  ),
  3::bigint,
  'teacher sees teachers and students in the class'
);

select is(
  (
    select count(*)
    from public.list_class_members(
      '20000000-0000-0000-0000-000000000501',
      'student',
      'active',
      50,
      null,
      null
    )
    where email is not null
  ),
  2::bigint,
  'teacher member rows include permitted student emails'
);

select results_eq(
  $$select display_name, role, current_group_id, current_group_name
    from public.list_class_members(
      '20000000-0000-0000-0000-000000000501',
      null,
      'active',
      50,
      null,
      null
    )
    order by display_name asc$$,
  $$values
    ('Ada Student'::text, 'student'::text, null::uuid, null::text),
    ('Ben Student'::text, 'student'::text, null::uuid, null::text),
    ('Teacher A'::text, 'teacher'::text, null::uuid, null::text)$$,
  'teacher rows expose role and null group placeholders'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000503', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select results_eq(
  $$select class_id, name, caller_role, status
    from public.list_authorized_classes()
    order by name asc$$,
  $$values (
    '20000000-0000-0000-0000-000000000501'::uuid,
    'Members Biology A'::text,
    'student'::text,
    'active'::text
  )$$,
  'student sees only active authorized classes'
);

select ok(
  not exists (
    select 1
    from public.list_authorized_classes()
    where class_id = '20000000-0000-0000-0000-000000000502'
  ),
  'student class list denies other classes'
);

select results_eq(
  $$select display_name, role, email, current_group_id
    from public.list_class_members(
      '20000000-0000-0000-0000-000000000501',
      null,
      'active',
      50,
      null,
      null
    )
    order by display_name asc$$,
  $$values
    ('Ada Student'::text, 'student'::text, null::text, null::uuid),
    ('Ben Student'::text, 'student'::text, null::text, null::uuid)$$,
  'student sees active classmates without email or group data'
);

select is(
  (
    select count(*)
    from public.list_class_members(
      '20000000-0000-0000-0000-000000000501',
      null,
      'active',
      50,
      null,
      null
    )
    where role = 'teacher'
  ),
  0::bigint,
  'student member list does not expose teacher rows'
);

select throws_ok(
  $$select * from public.list_class_members(
      '20000000-0000-0000-0000-000000000502',
      null,
      'active',
      50,
      null,
      null
    )$$,
  '42501',
  'FORBIDDEN',
  'student cannot read cross-class member list'
);

select throws_ok(
  $$select * from public.list_class_members(
      '20000000-0000-0000-0000-000000000503',
      null,
      'active',
      50,
      null,
      null
    )$$,
  '42501',
  'CLASS_NOT_ACTIVE',
  'archived class member list returns class-not-active state'
);

select results_eq(
  $$select display_name, member_id
    from public.list_class_members(
      '20000000-0000-0000-0000-000000000501',
      'student',
      'active',
      1,
      null,
      null
    )$$,
  $$values ('Ada Student'::text, '40000000-0000-0000-0000-000000000502'::uuid)$$,
  'member pagination first page follows display-name and member-id order'
);

select results_eq(
  $$select display_name, member_id
    from public.list_class_members(
      '20000000-0000-0000-0000-000000000501',
      'student',
      'active',
      1,
      'Ada Student',
      '40000000-0000-0000-0000-000000000502'
    )$$,
  $$values ('Ben Student'::text, '40000000-0000-0000-0000-000000000503'::uuid)$$,
  'member pagination cursor advances without duplicate rows'
);

select throws_ok(
  $$select * from public.list_class_members(
      '20000000-0000-0000-0000-000000000501',
      'admin',
      'active',
      50,
      null,
      null
    )$$,
  '23514',
  'FORBIDDEN',
  'member list rejects unsupported role filters'
);

select throws_ok(
  $$select * from public.list_class_members(
      '20000000-0000-0000-0000-000000000501',
      null,
      'suspended',
      50,
      null,
      null
    )$$,
  '23514',
  'FORBIDDEN',
  'member list rejects unsupported membership statuses'
);

select throws_ok(
  $$insert into public.classes (school_id, name, created_by)
    values (
      '10000000-0000-0000-0000-000000000501',
      'Browser Class Write',
      '00000000-0000-0000-0000-000000000503'
    )$$,
  '42501',
  null,
  'browser callers still cannot insert classes'
);

select throws_ok(
  $$insert into public.class_members (class_id, user_id, role)
    values (
      '20000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000505',
      'student'
    )$$,
  '42501',
  null,
  'browser callers still cannot insert class members'
);

select throws_ok(
  $$insert into public.class_invites (class_id, code, token_hash, created_by)
    values (
      '20000000-0000-0000-0000-000000000501',
      'BROWSER-INV',
      private.hash_invitation_token('browser-invite'),
      '00000000-0000-0000-0000-000000000501'
    )$$,
  '42501',
  null,
  'browser callers still cannot insert class invites'
);

reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.list_authorized_classes()',
    'EXECUTE'
  ),
  'anon cannot execute class list read model'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_class_members(uuid,text,text,integer,text,uuid)',
    'EXECUTE'
  ),
  'anon cannot execute member list read model'
);

select is(
  (
    select count(*)
    from public.class_members
    where class_id = '20000000-0000-0000-0000-000000000501'
      and user_id = '00000000-0000-0000-0000-000000000505'
  ),
  0::bigint,
  'denied browser write leaves no cross-class membership'
);

select * from finish();
rollback;
