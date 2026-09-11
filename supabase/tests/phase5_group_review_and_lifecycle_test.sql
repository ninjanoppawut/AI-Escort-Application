begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(27);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000005201', 'p5b.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005202', 'p5b.teacher.b@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005203', 'p5b.leader@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005204', 'p5b.member@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000005205', 'p5b.invitee@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005202');

update public.profiles as profile
set display_name = names.display_name
from (
  values
    ('00000000-0000-0000-0000-000000005203'::uuid, 'Ada Leader'),
    ('00000000-0000-0000-0000-000000005204'::uuid, 'Bo Member'),
    ('00000000-0000-0000-0000-000000005205'::uuid, 'Cy Invitee')
) as names(id, display_name)
where profile.id = names.id;

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000005201', 'P5B School', '00000000-0000-0000-0000-000000005201'),
  ('10000000-0000-0000-0000-000000005202', 'P5B Other School', '00000000-0000-0000-0000-000000005202');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005201', 'teacher'),
  ('10000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005203', 'student'),
  ('10000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005204', 'student'),
  ('10000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005205', 'student'),
  ('10000000-0000-0000-0000-000000005202', '00000000-0000-0000-0000-000000005202', 'teacher');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000005201', '10000000-0000-0000-0000-000000005201', 'P5B Class', 2, 4, 3, true, 'open', '00000000-0000-0000-0000-000000005201'),
  ('20000000-0000-0000-0000-000000005202', '10000000-0000-0000-0000-000000005202', 'P5B Other Class', 2, 4, 3, true, 'open', '00000000-0000-0000-0000-000000005202');

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005201', 'teacher'),
  ('20000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005203', 'student'),
  ('20000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005204', 'student'),
  ('20000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005205', 'student'),
  ('20000000-0000-0000-0000-000000005202', '00000000-0000-0000-0000-000000005202', 'teacher');

create temporary table p5b_results (label text primary key, row jsonb not null);
grant all on table p5b_results to authenticated, anon;

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

create function pg_temp.result(label_value text, key text)
returns text
language sql
as $$
  select row ->> key from p5b_results where label = label_value;
$$;

create function pg_temp.g1()
returns uuid
language sql
as $$
  select (row ->> 'group_id')::uuid from p5b_results where label = 'g1';
$$;

create function pg_temp.teacher_call(label_value text, statement text)
returns void
language plpgsql
as $$
begin
  execute format(
    'insert into p5b_results select %L, to_jsonb(r) from (%s) as r',
    label_value,
    statement
  );
end;
$$;

select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname in (
        'approve_group', 'lock_group', 'unlock_group',
        'list_class_creation_claims', 'reset_group_creation_claim', 'delete_or_archive_group'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  6::bigint,
  'review and lifecycle RPCs are security definer with empty search paths'
);

select ok(
  (
    select bool_and(
      has_function_privilege('authenticated', signature, 'EXECUTE')
      and not has_function_privilege('anon', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.approve_group(uuid)', 'public.lock_group(uuid)', 'public.unlock_group(uuid)',
      'public.list_class_creation_claims(uuid)', 'public.reset_group_creation_claim(uuid,uuid,text)',
      'public.delete_or_archive_group(uuid)'
    ]) as signature
  )
    and not has_function_privilege('authenticated', 'private.cancel_group_pending_invitations(uuid,uuid)', 'EXECUTE'),
  'lifecycle RPCs are authenticated-only and helpers are private'
);

-- Fixture group: student-created with a member and a pending invitation.
select pg_temp.act_as('00000000-0000-0000-0000-000000005203');
set local role authenticated;
insert into p5b_results
select 'g1', to_jsonb(created)
from public.create_student_group('20000000-0000-0000-0000-000000005201', 'Review Team', null) as created;
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values ('20000000-0000-0000-0000-000000005201', pg_temp.g1(), '00000000-0000-0000-0000-000000005204', 'member', '00000000-0000-0000-0000-000000005203');

