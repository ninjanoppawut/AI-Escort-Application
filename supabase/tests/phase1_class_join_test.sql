begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(33);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000401', 'teacher.join@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000402', 'student.join.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000403', 'student.join.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000404', 'student.join.c@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000405', 'unconfirmed.join@example.edu', null, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000406', 'inactive.join@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000407', 'teacher.join.self@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000407'
);

update public.profiles
set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000406';

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000401', 'Join School', '00000000-0000-0000-0000-000000000401'),
  ('10000000-0000-0000-0000-000000000402', 'Archived Join School', '00000000-0000-0000-0000-000000000401');

update public.schools
set status = 'archived'
where id = '10000000-0000-0000-0000-000000000402';

insert into public.school_memberships (school_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000401', 'teacher', 'active'),
  ('10000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000407', 'teacher', 'active');

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
  (
    '20000000-0000-0000-0000-000000000401',
    '10000000-0000-0000-0000-000000000401',
    'Join Biology',
    'Biology',
    '00000000-0000-0000-0000-000000000401',
    2,
    4,
    4,
    'open'
  ),
  (
    '20000000-0000-0000-0000-000000000402',
    '10000000-0000-0000-0000-000000000401',
    'Archived Join Biology',
    'Biology',
    '00000000-0000-0000-0000-000000000401',
    2,
    4,
    4,
    'open'
  );

insert into public.class_members (class_id, user_id, role, status)
values
  ('20000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000401', 'teacher', 'active'),
  ('20000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000401', 'teacher', 'active');

insert into public.class_invites (
  id,
  class_id,
  code,
  token_hash,
  created_by,
  expires_at,
  max_uses
)
values
  (
    '30000000-0000-0000-0000-000000000401',
    '20000000-0000-0000-0000-000000000401',
    'JOIN-A001',
    private.hash_invitation_token('token-join-a-001'),
    '00000000-0000-0000-0000-000000000401',
    now() + interval '1 day',
    2
  ),
  (
    '30000000-0000-0000-0000-000000000402',
    '20000000-0000-0000-0000-000000000401',
    'JOIN-DISABLED',
    private.hash_invitation_token('token-disabled'),
    '00000000-0000-0000-0000-000000000401',
    now() + interval '1 day',
    2
  ),
  (
    '30000000-0000-0000-0000-000000000403',
    '20000000-0000-0000-0000-000000000401',
    'JOIN-EXPIRED',
    private.hash_invitation_token('token-expired'),
    '00000000-0000-0000-0000-000000000401',
    now() + interval '1 day',
    2
  ),
  (
    '30000000-0000-0000-0000-000000000404',
    '20000000-0000-0000-0000-000000000402',
    'JOIN-ARCH',
    private.hash_invitation_token('token-archived-class'),
    '00000000-0000-0000-0000-000000000401',
    now() + interval '1 day',
    2
  ),
  (
    '30000000-0000-0000-0000-000000000405',
    '20000000-0000-0000-0000-000000000401',
    'JOIN-FULL',
    private.hash_invitation_token('token-full'),
    '00000000-0000-0000-0000-000000000401',
    now() + interval '1 day',
    1
  );

update public.classes
set status = 'archived'
where id = '20000000-0000-0000-0000-000000000402';

update public.class_invites
set status = 'disabled',
    disabled_by = '00000000-0000-0000-0000-000000000401',
    disabled_at = now()
where id = '30000000-0000-0000-0000-000000000402';

update public.class_invites
set created_at = now() - interval '2 days',
    expires_at = now() - interval '1 day'
where id = '30000000-0000-0000-0000-000000000403';

update public.class_invites
set used_count = 1
where id = '30000000-0000-0000-0000-000000000405';

set local role authenticated;

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-A001', null)$$,
  '42501',
  'AUTH_REQUIRED',
  'join requires an authenticated user'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000405', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-A001', null)$$,
  '42501',
  'EMAIL_NOT_CONFIRMED',
  'unconfirmed student cannot join a class'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000406', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-A001', null)$$,
  '42501',
  'ACCOUNT_DISABLED',
  'disabled account cannot join a class'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000407', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-A001', null)$$,
  '42501',
  'FORBIDDEN',
  'teacher account cannot consume a student class invite'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000402', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.join_class_with_invite(null, null)$$,
  '23514',
  'INVITE_INVALID',
  'join requires exactly one invite input'
);

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-A001', 'token-join-a-001')$$,
  '23514',
  'INVITE_INVALID',
  'join rejects both code and token in one request'
);

select throws_ok(
  $$select * from public.join_class_with_invite('MISSING-1', null)$$,
  '42501',
  'INVITE_INVALID',
  'unknown invite code is invalid'
);

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-DISABLED', null)$$,
  '42501',
  'INVITE_DISABLED',
  'disabled invite cannot be consumed'
);

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-EXPIRED', null)$$,
  '42501',
  'INVITE_EXPIRED',
  'expired invite cannot be consumed'
);

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-ARCH', null)$$,
  '42501',
  'CLASS_NOT_ACTIVE',
  'archived class invite cannot be consumed'
);

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-FULL', null)$$,
  '42501',
  'INVITE_INVALID',
  'max-use boundary denies new students'
);

