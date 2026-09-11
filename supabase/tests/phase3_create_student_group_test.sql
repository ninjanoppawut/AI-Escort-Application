begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(42);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000003201', 'p3-02.teacher.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003202', 'p3-02.teacher.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003203', 'p3-02.student.a1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003204', 'p3-02.student.a2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003205', 'p3-02.student.a3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003206', 'p3-02.student.a4@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003207', 'p3-02.student.b1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003208', 'p3-02.student.a5@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in (
  '00000000-0000-0000-0000-000000003201',
  '00000000-0000-0000-0000-000000003202'
);

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000003201', 'P3-02 School A', '00000000-0000-0000-0000-000000003201'),
  ('10000000-0000-0000-0000-000000003202', 'P3-02 School B', '00000000-0000-0000-0000-000000003202');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003201', 'teacher'),
  ('10000000-0000-0000-0000-000000003202', '00000000-0000-0000-0000-000000003202', 'teacher'),
  ('10000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003203', 'student'),
  ('10000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003204', 'student'),
  ('10000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003205', 'student'),
  ('10000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003206', 'student'),
  ('10000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003208', 'student'),
  ('10000000-0000-0000-0000-000000003202', '00000000-0000-0000-0000-000000003207', 'student');

-- Class A: open, student creation enabled, two slots.
-- Class B: creation disabled. Class C: formation closed. Class D: archived.
insert into public.classes (
  id,
  school_id,
  name,
  min_group_size,
  max_group_size,
  maximum_groups,
  allow_student_groups,
  group_formation_status,
  status,
  created_by
)
values
  ('20000000-0000-0000-0000-000000003201', '10000000-0000-0000-0000-000000003201', 'P3-02 Class A', 2, 4, 2, true, 'open', 'active', '00000000-0000-0000-0000-000000003201'),
  ('20000000-0000-0000-0000-000000003202', '10000000-0000-0000-0000-000000003202', 'P3-02 Class B', 2, 4, 3, false, 'open', 'active', '00000000-0000-0000-0000-000000003202'),
  ('20000000-0000-0000-0000-000000003203', '10000000-0000-0000-0000-000000003201', 'P3-02 Class C', 2, 4, 3, true, 'closed', 'active', '00000000-0000-0000-0000-000000003201'),
  ('20000000-0000-0000-0000-000000003204', '10000000-0000-0000-0000-000000003201', 'P3-02 Class D', 2, 4, 3, true, 'open', 'active', '00000000-0000-0000-0000-000000003201');

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003201', 'teacher'),
  ('20000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003203', 'student'),
  ('20000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003204', 'student'),
  ('20000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003205', 'student'),
  ('20000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003206', 'student'),
  ('20000000-0000-0000-0000-000000003201', '00000000-0000-0000-0000-000000003208', 'student'),
  ('20000000-0000-0000-0000-000000003202', '00000000-0000-0000-0000-000000003202', 'teacher'),
  ('20000000-0000-0000-0000-000000003202', '00000000-0000-0000-0000-000000003207', 'student'),
  ('20000000-0000-0000-0000-000000003203', '00000000-0000-0000-0000-000000003201', 'teacher'),
  ('20000000-0000-0000-0000-000000003203', '00000000-0000-0000-0000-000000003206', 'student'),
  ('20000000-0000-0000-0000-000000003204', '00000000-0000-0000-0000-000000003201', 'teacher'),
  ('20000000-0000-0000-0000-000000003204', '00000000-0000-0000-0000-000000003206', 'student');

update public.classes
set status = 'archived'
where id = '20000000-0000-0000-0000-000000003204';

create temporary table p3_02_results (
  label text primary key,
  outcome text,
  error_code text,
  group_id uuid,
  class_id uuid,
  name text,
  description text,
  status text,
  leader_id uuid,
  current_group_count integer,
  maximum_groups integer,
  remaining_group_slots integer,
  created_at timestamptz
);
grant all on table p3_02_results to authenticated;

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

-- Function posture.
select has_function(
  'public',
  'create_student_group',
  array['uuid', 'text', 'text'],
  'create_student_group RPC exists'
);