select pg_temp.act_as('00000000-0000-0000-0000-000000005203');
set local role authenticated;
insert into p5b_results
select 'invite', to_jsonb(sent)
from public.send_group_invitation(pg_temp.g1(), '00000000-0000-0000-0000-000000005205') as sent;
select throws_ok(
  format($$select * from public.approve_group(%L)$$, pg_temp.g1()),
  '42501',
  'FORBIDDEN',
  'students cannot approve groups'
);
reset role;

-- Approve.
select pg_temp.act_as('00000000-0000-0000-0000-000000005201');
set local role authenticated;
select pg_temp.teacher_call('approve', format('select * from public.approve_group(%L)', pg_temp.g1()));
select pg_temp.teacher_call('approve_again', format('select * from public.approve_group(%L)', pg_temp.g1()));
reset role;

select ok(
  pg_temp.result('approve', 'outcome') = 'approved'
    and exists (
      select 1 from public.groups
      where id = pg_temp.g1() and status = 'approved' and approved_by = '00000000-0000-0000-0000-000000005201'
    ),
  'a class teacher approves a group at minimum size'
);

select is(
  (select count(*) from public.notifications where type = 'group_approved' and group_id = pg_temp.g1()),
  2::bigint,
  'every active member is told the group was approved'
);

select is(pg_temp.result('approve_again', 'outcome'), 'approved', 'approval is idempotent');

-- Lock.
select pg_temp.act_as('00000000-0000-0000-0000-000000005201');
set local role authenticated;
select pg_temp.teacher_call('lock', format('select * from public.lock_group(%L)', pg_temp.g1()));
select pg_temp.teacher_call('lock_again', format('select * from public.lock_group(%L)', pg_temp.g1()));
select pg_temp.teacher_call('approve_locked', format('select * from public.approve_group(%L)', pg_temp.g1()));
reset role;

select ok(
  pg_temp.result('lock', 'outcome') = 'locked'
    and pg_temp.result('lock', 'cancelled_invitations') = '1'
    and (select status from public.group_invitations where id = pg_temp.result('invite', 'invitation_id')::uuid) = 'cancelled',
  'locking a group cancels its pending invitations'
);

select is(
  array[
    (select count(*) from public.notifications where type = 'group_locked' and group_id = pg_temp.g1()),
    (select count(*) from public.notifications where type = 'group_invitation_cancelled' and recipient_id = '00000000-0000-0000-0000-000000005205'),
    (select count(*) from public.research_events where event_name = 'group_locked' and group_id = pg_temp.g1() and payload = '{"member_count": 2}'::jsonb)
  ],
  array[2, 1, 1]::bigint[],
  'lock notifies members and invitees and writes a group_locked research event'
);

select is(
  array[pg_temp.result('lock_again', 'outcome'), pg_temp.result('approve_locked', 'error_code')],
  array['locked', 'GROUP_LOCKED'],
  'lock is idempotent and a locked group cannot be re-approved'
);