create temporary table p104_first_join as
select * from public.join_class_with_invite('join-a001', null);

select results_eq(
  $$select class_id, role, class_name, school_name, already_joined, used_count
    from p104_first_join$$,
  $$values (
    '20000000-0000-0000-0000-000000000401'::uuid,
    'student'::text,
    'Join Biology'::text,
    'Join School'::text,
    false,
    1
  )$$,
  'student joins by normalized code and receives class summary'
);

reset role;

select is(
  (
    select count(*)
    from public.school_memberships
    where school_id = '10000000-0000-0000-0000-000000000401'
      and user_id = '00000000-0000-0000-0000-000000000402'
      and role = 'student'
      and status = 'active'
  ),
  1::bigint,
  'join creates active student school membership'
);

select is(
  (
    select count(*)
    from public.class_members
    where class_id = '20000000-0000-0000-0000-000000000401'
      and user_id = '00000000-0000-0000-0000-000000000402'
      and role = 'student'
      and status = 'active'
  ),
  1::bigint,
  'join creates active student class membership'
);

select is(
  (
    select used_count
    from public.class_invites
    where id = '30000000-0000-0000-0000-000000000401'
  ),
  1,
  'join increments invite use count once'
);

select is((select count(*) from public.audit_logs where action = 'class_joined'), 1::bigint,
  'join emits one audit event');
select is((select count(*) from public.research_events where event_name = 'class_joined'), 1::bigint,
  'join emits one research event');
select is((select count(*) from public.notifications where type = 'class_joined'), 1::bigint,
  'join creates student notification');
select is((select count(*) from public.notifications where type = 'student_joined_class'), 1::bigint,
  'join creates teacher notification hook');

select ok(
  not exists (
    select 1
    from public.research_events
    where payload::text ~ '(token-join|JOIN-A001|[a-f0-9]{64})'
  ),
  'research event payload excludes raw invite code, raw token, and token hash'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000402', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

create temporary table p104_replay_join as
select * from public.join_class_with_invite('JOIN-A001', null);

select results_eq(
  $$select already_joined, used_count from p104_replay_join$$,
  $$values (true, 1)$$,
  'already joined replay is idempotent and does not consume another use'
);

reset role;

select is((select count(*) from public.class_members where class_id = '20000000-0000-0000-0000-000000000401' and user_id = '00000000-0000-0000-0000-000000000402'), 1::bigint,
  'replay does not duplicate class membership');
select is((select count(*) from public.audit_logs where action = 'class_joined'), 1::bigint,
  'replay does not duplicate audit event');
select is((select count(*) from public.research_events where event_name = 'class_joined'), 1::bigint,
  'replay does not duplicate research event');

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000403', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

create temporary table p104_token_join as
select * from public.join_class_with_invite(null, 'token-join-a-001');

select results_eq(
  $$select class_id, role, already_joined, used_count from p104_token_join$$,
  $$values (
    '20000000-0000-0000-0000-000000000401'::uuid,
    'student'::text,
    false,
    2
  )$$,
  'student can join by opaque link token'
);

reset role;

select is(
  (
    select count(*)
    from public.class_members
    where class_id = '20000000-0000-0000-0000-000000000401'
      and role = 'student'
      and status = 'active'
  ),
  2::bigint,
  'two distinct students consume the two allowed invite uses'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000404', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.join_class_with_invite('JOIN-A001', null)$$,
  '42501',
  'INVITE_INVALID',
  'third distinct student cannot exceed max uses'
);

reset role;

select ok(
  not has_column_privilege('authenticated', 'public.class_invites', 'token_hash', 'SELECT'),
  'authenticated Data API still cannot select invite token hashes'
);

set local role authenticated;

select throws_ok(
  $$insert into public.class_members (class_id, user_id, role)
    values (
      '20000000-0000-0000-0000-000000000401',
      '00000000-0000-0000-0000-000000000404',
      'teacher'
    )$$,
  '42501',
  null,
  'browser callers cannot choose a class role directly'
);

reset role;

select is(
  (
    select count(*)
    from unnest(array[
      'public.join_class_with_invite(text,text)'
    ]) as function_name
    where has_function_privilege('authenticated', function_name, 'EXECUTE')
  ),
  1::bigint,
  'authenticated role can execute the documented class join RPC'
);

select ok(
  (
    select function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname = 'join_class_with_invite'
  ),
  'join RPC is security definer with fixed empty search path'
);

select is(
  (
    select count(*)
    from unnest(array[
      'private.insert_notification(uuid,text,text,text,text,uuid,jsonb)'
    ]) as function_name
    where has_function_privilege('authenticated', function_name, 'EXECUTE')
  ),
  0::bigint,
  'authenticated role cannot execute private notification helper'
);

select is(
  (
    select count(*)
    from public.class_members
    where class_id = '20000000-0000-0000-0000-000000000401'
      and user_id = '00000000-0000-0000-0000-000000000404'
  ),
  0::bigint,
  'failed joins and forbidden direct writes leave no membership'
);

select * from finish();
rollback;