select ok(
  (
    select function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
    from pg_proc as function_row
    where function_row.oid = 'public.create_student_group(uuid,text,text)'::regprocedure
  ),
  'create_student_group is security definer with an empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'public.create_student_group(uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.create_student_group(uuid,text,text)', 'EXECUTE'),
  'only authenticated callers may execute create_student_group'
);

select ok(
  not has_function_privilege('authenticated', 'private.insert_group_research_event(text,uuid,uuid,uuid,uuid,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.count_current_class_groups(uuid)', 'EXECUTE'),
  'group research-event and slot-count helpers are not browser callable'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'research_events'
      and indexname = 'research_events_group_time_idx'
  ),
  'research_events.group_id has a supporting index'
);

-- Successful creation by student A1.
select pg_temp.act_as('00000000-0000-0000-0000-000000003203');
set local role authenticated;
insert into p3_02_results
select 'a1_first', *
from public.create_student_group('20000000-0000-0000-0000-000000003201', '  Leaf Team  ', 'Group 1');
reset role;

select is(
  (select outcome from p3_02_results where label = 'a1_first'),
  'created',
  'eligible student creates a group'
);

select ok(
  exists (
    select 1
    from public.groups as group_row
    join p3_02_results as result on result.group_id = group_row.id
    where result.label = 'a1_first'
      and group_row.name = 'Leaf Team'
      and group_row.description = 'Group 1'
      and group_row.creator_type = 'student'
      and group_row.created_by = '00000000-0000-0000-0000-000000003203'
      and group_row.status = 'forming'
  ),
  'created group is a trimmed forming student group owned by the creator'
);

select is(
  (
    select array_agg(member.user_id::text || ':' || member.role)
    from public.group_members as member
    join p3_02_results as result on result.group_id = member.group_id
    where result.label = 'a1_first'
      and member.status = 'active'
  ),
  array['00000000-0000-0000-0000-000000003203:leader'],
  'creator is the first and only active leader'
);

select is(
  (select leader_id from p3_02_results where label = 'a1_first'),
  '00000000-0000-0000-0000-000000003203'::uuid,
  'result returns the creator as leader'
);

select is(
  (
    select count(*)
    from public.student_group_creation_claims as claim
    join p3_02_results as result on result.group_id = claim.group_id
    where result.label = 'a1_first'
      and claim.student_id = '00000000-0000-0000-0000-000000003203'
      and claim.status = 'claimed'
  ),
  1::bigint,
  'successful creation records one creation claim'
);

select is(
  (
    select array_agg(history.event_type order by history.event_type)
    from public.group_membership_history as history
    join p3_02_results as result on result.group_id = history.group_id
    where result.label = 'a1_first'
  ),
  array['became_leader', 'creation_claimed', 'joined'],
  'successful creation appends claim, join, and leadership history'
);

select is(
  (
    select event.payload
    from public.research_events as event
    join p3_02_results as result on result.group_id = event.group_id
    where result.label = 'a1_first'
      and event.event_name = 'group_created'
  ),
  '{"creator_type": "student", "remaining_slots": 1}'::jsonb,
  'group_created research event carries only allowlisted payload fields'
);

select is(
  (
    select count(*)
    from public.audit_logs as audit
    join p3_02_results as result on result.group_id = audit.resource_id
    where result.label = 'a1_first'
      and audit.action = 'group_created'
      and audit.outcome = 'succeeded'
      and audit.actor_kind = 'student'
  ),
  1::bigint,
  'successful creation writes one student audit row'
);

select is(
  (
    select array[current_group_count, maximum_groups, remaining_group_slots]
    from p3_02_results
    where label = 'a1_first'
  ),
  array[1, 2, 1],
  'result reports authoritative slot counts after creation'
);

-- The leader cannot create a second group.
select pg_temp.act_as('00000000-0000-0000-0000-000000003203');
set local role authenticated;
insert into p3_02_results
select 'a1_second', *
from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Second Team', null);
reset role;

select is(
  (select array[outcome, error_code] from p3_02_results where label = 'a1_second'),
  array['denied', 'STUDENT_ALREADY_IN_GROUP'],
  'a student already in a current group is denied'
);

select is(
  (
    select count(*)
    from public.research_events
    where actor_id = '00000000-0000-0000-0000-000000003203'
      and event_name = 'group_creation_failed'
      and payload = '{"error_code": "STUDENT_ALREADY_IN_GROUP"}'::jsonb
      and group_id is null
  ),
  1::bigint,
  'domain denial commits a group_creation_failed event with the stable code'
);

select is(
  (
    select count(*)
    from public.audit_logs
    where actor_id = '00000000-0000-0000-0000-000000003203'
      and action = 'group_created'
      and outcome = 'denied'
  ),
  1::bigint,
  'domain denial writes a denied audit row'
);

