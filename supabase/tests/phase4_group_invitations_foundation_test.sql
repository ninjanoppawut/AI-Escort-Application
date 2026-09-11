begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(30);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000004101', 'p4-01.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004102', 'p4-01.leader@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004103', 'p4-01.invitee@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004104', 'p4-01.bystander@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004105', 'p4-01.outsider@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004106', 'p4-01.other.teacher@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in (
  '00000000-0000-0000-0000-000000004101',
  '00000000-0000-0000-0000-000000004106'
);

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000004101', 'P4-01 School', '00000000-0000-0000-0000-000000004101'),
  ('10000000-0000-0000-0000-000000004102', 'P4-01 Other School', '00000000-0000-0000-0000-000000004106');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004101', 'teacher'),
  ('10000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004102', 'student'),
  ('10000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004103', 'student'),
  ('10000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004104', 'student'),
  ('10000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-000000004106', 'teacher'),
  ('10000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-000000004105', 'student');

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
  ('20000000-0000-0000-0000-000000004101', '10000000-0000-0000-0000-000000004101', 'P4-01 Class', 2, 3, 3, true, 'open', '00000000-0000-0000-0000-000000004101'),
  ('20000000-0000-0000-0000-000000004102', '10000000-0000-0000-0000-000000004102', 'P4-01 Other Class', 2, 3, 3, true, 'open', '00000000-0000-0000-0000-000000004106');

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004101', 'teacher'),
  ('20000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004102', 'student'),
  ('20000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004103', 'student'),
  ('20000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004104', 'student'),
  ('20000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-000000004106', 'teacher'),
  ('20000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-000000004105', 'student');

insert into public.groups (id, class_id, name, created_by, creator_type)
values (
  '30000000-0000-0000-0000-000000004101',
  '20000000-0000-0000-0000-000000004101',
  'Invite Team',
  '00000000-0000-0000-0000-000000004102',
  'student'
);

insert into public.group_members (class_id, group_id, user_id, role)
values (
  '20000000-0000-0000-0000-000000004101',
  '30000000-0000-0000-0000-000000004101',
  '00000000-0000-0000-0000-000000004102',
  'leader'
);

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

-- Schema posture.
select has_table('public', 'group_invitations', 'group_invitations table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.group_invitations'::regclass),
  'RLS is enabled on group_invitations'
);

select ok(
  has_table_privilege('authenticated', 'public.group_invitations', 'SELECT')
    and not has_table_privilege('authenticated', 'public.group_invitations', 'INSERT')
    and not has_table_privilege('authenticated', 'public.group_invitations', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.group_invitations', 'DELETE')
    and not has_table_privilege('anon', 'public.group_invitations', 'SELECT'),
  'browsers may only read invitations; anon has no access'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'one_pending_group_invitation_per_invitee'
      and indexdef like '%UNIQUE%'
      and indexdef like '%WHERE%pending%'
  ),
  'partial unique index allows only one pending invitation per group and invitee'
);

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'private'
      and function_row.proname in (
        'current_user_is_group_leader',
        'validate_group_invitation_insert',
        'guard_group_invitation_update',
        'broadcast_group_invitation_signal'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  4::bigint,
  'invitation helpers and triggers are private security definers with empty search paths'
);

select ok(
  has_function_privilege('authenticated', 'private.current_user_is_group_leader(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.validate_group_invitation_insert()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.guard_group_invitation_update()', 'EXECUTE')
    and not has_function_privilege('anon', 'private.current_user_is_group_leader(uuid)', 'EXECUTE'),
  'only the current-user leader helper is callable by authenticated users'
);

-- Trusted inserts and constraints.
insert into public.group_invitations (id, class_id, group_id, invitee_id, invited_by)
values (
  '60000000-0000-0000-0000-000000004101',
  '20000000-0000-0000-0000-000000004101',
  '30000000-0000-0000-0000-000000004101',
  '00000000-0000-0000-0000-000000004103',
  '00000000-0000-0000-0000-000000004102'
);

