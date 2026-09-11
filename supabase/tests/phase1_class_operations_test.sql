begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(36);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000301', 'teacher.ops.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000302', 'teacher.ops.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000303', 'student.ops.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000304', 'unconfirmed.ops@example.edu', null, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000305', 'inactive.ops@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000304',
  '00000000-0000-0000-0000-000000000305'
);

update public.profiles
set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000305';

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000301', 'Ops School A', '00000000-0000-0000-0000-000000000301'),
  ('10000000-0000-0000-0000-000000000302', 'Ops School B', '00000000-0000-0000-0000-000000000302'),
  ('10000000-0000-0000-0000-000000000303', 'Archived Ops School', '00000000-0000-0000-0000-000000000301');

update public.schools
set status = 'archived'
where id = '10000000-0000-0000-0000-000000000303';

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000301', 'teacher'),
  ('10000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000302', 'teacher'),
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000303', 'student'),
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000304', 'teacher'),
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000305', 'teacher');

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000303', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.create_class(
    '10000000-0000-0000-0000-000000000301',
    'Student Class',
    'Biology',
    '2569',
    '1',
    null,
    3,
    5,
    5,
    true,
    'open'
  )$$,
  '42501',
  'FORBIDDEN',
  'student cannot create class'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000304', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.create_class(
    '10000000-0000-0000-0000-000000000301',
    'Unconfirmed Class',
    'Biology',
    '2569',
    '1',
    null,
    3,
    5,
    5,
    true,
    'open'
  )$$,
  '42501',
  'FORBIDDEN',
  'unconfirmed teacher cannot create class'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000305', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.create_class(
    '10000000-0000-0000-0000-000000000301',
    'Inactive Class',
    'Biology',
    '2569',
    '1',
    null,
    3,
    5,
    5,
    true,
    'open'
  )$$,
  '42501',
  'FORBIDDEN',
  'inactive teacher cannot create class'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000301', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.create_class(
    '10000000-0000-0000-0000-000000000302',
    'Cross School',
    'Biology',
    '2569',
    '1',
    null,
    3,
    5,
    5,
    true,
    'open'
  )$$,
  '42501',
  'FORBIDDEN',
  'teacher cannot create class outside active school membership'
);

select throws_ok(
  $$select * from public.create_class(
    '10000000-0000-0000-0000-000000000301',
    'Bad Limits',
    'Biology',
    '2569',
    '1',
    null,
    5,
    3,
    5,
    true,
    'open'
  )$$,
  '23514',
  'FORBIDDEN',
  'invalid group limits fail before partial writes'
);

select is((select count(*) from public.classes), 0::bigint,
  'failed class creation attempts leave no class rows');

create temporary table p103_classes as
select * from public.create_class(
  '10000000-0000-0000-0000-000000000301',
  'Biology M4',
  'Biology',
  '2569',
  '1',
  'Field class',
  3,
  5,
  6,
  true,
  'closed'
);

reset role;

select is((select count(*) from public.classes), 1::bigint,
  'teacher can create a class in their school');

select is(
  (
    select count(*)
    from public.class_members
    where class_id = (select class_id from p103_classes)
      and user_id = '00000000-0000-0000-0000-000000000301'
      and role = 'teacher'
      and status = 'active'
  ),
  1::bigint,
  'class creation atomically creates creator teacher membership'
);

select is((select count(*) from public.audit_logs where action = 'class_created'), 1::bigint,
  'class creation emits one audit event');
select is((select count(*) from public.research_events where event_name = 'class_created'), 1::bigint,
  'class creation emits one research event');

select results_eq(
  $$select min_group_size, max_group_size, maximum_groups, allow_student_groups, group_formation_status
    from public.classes
    where id = (select class_id from p103_classes)$$,
  $$values (3, 5, 6, true, 'closed'::text)$$,
  'class creation stores all documented settings'
);

set local role authenticated;

select results_eq(
  $$select min_group_size, max_group_size, maximum_groups, allow_student_groups, group_formation_status
    from public.update_class_group_settings(
      (select class_id from p103_classes),
      2,
      4,
      4,
      false,
      'open'
    )$$,
  $$values (2, 4, 4, false, 'open'::text)$$,
  'teacher can update group settings and open formation'
);

reset role;

select is((select count(*) from public.audit_logs where action = 'class_group_settings_updated'), 1::bigint,
  'settings update emits one audit event');
select is((select count(*) from public.research_events where event_name = 'class_group_settings_updated'), 1::bigint,
  'settings update emits one research event');

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000302', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.update_class_group_settings(
    (select class_id from p103_classes),
    2,
    4,
    4,
    true,
    'closed'
  )$$,
  '42501',
  'FORBIDDEN',
  'cross-school teacher cannot update another class'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000301', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
set local role authenticated;

create temporary table p103_invites as
select * from public.issue_class_invite(
  (select class_id from p103_classes),
  now() + interval '1 day',
  10
);

select ok(
  (
    select char_length(token) >= 43 and code ~ '^[A-Z0-9-]{6,32}$'
    from p103_invites
  ),
  'issuing an invite returns one generated code and opaque token'
);

reset role;

select ok(
  (
    select invite.token_hash <> issued.token
      and char_length(invite.token_hash) = 64
    from public.class_invites invite
    join p103_invites issued on issued.invite_id = invite.id
  ),
  'class invite stores only a secure token hash'
);

