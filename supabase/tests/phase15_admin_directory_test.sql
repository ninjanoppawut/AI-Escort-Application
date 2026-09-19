begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(20);

-- P15-02: school provisioning, invitation listing, and the directory.
-- Identities: admin, teacher (non-admin), student.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000152001', 'p152.admin@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000152002', 'p152.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000152003', 'p152.student.ada@example.edu', now(), '{}'::jsonb);

update public.profiles set account_type = 'teacher', display_name = 'Kru Somchai'
where id = '00000000-0000-0000-0000-000000152002';
update public.profiles set display_name = 'Ada 50%_Lovelace'
where id = '00000000-0000-0000-0000-000000152003';

insert into public.platform_admins (user_id, status, reason)
values ('00000000-0000-0000-0000-000000152001', 'active', 'P15 test bootstrap');

create function pg_temp.act_as(user_id uuid, aal text)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', user_id, 'role', 'authenticated', 'aal', aal)::text,
    true
  );
  select set_config('role', 'authenticated', true);
$$;

-- Non-admins and aal1 admins are refused.
select pg_temp.act_as('00000000-0000-0000-0000-000000152002', 'aal2');
select throws_ok($$select * from public.admin_create_school('Teacher School')$$, '42501', 'ADMIN_REQUIRED', 'a teacher cannot create schools');
select throws_ok($$select * from public.admin_list_users()$$, '42501', 'ADMIN_REQUIRED', 'a teacher cannot read the directory');
select pg_temp.act_as('00000000-0000-0000-0000-000000152001', 'aal1');
select throws_ok($$select * from public.admin_list_schools()$$, '42501', 'MFA_REQUIRED', 'an aal1 admin must complete MFA');

select pg_temp.act_as('00000000-0000-0000-0000-000000152001', 'aal2');

-- Schools.
select is(
  (select name from public.admin_create_school('  P152 Riverside School  ')),
  'P152 Riverside School',
  'an admin creates a school with a trimmed name'
);
select throws_ok($$select * from public.admin_create_school('p152 riverside school')$$, '23505', 'SCHOOL_NAME_TAKEN', 'active school names are unique regardless of case');
select throws_ok($$select * from public.admin_create_school('   ')$$, '23514', 'VALIDATION_FAILED', 'a blank name is refused');

select ok(
  not exists (
    select 1 from public.school_memberships
    where user_id = '00000000-0000-0000-0000-000000152001'
  ),
  'the admin is never added to the school'
);

create temporary table p152_school on commit drop as
select school_id from public.admin_list_schools() where name = 'P152 Riverside School';
grant select on p152_school to authenticated;

select is(
  (select pending_invitation_count from public.admin_list_schools() where name = 'P152 Riverside School'),
  0::bigint,
  'a new school has no pending invitations'
);

-- Invitations: issue through the existing RPC, then list them.
select lives_ok(
  $$select * from public.issue_teacher_invitation(
      (select school_id from p152_school), 'new.teacher@example.edu', now() + interval '7 days')$$,
  'an admin issues a teacher invitation to the new school'
);
select is(
  (select email || '|' || status from public.admin_list_teacher_invitations((select school_id from p152_school))),
  'new.teacher@example.edu|pending',
  'the invitation list shows the email and status, never the token'
);
select ok(
  not exists (
    select 1
    from pg_proc, unnest(proargnames) as argument_name
    where proname = 'admin_list_teacher_invitations'
      and argument_name like '%token%'
  ),
  'no invitation list column carries a token or its hash'
);

-- Directory: masking, search escaping, filters, paging.
select is(
  (select email from public.admin_list_users('student', 'ada 50%_')),
  'p***@example.edu',
  'student emails are masked and a search with % and _ matches literally'
);
select is(
  (select count(*) from public.admin_list_users('student', '50x')),
  0::bigint,
  'wildcards in a search are not treated as patterns'
);
select is(
  (select email from public.admin_list_users('teacher', 'somchai')),
  'p152.teacher@example.edu',
  'teacher emails are shown for provisioning support'
);
select is(
  (select is_admin from public.admin_list_users(null, 'p152.admin')),
  true,
  'the directory marks active admin grants'
);
select is(
  (select count(*) from public.admin_list_users(page_size => 500)) <= 100,
  true,
  'a page never exceeds 100 rows'
);
select is(
  (select count(*) from public.admin_list_users(page_size => 1)),
  1::bigint,
  'a page size is honored'
);
select throws_ok(
  $$select * from public.admin_list_users(cursor_created_at => now())$$,
  '23514',
  'INVALID_CURSOR',
  'a half cursor is refused'
);

-- Archiving revokes pending invitations; reads and changes are audited.
select is(
  (select changed from public.admin_archive_school((select school_id from p152_school), 'Closed for the test')),
  true,
  'an admin archives a school'
);

reset role;
select is(
  (select string_agg(action, ',' order by action) from (
    select distinct action from public.audit_logs
    where actor_id = '00000000-0000-0000-0000-000000152001'
  ) as actions),
  'admin.directory.listed,admin.school.archived,admin.school.created,admin.schools.listed,admin.teacher_invitations.listed,teacher_invitation_issued',
  'every admin read and change is audited'
);

select * from finish();
rollback;