select is(
  (
    select count(*)
    from public.groups
    where class_id = '20000000-0000-0000-0000-000000003201'
  ),
  1::bigint,
  'denied creation writes no group'
);

-- A2 creates a group that is later removed; the claim still blocks recreation.
select pg_temp.act_as('00000000-0000-0000-0000-000000003204');
set local role authenticated;
insert into p3_02_results
select 'a2_first', *
from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Bark Team', null);
reset role;

select is(
  (select array[outcome, current_group_count::text, remaining_group_slots::text] from p3_02_results where label = 'a2_first'),
  array['created', '2', '0'],
  'second eligible student takes the final slot'
);

update public.group_members
set status = 'removed',
    left_at = now()
where group_id = (select group_id from p3_02_results where label = 'a2_first');

update public.groups
set deleted_at = now()
where id = (select group_id from p3_02_results where label = 'a2_first');

set constraints all immediate;
set constraints all deferred;

select pg_temp.act_as('00000000-0000-0000-0000-000000003204');
set local role authenticated;
insert into p3_02_results
select 'a2_after_delete', *
from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Bark Team Again', null);
reset role;

select is(
  (select array[outcome, error_code] from p3_02_results where label = 'a2_after_delete'),
  array['denied', 'STUDENT_GROUP_ALREADY_CREATED'],
  'deleting a group does not release the student creation claim'
);

-- The deleted group released its slot; A3 takes it, then A4 hits the limit.
select pg_temp.act_as('00000000-0000-0000-0000-000000003205');
set local role authenticated;
insert into p3_02_results
select 'a3_first', *
from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Root Team', null);
reset role;

