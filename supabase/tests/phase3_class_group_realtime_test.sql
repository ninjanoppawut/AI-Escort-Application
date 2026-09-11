begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(22);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000003401', 'p3-04.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003402', 'p3-04.student.s1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003403', 'p3-04.student.s2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003404', 'p3-04.outsider@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000003401';

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000003401', 'P3-04 School', '00000000-0000-0000-0000-000000003401');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003401', 'teacher'),
  ('10000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003402', 'student'),
  ('10000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003403', 'student'),
  ('10000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003404', 'student');

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
  ('20000000-0000-0000-0000-000000003401', '10000000-0000-0000-0000-000000003401', 'P3-04 Class A', 1, 3, 2, true, 'open', '00000000-0000-0000-0000-000000003401'),
  ('20000000-0000-0000-0000-000000003402', '10000000-0000-0000-0000-000000003401', 'P3-04 Class B', 1, 3, 2, true, 'open', '00000000-0000-0000-0000-000000003401');

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003401', 'teacher'),
  ('20000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003402', 'student'),
  ('20000000-0000-0000-0000-000000003401', '00000000-0000-0000-0000-000000003403', 'student'),
  ('20000000-0000-0000-0000-000000003402', '00000000-0000-0000-0000-000000003401', 'teacher'),
  ('20000000-0000-0000-0000-000000003402', '00000000-0000-0000-0000-000000003404', 'student');

create temporary table p3_04_created (
  label text primary key,
  group_id uuid
);
grant all on table p3_04_created to authenticated;

create function pg_temp.act_as(actor uuid, topic text)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', actor, 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  ),
  set_config('realtime.topic', topic, true);
$$;

-- Rows written in one transaction share inserted_at, so assertions use event
-- multisets rather than positions.
create function pg_temp.class_a_event_count(event_name text)
returns bigint
language sql
as $$
  select count(*)
  from realtime.messages as message
  where message.topic = 'class:20000000-0000-0000-0000-000000003401:groups'
    and message.event = event_name;
$$;

create function pg_temp.class_a_total()
returns bigint
language sql
as $$
  select count(*)
  from realtime.messages as message
  where message.topic = 'class:20000000-0000-0000-0000-000000003401:groups';
$$;

-- Topic parsing and function posture.
select is(
  private.class_group_topic_class_id('class:20000000-0000-0000-0000-000000003401:groups'),
  '20000000-0000-0000-0000-000000003401'::uuid,
  'strict class-group topic parses to its class id'
);

select ok(
  private.class_group_topic_class_id('user:00000000-0000-0000-0000-000000003402:notifications') is null
    and private.class_group_topic_class_id('class:not-a-uuid:groups') is null
    and private.class_group_topic_class_id('class:20000000-0000-0000-0000-000000003401:groups:extra') is null,
  'non class-group topics never resolve to a class'
);

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'private'
      and function_row.proname in (
        'send_class_group_signal',
        'broadcast_group_row_signal',
        'broadcast_group_member_signal',
        'broadcast_class_group_settings_signal',
        'broadcast_group_claim_signal'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  5::bigint,
  'signal functions are private security definers with empty search paths'
);

select ok(
  not has_function_privilege('authenticated', 'private.send_class_group_signal(text,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.broadcast_group_row_signal()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.broadcast_group_member_signal()', 'EXECUTE')
    and has_function_privilege('authenticated', 'private.class_group_topic_class_id(text)', 'EXECUTE'),
  'browser roles cannot emit class-group signals but can evaluate the topic helper'
);

select is(
  (
    select count(*)
    from pg_trigger as trigger_row
    where not trigger_row.tgisinternal
      and trigger_row.tgname in (
        'groups_broadcast_class_group_signal',
        'group_members_broadcast_class_group_signal',
        'classes_broadcast_class_group_settings_signal',
        'student_group_creation_claims_broadcast_class_group_signal'
      )
  ),
  4::bigint,
  'group, membership, class-setting, and claim changes have signal triggers'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'class_group_realtime_receive_member_broadcasts'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and position('realtime.topic' in qual) > 0
      and position('current_user_is_class_member' in qual) > 0
  ),
  'class-group receive policy binds the requested topic to active class membership'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and cmd in ('INSERT', 'ALL')
      and position('groups' in coalesce(qual, '') || coalesce(with_check, '')) > 0
  ),
  'no policy lets browsers publish into class-group topics'
);

-- Group creation emits pointer-only signals.
select pg_temp.act_as('00000000-0000-0000-0000-000000003402', '');
set local role authenticated;
insert into p3_04_created
select 's1', group_id
from public.create_student_group('20000000-0000-0000-0000-000000003401', 'Leaf Team', null);
reset role;

select is(
  array[
    pg_temp.class_a_event_count('group.created'),
    pg_temp.class_a_event_count('group.member_joined'),
    pg_temp.class_a_total()
  ],
  array[1, 1, 2]::bigint[],
  'student group creation emits exactly group.created and group.member_joined'
);