select is(
  (
    select array[status, (expires_at - created_at)::text]
    from public.group_invitations
    where id = '60000000-0000-0000-0000-000000004101'
  ),
  array['pending', '24:00:00'],
  'new invitations are pending and expire after 24 hours'
);

select throws_ok(
  $$insert into public.group_invitations (class_id, group_id, invitee_id, invited_by)
    values (
      '20000000-0000-0000-0000-000000004101',
      '30000000-0000-0000-0000-000000004101',
      '00000000-0000-0000-0000-000000004103',
      '00000000-0000-0000-0000-000000004102'
    )$$,
  '23505',
  null,
  'a second pending invitation to the same invitee and group is rejected'
);

select throws_ok(
  $$insert into public.group_invitations (class_id, group_id, invitee_id, invited_by)
    values (
      '20000000-0000-0000-0000-000000004101',
      '30000000-0000-0000-0000-000000004101',
      '00000000-0000-0000-0000-000000004102',
      '00000000-0000-0000-0000-000000004102'
    )$$,
  '23514',
  null,
  'a leader cannot invite themselves'
);

select throws_ok(
  $$insert into public.group_invitations (class_id, group_id, invitee_id, invited_by)
    values (
      '20000000-0000-0000-0000-000000004101',
      '30000000-0000-0000-0000-000000004101',
      '00000000-0000-0000-0000-000000004104',
      '00000000-0000-0000-0000-000000004103'
    )$$,
  '42501',
  'NOT_GROUP_LEADER',
  'a non-leader student cannot be the inviter'
);

select throws_ok(
  $$insert into public.group_invitations (class_id, group_id, invitee_id, invited_by)
    values (
      '20000000-0000-0000-0000-000000004101',
      '30000000-0000-0000-0000-000000004101',
      '00000000-0000-0000-0000-000000004105',
      '00000000-0000-0000-0000-000000004102'
    )$$,
  '42501',
  'FORBIDDEN',
  'a student outside the class cannot be invited'
);

select throws_ok(
  $$insert into public.group_invitations (class_id, group_id, invitee_id, invited_by, status, responded_at)
    values (
      '20000000-0000-0000-0000-000000004101',
      '30000000-0000-0000-0000-000000004101',
      '00000000-0000-0000-0000-000000004104',
      '00000000-0000-0000-0000-000000004102',
      'accepted',
      now()
    )$$,
  '23514',
  'INVITATION_NOT_PENDING',
  'invitations must start pending'
);

select lives_ok(
  $$insert into public.group_invitations (id, class_id, group_id, invitee_id, invited_by)
    values (
      '60000000-0000-0000-0000-000000004102',
      '20000000-0000-0000-0000-000000004101',
      '30000000-0000-0000-0000-000000004101',
      '00000000-0000-0000-0000-000000004104',
      '00000000-0000-0000-0000-000000004101'
    )$$,
  'a class teacher may issue an invitation'
);

select throws_ok(
  $$update public.group_invitations
    set status = 'declined'
    where id = '60000000-0000-0000-0000-000000004101'$$,
  '23514',
  null,
  'terminal responses require responded_at'
);

update public.group_invitations
set status = 'declined',
    responded_at = now()
where id = '60000000-0000-0000-0000-000000004101';

select throws_ok(
  $$update public.group_invitations
    set status = 'accepted'
    where id = '60000000-0000-0000-0000-000000004101'$$,
  '23514',
  'INVITATION_NOT_PENDING',
  'a declined invitation cannot be accepted later'
);

select throws_ok(
  $$update public.group_invitations
    set invitee_id = '00000000-0000-0000-0000-000000004104'
    where id = '60000000-0000-0000-0000-000000004102'$$,
  '42501',
  'INVITATION_IDENTITY_IMMUTABLE',
  'invitation identity and expiry cannot be rewritten'
);