select is(
  (select array[outcome, current_group_count::text, remaining_group_slots::text] from p3_02_results where label = 'a3_first'),
  array['created', '2', '0'],
  'a soft-deleted group no longer occupies a slot'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000003206');
set local role authenticated;
insert into p3_02_results
select 'a4_limit', *
from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Stem Team', null);
reset role;

select is(
  (select array[outcome, error_code, remaining_group_slots::text] from p3_02_results where label = 'a4_limit'),
  array['denied', 'GROUP_LIMIT_REACHED', '0'],
  'maximum group count returns GROUP_LIMIT_REACHED'
);

select is(
  (
    select count(*)
    from public.groups
    where class_id = '20000000-0000-0000-0000-000000003201'
      and deleted_at is null
      and status <> 'archived'
  ),
  2::bigint,
  'current group count never exceeds maximum_groups'
);

select is(
  (
    select count(*)
    from public.student_group_creation_claims
    where student_id = '00000000-0000-0000-0000-000000003206'
  ),
  0::bigint,
  'a denied student receives no creation claim'
);

-- Archived groups also release a slot.
update public.groups
set status = 'archived',
    archived_at = now()
where id = (select group_id from p3_02_results where label = 'a3_first');

select pg_temp.act_as('00000000-0000-0000-0000-000000003206');
set local role authenticated;
insert into p3_02_results
select 'a4_after_archive', *
from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Stem Team', null);
reset role;

select is(
  (select outcome from p3_02_results where label = 'a4_after_archive'),
  'created',
  'an archived group no longer occupies a slot'
);

-- Formation settings.
select pg_temp.act_as('00000000-0000-0000-0000-000000003207');
set local role authenticated;
insert into p3_02_results
select 'b1_disabled', *
from public.create_student_group('20000000-0000-0000-0000-000000003202', 'Disabled Team', null);
reset role;

select is(
  (select array[outcome, error_code] from p3_02_results where label = 'b1_disabled'),
  array['denied', 'STUDENT_GROUP_CREATION_DISABLED'],
  'student creation disabled returns STUDENT_GROUP_CREATION_DISABLED'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000003206');
set local role authenticated;
insert into p3_02_results
select 'a4_closed', *
from public.create_student_group('20000000-0000-0000-0000-000000003203', 'Closed Team', null);
reset role;

select is(
  (select array[outcome, error_code] from p3_02_results where label = 'a4_closed'),
  array['denied', 'GROUP_FORMATION_CLOSED'],
  'closed formation returns GROUP_FORMATION_CLOSED'
);

-- Authorization and account failures raise without writes.
select pg_temp.act_as('00000000-0000-0000-0000-000000003206');
set local role authenticated;
select throws_ok(
  $$select * from public.create_student_group('20000000-0000-0000-0000-000000003204', 'Archived Team', null)$$,
  '42501',
  'CLASS_NOT_ACTIVE',
  'archived class returns CLASS_NOT_ACTIVE to its student'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000003201');
select throws_ok(
  $$select * from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Teacher Team', null)$$,
  '42501',
  'FORBIDDEN',
  'class teacher cannot use the student creation RPC'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000003207');
select throws_ok(
  $$select * from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Cross Class Team', null)$$,
  '42501',
  'FORBIDDEN',
  'cross-class student cannot create a group in another class'
);

select throws_ok(
  $$select * from public.create_student_group('20000000-0000-0000-0000-00000000ffff', 'Missing Class Team', null)$$,
  '42501',
  'FORBIDDEN',
  'unknown class returns FORBIDDEN without disclosing existence'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000003208');
select throws_ok(
  $$select * from public.create_student_group('20000000-0000-0000-0000-000000003201', '   ', null)$$,
  '23514',
  'FORBIDDEN',
  'blank group name is rejected'
);

select throws_ok(
  $$select * from public.create_student_group('20000000-0000-0000-0000-000000003201', repeat('x', 121), null)$$,
  '23514',
  'FORBIDDEN',
  'group names longer than 120 characters are rejected'
);

reset role;
update public.profiles
set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000003208';

select pg_temp.act_as('00000000-0000-0000-0000-000000003208');
set local role authenticated;
select throws_ok(
  $$select * from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Disabled Account Team', null)$$,
  '42501',
  'ACCOUNT_DISABLED',
  'deactivated account returns ACCOUNT_DISABLED'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select * from public.create_student_group('20000000-0000-0000-0000-000000003201', 'No Subject Team', null)$$,
  '42501',
  'AUTH_REQUIRED',
  'missing auth subject returns AUTH_REQUIRED'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.create_student_group('20000000-0000-0000-0000-000000003201', 'Anon Team', null)$$,
  '42501',
  'permission denied for function create_student_group',
  'anonymous callers cannot execute create_student_group'
);
reset role;

select is(
  (
    select count(*)
    from public.groups
    where name in (
      'Archived Team',
      'Teacher Team',
      'Cross Class Team',
      'Missing Class Team',
      'Disabled Account Team',
      'No Subject Team',
      'Anon Team'
    )
  ),
  0::bigint,
  'raised authorization failures write no groups'
);

select is(
  (
    select count(*)
    from public.research_events
    where event_name = 'group_creation_failed'
      and class_id in (
        '20000000-0000-0000-0000-000000003201',
        '20000000-0000-0000-0000-000000003202',
        '20000000-0000-0000-0000-000000003203'
      )
  ),
  5::bigint,
  'each committed domain denial writes exactly one failure event'
);

-- Invariants over every populated current group created through the RPC.
select is(
  (
    select count(*)
    from public.groups as group_row
    where group_row.class_id = '20000000-0000-0000-0000-000000003201'
      and group_row.deleted_at is null
      and group_row.status <> 'archived'
      and (
        select count(*)
        from public.group_members as member
        where member.group_id = group_row.id
          and member.role = 'leader'
          and member.status = 'active'
      ) <> 1
  ),
  0::bigint,
  'every current group created by the RPC has exactly one active leader'
);

select is(
  (
    select count(*)
    from (
      select member.user_id
      from public.group_members as member
      where member.class_id = '20000000-0000-0000-0000-000000003201'
        and member.status = 'active'
      group by member.user_id
      having count(*) > 1
    ) as duplicate_members
  ),
  0::bigint,
  'no student holds two current group memberships in one class'
);

-- Student reads remain class-scoped after RPC writes.
select pg_temp.act_as('00000000-0000-0000-0000-000000003207');
set local role authenticated;
select is(
  (select count(*) from public.groups where class_id = '20000000-0000-0000-0000-000000003201'),
  0::bigint,
  'cross-class student cannot read groups created in another class'
);

select throws_ok(
  $$insert into public.student_group_creation_claims (class_id, student_id)
    values ('20000000-0000-0000-0000-000000003202', '00000000-0000-0000-0000-000000003207')$$,
  '42501',
  'permission denied for table student_group_creation_claims',
  'browser roles still cannot forge creation claims directly'
);
reset role;

select * from finish();
rollback;