select is(
  (
    select count(*)
    from realtime.messages as message
    where message.topic = 'class:20000000-0000-0000-0000-000000003401:groups'
      and message.private
      and message.extension = 'broadcast'
      and message.payload ->> 'version' = '1'
      and message.payload ->> 'type' = message.event
      and message.payload ->> 'classId' = '20000000-0000-0000-0000-000000003401'
      and message.payload ->> 'groupId' = (select group_id::text from p3_04_created where label = 's1')
      and message.payload ? 'changedAt'
  ),
  2::bigint,
  'signals are private broadcasts carrying type, version, class, group, and time'
);

select ok(
  not exists (
    select 1
    from realtime.messages as message
    where message.topic = 'class:20000000-0000-0000-0000-000000003401:groups'
      and (
        message.payload::text like '%Leaf Team%'
        or message.payload::text like '%@example.edu%'
        or message.payload ? 'name'
      )
  ),
  'signals never carry group names or emails'
);

-- Settings changes.
update public.classes
set group_formation_status = 'closed'
where id = '20000000-0000-0000-0000-000000003401';

update public.classes
set maximum_groups = 3
where id = '20000000-0000-0000-0000-000000003401';

select is(
  array[
    pg_temp.class_a_event_count('group.formation_changed'),
    pg_temp.class_a_event_count('group.capacity_changed')
  ],
  array[1, 1]::bigint[],
  'formation and capacity setting changes emit their signals'
);

update public.classes
set name = 'P3-04 Class A renamed'
where id = '20000000-0000-0000-0000-000000003401';

select is(
  pg_temp.class_a_total(),
  4::bigint,
  'unrelated class edits emit no group signal'
);

-- Membership and lifecycle transitions.
update public.group_members
set status = 'removed',
    left_at = now()
where group_id = (select group_id from p3_04_created where label = 's1');

select is(
  array[pg_temp.class_a_event_count('group.member_left'), pg_temp.class_a_total()],
  array[1, 5]::bigint[],
  'membership removal emits one group.member_left'
);

update public.groups
set deleted_at = now()
where id = (select group_id from p3_04_created where label = 's1');

select is(
  array[pg_temp.class_a_event_count('group.deleted'), pg_temp.class_a_total()],
  array[1, 6]::bigint[],
  'soft delete emits one group.deleted'
);

update public.student_group_creation_claims
set status = 'reset_by_teacher',
    reset_by = '00000000-0000-0000-0000-000000003401',
    reset_at = now(),
    reset_reason = 'resolved test group'
where group_id = (select group_id from p3_04_created where label = 's1');

select is(
  array[pg_temp.class_a_event_count('group.updated'), pg_temp.class_a_total()],
  array[1, 7]::bigint[],
  'teacher claim reset emits one group.updated'
);

select is(
  (
    select count(*)
    from realtime.messages as message
    where message.topic = 'class:20000000-0000-0000-0000-000000003402:groups'
  ),
  0::bigint,
  'class A changes never publish to class B'
);

-- Receive authorization through realtime.messages RLS.
select pg_temp.act_as(
  '00000000-0000-0000-0000-000000003403',
  'class:20000000-0000-0000-0000-000000003401:groups'
);
set local role authenticated;
select is(
  (select count(*) from realtime.messages where topic = 'class:20000000-0000-0000-0000-000000003401:groups'),
  7::bigint,
  'active classmate receives every class-group signal on their class topic'
);
reset role;

select pg_temp.act_as(
  '00000000-0000-0000-0000-000000003401',
  'class:20000000-0000-0000-0000-000000003401:groups'
);
set local role authenticated;
select is(
  (select count(*) from realtime.messages where topic = 'class:20000000-0000-0000-0000-000000003401:groups'),
  7::bigint,
  'class teacher receives class-group signals'
);
reset role;

select pg_temp.act_as(
  '00000000-0000-0000-0000-000000003404',
  'class:20000000-0000-0000-0000-000000003401:groups'
);
set local role authenticated;
select is(
  (select count(*) from realtime.messages where topic = 'class:20000000-0000-0000-0000-000000003401:groups'),
  0::bigint,
  'cross-class student cannot join another class-group topic'
);
reset role;

select pg_temp.act_as(
  '00000000-0000-0000-0000-000000003404',
  'class:20000000-0000-0000-0000-000000003402:groups'
);
set local role authenticated;
select is(
  (select count(*) from realtime.messages where topic = 'class:20000000-0000-0000-0000-000000003401:groups'),
  0::bigint,
  'a member of another class cannot read class A messages through their own topic'
);
reset role;

select pg_temp.act_as(
  '00000000-0000-0000-0000-000000003403',
  'user:00000000-0000-0000-0000-000000003403:notifications'
);
set local role authenticated;
select is(
  (select count(*) from realtime.messages where topic = 'class:20000000-0000-0000-0000-000000003401:groups'),
  0::bigint,
  'class-group messages are not readable through a different subscribed topic'
);
reset role;

update public.class_members
set status = 'left',
    left_at = now()
where class_id = '20000000-0000-0000-0000-000000003401'
  and user_id = '00000000-0000-0000-0000-000000003403';

select pg_temp.act_as(
  '00000000-0000-0000-0000-000000003403',
  'class:20000000-0000-0000-0000-000000003401:groups'
);
set local role authenticated;
select is(
  (select count(*) from realtime.messages where topic = 'class:20000000-0000-0000-0000-000000003401:groups'),
  0::bigint,
  'a student who left the class stops receiving class-group signals'
);
reset role;

select * from finish();
rollback;
