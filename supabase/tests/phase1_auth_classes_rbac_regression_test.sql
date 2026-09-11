begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(46);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000601', 'teacher.p106.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000602', 'teacher.p106.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000603', 'student.p106.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000604', 'student.p106.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000605', 'student.p106.join@example.edu', now(), '{}'::jsonb),
  (
    '00000000-0000-0000-0000-000000000606',
    'student.p106.metadata@example.edu',
    now(),
    '{"role":"teacher","account_type":"teacher","is_admin":true}'::jsonb
  );

update public.profiles
set account_type = 'teacher',
    display_name = case id
      when '00000000-0000-0000-0000-000000000601' then 'P106 Teacher A'
      when '00000000-0000-0000-0000-000000000602' then 'P106 Teacher B'
      else display_name
    end
where id in (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000602'
);

update public.profiles
set display_name = case id
  when '00000000-0000-0000-0000-000000000603' then 'P106 Student A'
  when '00000000-0000-0000-0000-000000000604' then 'P106 Student B'
  when '00000000-0000-0000-0000-000000000605' then 'P106 Join Student'
  when '00000000-0000-0000-0000-000000000606' then 'P106 Metadata Student'
  else display_name
end
where id in (
  '00000000-0000-0000-0000-000000000603',
  '00000000-0000-0000-0000-000000000604',
  '00000000-0000-0000-0000-000000000605',
  '00000000-0000-0000-0000-000000000606'
);

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000601', 'P106 School A', '00000000-0000-0000-0000-000000000601'),
  ('10000000-0000-0000-0000-000000000602', 'P106 School B', '00000000-0000-0000-0000-000000000602');

insert into public.school_memberships (school_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000601', 'teacher', 'active'),
  ('10000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000603', 'student', 'active'),
  ('10000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000602', 'teacher', 'active'),
  ('10000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000604', 'student', 'active');

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
  ('20000000-0000-0000-0000-000000000601', '10000000-0000-0000-0000-000000000601', 'P106 Biology A', 'Biology', '00000000-0000-0000-0000-000000000601', 2, 4, 4, 'open'),
  ('20000000-0000-0000-0000-000000000602', '10000000-0000-0000-0000-000000000602', 'P106 Biology B', 'Biology', '00000000-0000-0000-0000-000000000602', 2, 4, 4, 'open');

insert into public.class_members (class_id, user_id, role, status)
values
  ('20000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000601', 'teacher', 'active'),
  ('20000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000603', 'student', 'active'),
  ('20000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000602', 'teacher', 'active'),
  ('20000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000604', 'student', 'active');

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
    '30000000-0000-0000-0000-000000000601',
    '20000000-0000-0000-0000-000000000601',
    'P106-A01',
    private.hash_invitation_token('token-p106-a'),
    '00000000-0000-0000-0000-000000000601',
    now() + interval '1 day',
    5
  ),
  (
    '30000000-0000-0000-0000-000000000602',
    '20000000-0000-0000-0000-000000000602',
    'P106-B01',
    private.hash_invitation_token('token-p106-b'),
    '00000000-0000-0000-0000-000000000602',
    now() + interval '1 day',
    5
  );

insert into public.notifications (id, recipient_id, type, title, message, entity_type, entity_id)
values
  ('50000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000603', 'class_joined', 'Own notification', 'Own message', 'class', '20000000-0000-0000-0000-000000000601'),
  ('50000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000604', 'class_joined', 'Other notification', 'Other message', 'class', '20000000-0000-0000-0000-000000000602');

select is(
  (
    select count(*)
    from unnest(array[
      'profiles',
      'platform_admins',
      'schools',
      'school_memberships',
      'teacher_invitations',
      'research_events',
      'audit_logs',
      'classes',
      'class_members',
      'class_invites',
      'notifications'
    ]) as table_name
    where not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    )
  ),
  0::bigint,
  'P1 exposed identity, class, event, and notification tables all have RLS enabled'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000603', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000603'), 1::bigint,
  'student can read their own profile');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000604'), 0::bigint,
  'student cannot read another student profile');
select is((select count(*) from public.schools where id = '10000000-0000-0000-0000-000000000601'), 1::bigint,
  'student can read their authorized school');
select is((select count(*) from public.schools where id = '10000000-0000-0000-0000-000000000602'), 0::bigint,
  'student cannot read another school');
select is((select count(*) from public.school_memberships where user_id = '00000000-0000-0000-0000-000000000603'), 1::bigint,
  'student can read their own school membership');
select is((select count(*) from public.school_memberships where user_id = '00000000-0000-0000-0000-000000000601'), 0::bigint,
  'student cannot read teacher provisioning membership rows');