select ok(
  not has_column_privilege('authenticated', 'public.class_invites', 'token_hash', 'SELECT'),
  'authenticated Data API cannot select class invitation token hashes'
);

select is((select count(*) from public.audit_logs where action = 'class_invitation_issued'), 1::bigint,
  'invite issue emits one audit event');
select is((select count(*) from public.research_events where event_name = 'class_invitation_issued'), 1::bigint,
  'invite issue emits one research event');

set local role authenticated;

select results_eq(
  $$select status from public.disable_class_invite(
    (select invite_id from p103_invites)
  )$$,
  $$values ('disabled'::text)$$,
  'teacher can disable an active class invite'
);

select results_eq(
  $$select status from public.disable_class_invite(
    (select invite_id from p103_invites)
  )$$,
  $$values ('disabled'::text)$$,
  'repeated disable is deterministic'
);

reset role;

select is((select count(*) from public.audit_logs where action = 'class_invitation_disabled'), 1::bigint,
  'repeated disable does not duplicate audit events');
select is((select count(*) from public.research_events where event_name = 'class_invitation_disabled'), 1::bigint,
  'repeated disable does not duplicate research events');

set local role authenticated;
create temporary table p103_rotate_source as
select * from public.issue_class_invite(
  (select class_id from p103_classes),
  null,
  null
);

create temporary table p103_rotated as
select * from public.rotate_class_invite(
  (select invite_id from p103_rotate_source),
  now() + interval '2 days',
  20
);

select is(
  (
    select status
    from public.class_invites
    where id = (select invite_id from p103_rotate_source)
  ),
  'disabled',
  'rotation disables the superseded invite atomically'
);

select is(
  (
    select count(*)
    from public.class_invites
    where id = (select invite_id from p103_rotated)
      and status = 'active'
      and used_count = 0
  ),
  1::bigint,
  'rotation creates an active replacement without consuming membership'
);

select is((select count(*) from public.class_members), 1::bigint,
  'P1-03 invite operations do not create student memberships');

select throws_ok(
  $$select * from public.rotate_class_invite(
    (select invite_id from p103_rotate_source),
    now() + interval '2 days',
    20
  )$$,
  '42501',
  'INVITE_DISABLED',
  'rotation of a superseded invitation is denied'
);

select throws_ok(
  $$select * from public.issue_class_invite(
    (select class_id from p103_classes),
    now() - interval '1 minute',
    null
  )$$,
  '23514',
  'INVITE_INVALID',
  'expired-at-issue invitations are rejected'
);

select throws_ok(
  $$select * from public.issue_class_invite(
    (select class_id from p103_classes),
    null,
    0
  )$$,
  '23514',
  'INVITE_INVALID',
  'max uses below one is rejected'
);

reset role;

select is(
  (
    select count(*)
    from unnest(array[
      'public.create_class(uuid,text,text,text,text,text,integer,integer,integer,boolean,text)',
      'public.update_class_group_settings(uuid,integer,integer,integer,boolean,text)',
      'public.issue_class_invite(uuid,timestamp with time zone,integer)',
      'public.disable_class_invite(uuid)',
      'public.rotate_class_invite(uuid,timestamp with time zone,integer)'
    ]) as function_name
    where has_function_privilege('authenticated', function_name, 'EXECUTE')
  ),
  5::bigint,
  'authenticated role can execute only documented class operation RPCs'
);

select is(
  (
    select count(*)
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
    where (
        namespace.nspname = 'private'
        and function_row.proname in (
          'generate_class_invite_code',
          'generate_class_invite_token',
          'insert_research_event'
        )
      )
      or (
        namespace.nspname = 'public'
        and function_row.proname in (
          'create_class',
          'update_class_group_settings',
          'issue_class_invite',
          'disable_class_invite',
          'rotate_class_invite'
        )
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  8::bigint,
  'all P1-03 privileged functions use security definer with empty search path'
);

select is(
  (
    select count(*)
    from unnest(array[
      'private.generate_class_invite_code()',
      'private.generate_class_invite_token()',
      'private.insert_research_event(text,uuid,uuid,uuid,jsonb)'
    ]) as function_name
    where has_function_privilege('authenticated', function_name, 'EXECUTE')
  ),
  0::bigint,
  'authenticated role cannot execute private class operation helpers'
);

select is(
  (
    select count(*)
    from unnest(array['public.classes', 'public.class_members', 'public.class_invites']) as table_name
    where has_table_privilege('authenticated', table_name, 'INSERT')
       or has_table_privilege('authenticated', table_name, 'UPDATE')
       or has_table_privilege('authenticated', table_name, 'DELETE')
  ),
  0::bigint,
  'browser callers still cannot mutate trusted class tables directly'
);

select is(
  (
    select count(*)
    from public.research_events
    where payload::text ~ '([A-Za-z0-9_-]{32,}|[A-Z0-9]{4}-[A-Z0-9]{4})'
  ),
  0::bigint,
  'research event payloads do not contain invite codes or bearer tokens'
);

update public.classes
set status = 'archived'
where id = (select class_id from p103_classes);

set local role authenticated;

select throws_ok(
  $$select * from public.issue_class_invite(
    (select class_id from p103_classes),
    null,
    null
  )$$,
  '42501',
  'CLASS_NOT_ACTIVE',
  'archived class invite operations are denied'
);

select * from finish();
rollback;