-- Unlock.
select pg_temp.act_as('00000000-0000-0000-0000-000000005202');
set local role authenticated;
select throws_ok(
  format($$select * from public.unlock_group(%L)$$, pg_temp.g1()),
  '42501',
  'FORBIDDEN',
  'a teacher of another class cannot unlock the group'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000005201');
set local role authenticated;
select pg_temp.teacher_call('unlock', format('select * from public.unlock_group(%L)', pg_temp.g1()));
reset role;

select is(
  array[
    pg_temp.result('unlock', 'status'),
    (select count(*)::text from public.notifications where type = 'group_unlocked' and group_id = pg_temp.g1())
  ],
  array['approved', '2'],
  'unlock restores the approved status and notifies members'
);

-- Claims before resolution.
select pg_temp.act_as('00000000-0000-0000-0000-000000005201');
set local role authenticated;
insert into p5b_results
select 'claims_before', public.list_class_creation_claims('20000000-0000-0000-0000-000000005201');
select pg_temp.teacher_call(
  'reset_too_early',
  $$select * from public.reset_group_creation_claim('20000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005203', 'still leading')$$
);
reset role;

select is(
  (
    select jsonb_build_object(
      'groupState', row -> 'claims' -> 0 -> 'groupState',
      'studentInGroup', row -> 'claims' -> 0 -> 'studentInGroup',
      'canReset', row -> 'claims' -> 0 -> 'canReset',
      'cannotResetReason', row -> 'claims' -> 0 -> 'cannotResetReason'
    )
    from p5b_results where label = 'claims_before'
  ),
  '{"groupState": "current", "studentInGroup": true, "canReset": false, "cannotResetReason": "INVALID_STATUS_TRANSITION"}'::jsonb,
  'claim list explains that a claim for a current group cannot be reset'
);

select is(
  pg_temp.result('reset_too_early', 'error_code'),
  'INVALID_STATUS_TRANSITION',
  'a claim cannot be reset while the student still leads the claimed group'
);

-- Delete an unused group.
select pg_temp.act_as('00000000-0000-0000-0000-000000005201');
set local role authenticated;
select pg_temp.teacher_call('delete', format('select * from public.delete_or_archive_group(%L)', pg_temp.g1()));
select pg_temp.teacher_call('delete_again', format('select * from public.delete_or_archive_group(%L)', pg_temp.g1()));
reset role;

select ok(
  pg_temp.result('delete', 'outcome') = 'deleted'
    and pg_temp.result('delete', 'released_members') = '2'
    and pg_temp.result('delete', 'remaining_group_slots') = '3'
    and exists (select 1 from public.groups where id = pg_temp.g1() and deleted_at is not null)
    and not exists (select 1 from public.group_members where group_id = pg_temp.g1() and status = 'active'),
  'an unused group is soft-deleted, members return to unassigned, and the slot is restored'
);

select is(
  array[
    (select count(*) from public.notifications where type = 'group_deleted' and group_id = pg_temp.g1()),
    (select count(*) from public.research_events where event_name = 'group_deleted' and group_id = pg_temp.g1()
      and payload = '{"member_count": 2, "had_pending_invites": false}'::jsonb),
    (select count(*) from public.group_membership_history where group_id = pg_temp.g1() and event_type = 'removed' and payload ->> 'source' = 'teacher_delete')
  ],
  array[2, 1, 2]::bigint[],
  'deletion notifies former members, writes a research event, and appends removal history'
);

select is(pg_temp.result('delete_again', 'outcome'), 'deleted', 'deletion is idempotent');

select pg_temp.act_as('00000000-0000-0000-0000-000000005203');
set local role authenticated;
insert into p5b_results
select 'recreate_blocked', to_jsonb(created)
from public.create_student_group('20000000-0000-0000-0000-000000005201', 'Second Try', null) as created;
reset role;

select is(
  pg_temp.result('recreate_blocked', 'error_code'),
  'STUDENT_GROUP_ALREADY_CREATED',
  'deleting a group does not release the creation claim'
);

-- Claim reset after resolution.
select pg_temp.act_as('00000000-0000-0000-0000-000000005201');
set local role authenticated;
insert into p5b_results
select 'claims_after', public.list_class_creation_claims('20000000-0000-0000-0000-000000005201');
select throws_ok(
  $$select * from public.reset_group_creation_claim('20000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005203', '   ')$$,
  '23514',
  'FORBIDDEN',
  'a claim reset requires a reason'
);
select pg_temp.teacher_call(
  'reset',
  $$select * from public.reset_group_creation_claim('20000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-000000005203', 'Group was deleted before use')$$
);
reset role;

select is(
  (
    select jsonb_build_object('groupState', row -> 'claims' -> 0 -> 'groupState', 'canReset', row -> 'claims' -> 0 -> 'canReset')
    from p5b_results where label = 'claims_after'
  ),
  '{"groupState": "deleted", "canReset": true}'::jsonb,
  'claim list shows a deleted prior group as resettable'
);

select ok(
  pg_temp.result('reset', 'outcome') = 'reset'
    and pg_temp.result('reset', 'audit_log_id') is not null
    and exists (
      select 1 from public.student_group_creation_claims
      where id = pg_temp.result('reset', 'claim_id')::uuid
        and status = 'reset_by_teacher'
        and reset_reason = 'Group was deleted before use'
    )
    and exists (
      select 1 from public.group_membership_history
      where user_id = '00000000-0000-0000-0000-000000005203' and event_type = 'claim_reset'
    ),
  'the reset is recorded with history and an audit reference'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000005203');
set local role authenticated;
insert into p5b_results
select 'recreate', to_jsonb(created)
from public.create_student_group('20000000-0000-0000-0000-000000005201', 'Second Team', null) as created;
reset role;

select is(pg_temp.result('recreate', 'outcome'), 'created', 'after a reset the student may create a group again');

-- Archive path: simulate Phase 6 session history for one group.
select pg_temp.act_as('00000000-0000-0000-0000-000000005201');
set local role authenticated;
select pg_temp.teacher_call(
  'g_history',
  $$select * from public.create_teacher_group('20000000-0000-0000-0000-000000005201', 'Historic Team', null, '00000000-0000-0000-0000-000000005204', '{}')$$
);
reset role;

create or replace function private.group_has_session_history(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_group_id = (select (row ->> 'group_id')::uuid from pg_temp.p5b_results where label = 'g_history');
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000005201');
set local role authenticated;
select pg_temp.teacher_call(
  'archive',
  format('select * from public.delete_or_archive_group(%L)', pg_temp.result('g_history', 'group_id'))
);
reset role;

select ok(
  pg_temp.result('archive', 'outcome') = 'archived'
    and exists (
      select 1 from public.groups
      where id = pg_temp.result('g_history', 'group_id')::uuid
        and status = 'archived' and archived_at is not null and deleted_at is null
    ),
  'a group with session history is archived, never deleted'
);

select is(
  array[
    (select count(*) from public.notifications where type = 'group_archived' and group_id = pg_temp.result('g_history', 'group_id')::uuid),
    (select count(*) from public.research_events where event_name = 'group_archived' and group_id = pg_temp.result('g_history', 'group_id')::uuid)
  ],
  array[1, 1]::bigint[],
  'archiving notifies members and writes a group_archived research event'
);

select is(
  private.count_current_class_groups('20000000-0000-0000-0000-000000005201'),
  1,
  'archived and deleted groups no longer occupy class slots'
);

-- Active session path.
create or replace function private.group_in_active_session(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_group_id = (select (row ->> 'group_id')::uuid from pg_temp.p5b_results where label = 'recreate');
$$;

select pg_temp.act_as('00000000-0000-0000-0000-000000005201');
set local role authenticated;
select pg_temp.teacher_call(
  'delete_active',
  format('select * from public.delete_or_archive_group(%L)', pg_temp.result('recreate', 'group_id'))
);
reset role;

select is(
  pg_temp.result('delete_active', 'error_code'),
  'GROUP_IN_ACTIVE_SESSION',
  'a group in an active session cannot be deleted or archived'
);

select ok(
  (
    select count(distinct message.event)
    from realtime.messages as message
    where message.topic = 'class:20000000-0000-0000-0000-000000005201:groups'
      and message.event in ('group.locked', 'group.unlocked', 'group.deleted', 'group.archived')
  ) = 4,
  'lifecycle changes emit locked, unlocked, deleted, and archived signals'
);

set local role anon;
select throws_ok(
  format($$select * from public.lock_group(%L)$$, pg_temp.g1()),
  '42501',
  'permission denied for function lock_group',
  'anonymous callers cannot lock groups'
);
reset role;

select * from finish();
rollback;