select is((select count(*) from public.classes where id = '20000000-0000-0000-0000-000000000601'), 1::bigint,
  'student can read their authorized class');
select is((select count(*) from public.classes where id = '20000000-0000-0000-0000-000000000602'), 0::bigint,
  'student cannot read another class');
select is((select count(*) from public.class_members where class_id = '20000000-0000-0000-0000-000000000601'), 2::bigint,
  'student can read permitted same-class members');
select is((select count(*) from public.class_members where class_id = '20000000-0000-0000-0000-000000000602'), 0::bigint,
  'student cannot read cross-class member rows');
select is((select count(*) from public.class_invites), 0::bigint,
  'student cannot read class invitation rows');
select is((select count(*) from public.notifications), 1::bigint,
  'student can read only recipient-scoped notifications');
select is((select count(*) from public.notifications where id = '50000000-0000-0000-0000-000000000602'), 0::bigint,
  'student cannot read another recipient notification');

select throws_ok(
  $$update public.profiles set account_type = 'teacher' where id = '00000000-0000-0000-0000-000000000603'$$,
  '42501',
  null,
  'student cannot self-promote account type through profile update'
);
select throws_ok(
  $$insert into public.platform_admins (user_id, granted_by, reason) values ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000603', 'self')$$,
  '42501',
  null,
  'student cannot grant themselves platform admin'
);
select throws_ok(
  $$insert into public.school_memberships (school_id, user_id, role) values ('10000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000603', 'teacher')$$,
  '42501',
  null,
  'student cannot choose a teacher school membership'
);
select throws_ok(
  $$insert into public.class_members (class_id, user_id, role) values ('20000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000603', 'teacher')$$,
  '42501',
  null,
  'student cannot choose a teacher class membership'
);
select throws_ok(
  $$insert into public.class_invites (class_id, code, token_hash, created_by) values ('20000000-0000-0000-0000-000000000601', 'P106-STUDENT', 'hash', '00000000-0000-0000-0000-000000000603')$$,
  '42501',
  null,
  'student cannot write trusted invitation rows'
);
select throws_ok(
  $$insert into public.notifications (recipient_id, type, title, message) values ('00000000-0000-0000-0000-000000000603', 'class_joined', 'forged', 'forged')$$,
  '42501',
  null,
  'student cannot forge notification rows'
);
select throws_ok(
  $$select * from public.create_class('10000000-0000-0000-0000-000000000601', 'Student Class', 'Biology', '', '', '', 2, 4, 4, true, 'open')$$,
  '42501',
  'FORBIDDEN',
  'student cannot call teacher class creation RPC'
);
select throws_ok(
  $$select * from public.issue_class_invite('20000000-0000-0000-0000-000000000601', now() + interval '1 day', 5)$$,
  '42501',
  'FORBIDDEN',
  'student cannot call teacher invitation issue RPC'
);

reset role;
select ok(
  not has_table_privilege('authenticated', 'public.teacher_invitations', 'SELECT'),
  'authenticated browser role cannot select teacher provisioning invitations'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000601', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select results_eq(
  $$select id from public.classes order by id$$,
  $$values ('20000000-0000-0000-0000-000000000601'::uuid)$$,
  'teacher table reads are limited to their authorized class'
);
select is((select count(*) from public.schools where id = '10000000-0000-0000-0000-000000000602'), 0::bigint,
  'teacher cannot read another school');