select throws_ok(
  $$update public.group_invitations
    set status = 'cancelled',
        responded_at = now(),
        cancelled_by = '00000000-0000-0000-0000-000000004104'
    where id = '60000000-0000-0000-0000-000000004102'$$,
  '42501',
  'FORBIDDEN',
  'only the leader or a class teacher can be recorded as the canceller'
);

select lives_ok(
  $$insert into public.group_invitations (id, class_id, group_id, invitee_id, invited_by)
    values (
      '60000000-0000-0000-0000-000000004103',
      '20000000-0000-0000-0000-000000004101',
      '30000000-0000-0000-0000-000000004101',
      '00000000-0000-0000-0000-000000004103',
      '00000000-0000-0000-0000-000000004102'
    )$$,
  'a declined invitation does not block a later pending invitation'
);

select ok(
  exists (
    select 1
    from realtime.messages as message
    where message.topic = 'class:20000000-0000-0000-0000-000000004101:groups'
      and message.event = 'group.invitation_changed'
      and message.payload ->> 'groupId' = '30000000-0000-0000-0000-000000004101'
  ),
  'invitation changes emit a class-group invalidation signal'
);

select ok(
  not exists (
    select 1
    from realtime.messages as message
    where message.topic = 'class:20000000-0000-0000-0000-000000004101:groups'
      and message.payload ? 'inviteeId'
  ),
  'invitation signals do not disclose the invitee'
);

-- RLS visibility.
select pg_temp.act_as('00000000-0000-0000-0000-000000004103');
set local role authenticated;
select is(
  (select count(*) from public.group_invitations),
  2::bigint,
  'invitee sees only invitations addressed to them'
);
select throws_ok(
  $$update public.group_invitations set status = 'expired' where invitee_id = '00000000-0000-0000-0000-000000004103'$$,
  '42501',
  'permission denied for table group_invitations',
  'invitee browser cannot change invitation state directly'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004102');
set local role authenticated;
select is(
  (select count(*) from public.group_invitations),
  3::bigint,
  'current group leader sees all invitations for the group'
);
select ok(
  (select private.current_user_is_group_leader('30000000-0000-0000-0000-000000004101')),
  'current-user leader helper recognizes the leader'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004104');
set local role authenticated;
select is(
  (select count(*) from public.group_invitations where invitee_id <> '00000000-0000-0000-0000-000000004104'),
  0::bigint,
  'a classmate sees no invitations addressed to other students'
);
select ok(
  not (select private.current_user_is_group_leader('30000000-0000-0000-0000-000000004101')),
  'current-user leader helper rejects non-leaders'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004101');
set local role authenticated;
select is(
  (select count(*) from public.group_invitations),
  3::bigint,
  'class teacher sees invitations in their class'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004106');
set local role authenticated;
select is(
  (select count(*) from public.group_invitations),
  0::bigint,
  'a teacher of another class sees no invitations'
);
reset role;

update public.groups
set status = 'locked',
    locked_at = now()
where id = '30000000-0000-0000-0000-000000004101';

select pg_temp.act_as('00000000-0000-0000-0000-000000004102');
set local role authenticated;
select is(
  (select count(*) from public.group_invitations),
  0::bigint,
  'a leader of a locked group loses invitation management visibility'
);
reset role;

select is(
  (
    select count(*)
    from pg_constraint as constraint_row
    join pg_attribute as attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = any(constraint_row.conkey)
    where constraint_row.conrelid = 'public.group_invitations'::regclass
      and constraint_row.contype = 'f'
      and not exists (
        select 1
        from pg_index as index_row
        where index_row.indrelid = constraint_row.conrelid
          and attribute.attnum = any(index_row.indkey)
      )
  ),
  0::bigint,
  'every group invitation foreign key has a supporting index'
);

select * from finish();
rollback;