select results_eq(
  $$select class_id from public.class_invites order by class_id$$,
  $$values ('20000000-0000-0000-0000-000000000601'::uuid)$$,
  'teacher invite table reads are limited to authorized classes'
);
select results_eq(
  $$select class_id, caller_role from public.list_authorized_classes() order by class_id$$,
  $$values ('20000000-0000-0000-0000-000000000601'::uuid, 'teacher'::text)$$,
  'teacher read model returns only authorized classes'
);
select throws_ok(
  $$select * from public.list_class_members('20000000-0000-0000-0000-000000000602', null, 'active', 50, null, null)$$,
  '42501',
  'FORBIDDEN',
  'teacher cannot read cross-school class members'
);
select throws_ok(
  $$select * from public.create_class('10000000-0000-0000-0000-000000000602', 'Cross School Class', 'Biology', '', '', '', 2, 4, 4, true, 'open')$$,
  '42501',
  'FORBIDDEN',
  'teacher cannot create a class in another school'
);
select throws_ok(
  $$select * from public.update_class_group_settings('20000000-0000-0000-0000-000000000602', 2, 4, 4, true, 'open')$$,
  '42501',
  'FORBIDDEN',
  'teacher cannot update another teacher class settings'
);
select throws_ok(
  $$select * from public.issue_class_invite('20000000-0000-0000-0000-000000000602', now() + interval '1 day', 5)$$,
  '42501',
  'FORBIDDEN',
  'teacher cannot issue invites for another class'
);
select throws_ok(
  $$select * from public.disable_class_invite('30000000-0000-0000-0000-000000000602')$$,
  '42501',
  'FORBIDDEN',
  'teacher cannot disable another class invite'
);
select throws_ok(
  $$select * from public.rotate_class_invite('30000000-0000-0000-0000-000000000602', now() + interval '1 day', 5)$$,
  '42501',
  'FORBIDDEN',
  'teacher cannot rotate another class invite'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000606', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.create_class('10000000-0000-0000-0000-000000000601', 'Metadata Class', 'Biology', '', '', '', 2, 4, 4, true, 'open')$$,
  '42501',
  'FORBIDDEN',
  'user-editable metadata cannot grant teacher capability'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000605', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

create temporary table p106_first_join as
select * from public.join_class_with_invite('p106-a01', null);

select results_eq(
  $$select class_id, role, already_joined, used_count from p106_first_join$$,
  $$values ('20000000-0000-0000-0000-000000000601'::uuid, 'student'::text, false, 1)$$,
  'first invite code use joins as student and consumes one use'
);

reset role;

select is(
  (
    select count(*)
    from public.class_members
    where class_id = '20000000-0000-0000-0000-000000000601'
      and user_id = '00000000-0000-0000-0000-000000000605'
      and role = 'student'
      and status = 'active'
  ),
  1::bigint,
  'join creates one active student class membership'
);
select is((select used_count from public.class_invites where id = '30000000-0000-0000-0000-000000000601'), 1,
  'join increments invite use count once');

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000605', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

create temporary table p106_code_replay as
select * from public.join_class_with_invite('P106-A01', null);

select results_eq(
  $$select already_joined, used_count from p106_code_replay$$,
  $$values (true, 1)$$,
  'repeated invite code use is idempotent for an existing member'
);

create temporary table p106_token_replay as
select * from public.join_class_with_invite(null, 'token-p106-a');

select results_eq(
  $$select already_joined, used_count from p106_token_replay$$,
  $$values (true, 1)$$,
  'repeated invite token use is idempotent for an existing member'
);

reset role;

select is(
  (
    select count(*)
    from public.class_members
    where class_id = '20000000-0000-0000-0000-000000000601'
      and user_id = '00000000-0000-0000-0000-000000000605'
  ),
  1::bigint,
  'invite replay does not duplicate class membership'
);
select is((select used_count from public.class_invites where id = '30000000-0000-0000-0000-000000000601'), 1,
  'invite replay does not consume additional uses');
select is(
  (
    select count(*)
    from public.audit_logs
    where action = 'class_joined'
      and actor_id = '00000000-0000-0000-0000-000000000605'
      and class_id = '20000000-0000-0000-0000-000000000601'
  ),
  1::bigint,
  'invite replay does not duplicate audit events'
);
select is(
  (
    select count(*)
    from public.research_events
    where event_name = 'class_joined'
      and actor_id = '00000000-0000-0000-0000-000000000605'
      and class_id = '20000000-0000-0000-0000-000000000601'
  ),
  1::bigint,
  'invite replay does not duplicate research events'
);
select is(
  (
    select count(*)
    from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000000605'
      and type = 'class_joined'
      and entity_id = '20000000-0000-0000-0000-000000000601'
  ),
  1::bigint,
  'invite replay does not duplicate student join notifications'
);
select ok(
  not has_column_privilege('authenticated', 'public.class_invites', 'token_hash', 'SELECT'),
  'authenticated browser role cannot select class invite token hashes'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.create_class(uuid,text,text,text,text,text,integer,integer,integer,boolean,text)',
      'public.update_class_group_settings(uuid,integer,integer,integer,boolean,text)',
      'public.issue_class_invite(uuid,timestamptz,integer)',
      'public.disable_class_invite(uuid)',
      'public.rotate_class_invite(uuid,timestamptz,integer)',
      'public.join_class_with_invite(text,text)',
      'public.list_authorized_classes()',
      'public.list_class_members(uuid,text,text,integer,text,uuid)'
    ]) as function_name
    where has_function_privilege('anon', function_name, 'EXECUTE')
  ),
  0::bigint,
  'anon cannot execute Phase 1 class/auth RPCs'
);

select * from finish();
rollback;
