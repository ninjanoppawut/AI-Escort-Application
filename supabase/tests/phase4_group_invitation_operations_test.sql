begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(50);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000004201', 'p4-02.teacher@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004202', 'p4-02.leader@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004203', 'p4-02.s1@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004204', 'p4-02.s2@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004205', 'p4-02.s3@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004206', 'p4-02.s4@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004207', 'p4-02.s5@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004208', 'p4-02.outsider@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000004209', 'p4-02.teacher.b@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id in ('00000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004209');

update public.profiles as profile
set display_name = names.display_name
from (
  values
    ('00000000-0000-0000-0000-000000004201'::uuid, 'Teacher T'),
    ('00000000-0000-0000-0000-000000004202'::uuid, 'Leader L'),
    ('00000000-0000-0000-0000-000000004203'::uuid, 'Student S1'),
    ('00000000-0000-0000-0000-000000004204'::uuid, 'Student S2'),
    ('00000000-0000-0000-0000-000000004205'::uuid, 'Student S3'),
    ('00000000-0000-0000-0000-000000004206'::uuid, 'Student S4'),
    ('00000000-0000-0000-0000-000000004207'::uuid, 'Student S5'),
    ('00000000-0000-0000-0000-000000004208'::uuid, 'Outsider X'),
    ('00000000-0000-0000-0000-000000004209'::uuid, 'Teacher B')
) as names(id, display_name)
where profile.id = names.id;

insert into public.schools (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000004201', 'P4-02 School', '00000000-0000-0000-0000-000000004201'),
  ('10000000-0000-0000-0000-000000004202', 'P4-02 Other School', '00000000-0000-0000-0000-000000004209');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004201', 'teacher'),
  ('10000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004202', 'student'),
  ('10000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004203', 'student'),
  ('10000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004204', 'student'),
  ('10000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004205', 'student'),
  ('10000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004206', 'student'),
  ('10000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004207', 'student'),
  ('10000000-0000-0000-0000-000000004202', '00000000-0000-0000-0000-000000004209', 'teacher'),
  ('10000000-0000-0000-0000-000000004202', '00000000-0000-0000-0000-000000004208', 'student');

insert into public.classes (
  id, school_id, name, min_group_size, max_group_size, maximum_groups,
  allow_student_groups, group_formation_status, created_by
)
values
  ('20000000-0000-0000-0000-000000004201', '10000000-0000-0000-0000-000000004201', 'P4-02 Class', 2, 3, 3, true, 'open', '00000000-0000-0000-0000-000000004201'),
  ('20000000-0000-0000-0000-000000004202', '10000000-0000-0000-0000-000000004202', 'P4-02 Other Class', 2, 3, 3, true, 'open', '00000000-0000-0000-0000-000000004209');

insert into public.class_members (class_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004201', 'teacher'),
  ('20000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004202', 'student'),
  ('20000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004203', 'student'),
  ('20000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004204', 'student'),
  ('20000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004205', 'student'),
  ('20000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004206', 'student'),
  ('20000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004207', 'student'),
  ('20000000-0000-0000-0000-000000004202', '00000000-0000-0000-0000-000000004209', 'teacher'),
  ('20000000-0000-0000-0000-000000004202', '00000000-0000-0000-0000-000000004208', 'student');

create temporary table p4_results (label text primary key, row jsonb not null);
grant all on table p4_results to authenticated;

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
  select row ->> key from p4_results where label = label_value;
$$;

-- Posture.
select is(
  (
    select count(*)
    from pg_proc as function_row
    join pg_namespace as namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname in (
        'send_group_invitation', 'cancel_group_invitation', 'accept_group_invitation',
        'decline_group_invitation', 'list_group_eligible_classmates', 'get_group_detail',
        'get_group_invitation'
      )
      and function_row.prosecdef
      and ('search_path=' || chr(34) || chr(34)) = any(function_row.proconfig)
  ),
  7::bigint,
  'invitation RPCs are security definer with empty search paths'
);

select ok(
  (
    select bool_and(
      has_function_privilege('authenticated', signature, 'EXECUTE')
      and not has_function_privilege('anon', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.send_group_invitation(uuid,uuid)',
      'public.cancel_group_invitation(uuid)',
      'public.accept_group_invitation(uuid)',
      'public.decline_group_invitation(uuid)',
      'public.list_group_eligible_classmates(uuid)',
      'public.get_group_detail(uuid)',
      'public.get_group_invitation(uuid)'
    ]) as signature
  ),
  'invitation RPCs are executable by authenticated users only'
);

select ok(
  not has_function_privilege('authenticated', 'private.require_group_manager(uuid,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.expire_stale_group_invitations(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.group_active_member_count(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.require_active_verified_actor()', 'EXECUTE'),
  'invitation helper functions are not browser callable'
);

-- Two student-created groups.
select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'g1', to_jsonb(created)
from public.create_student_group('20000000-0000-0000-0000-000000004201', 'Leaf Team', null) as created;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004206');
set local role authenticated;
insert into p4_results
select 'g2', to_jsonb(created)
from public.create_student_group('20000000-0000-0000-0000-000000004201', 'Root Team', null) as created;
reset role;

-- Send.
select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'l_s1', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g1', 'group_id')::uuid, '00000000-0000-0000-0000-000000004203') as sent;
reset role;

select is(pg_temp.result('l_s1', 'outcome'), 'sent', 'leader sends an invitation to an unassigned classmate');

select is(
  (
    select count(*)
    from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000004203'
      and type = 'group_invitation_received'
      and class_id = '20000000-0000-0000-0000-000000004201'
      and group_id = pg_temp.result('g1', 'group_id')::uuid
      and group_invitation_id = pg_temp.result('l_s1', 'invitation_id')::uuid
      and message = 'Leader L เชิญคุณเข้ากลุ่ม Leaf Team'
  ),
  1::bigint,
  'invitee receives a durable invitation notification with relational deep-link targets'
);

select is(
  (
    select count(*)
    from public.research_events
    where event_name = 'group_invitation_sent'
      and group_id = pg_temp.result('g1', 'group_id')::uuid
      and payload = '{"group_member_count": 1}'::jsonb
  ),
  1::bigint,
  'sending writes a group_invitation_sent research event'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'l_s1_again', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g1', 'group_id')::uuid, '00000000-0000-0000-0000-000000004203') as sent;
reset role;

select is(
  array[pg_temp.result('l_s1_again', 'outcome'), pg_temp.result('l_s1_again', 'invitation_id')],
  array['already_pending', pg_temp.result('l_s1', 'invitation_id')],
  'resending replays the existing pending invitation'
);

select is(
  (
    select count(*)
    from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000004203'
      and type = 'group_invitation_received'
  ),
  1::bigint,
  'replayed send does not duplicate the notification'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004203');
set local role authenticated;
select throws_ok(
  format($$select * from public.send_group_invitation(%L, '00000000-0000-0000-0000-000000004205')$$, pg_temp.result('g1', 'group_id')),
  '42501',
  'NOT_GROUP_LEADER',
  'a classmate outside the group cannot send invitations for it'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004208');
set local role authenticated;
select throws_ok(
  format($$select * from public.send_group_invitation(%L, '00000000-0000-0000-0000-000000004205')$$, pg_temp.result('g1', 'group_id')),
  '42501',
  'FORBIDDEN',
  'a student of another class cannot send invitations for the group'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
select throws_ok(
  format($$select * from public.send_group_invitation(%L, '00000000-0000-0000-0000-000000004208')$$, pg_temp.result('g1', 'group_id')),
  '42501',
  'FORBIDDEN',
  'a leader cannot invite a student outside the class'
);

insert into p4_results
select 'l_s4', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g1', 'group_id')::uuid, '00000000-0000-0000-0000-000000004206') as sent;
reset role;

select is(
  array[pg_temp.result('l_s4', 'outcome'), pg_temp.result('l_s4', 'error_code')],
  array['denied', 'STUDENT_ALREADY_IN_GROUP'],
  'a classmate already in a group cannot be invited'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004206');
set local role authenticated;
insert into p4_results
select 's4_s1', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g2', 'group_id')::uuid, '00000000-0000-0000-0000-000000004203') as sent;
reset role;

select is(pg_temp.result('s4_s1', 'outcome'), 'sent', 'another leader may invite the same unassigned student');

select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'l_s2', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g1', 'group_id')::uuid, '00000000-0000-0000-0000-000000004204') as sent;
insert into p4_results
select 'l_s3_full', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g1', 'group_id')::uuid, '00000000-0000-0000-0000-000000004205') as sent;
reset role;

select is(
  array[pg_temp.result('l_s2', 'outcome'), pg_temp.result('l_s2', 'available_seats')],
  array['sent', '0'],
  'members plus pending invitations consume every seat'
);

select is(
  array[pg_temp.result('l_s3_full', 'outcome'), pg_temp.result('l_s3_full', 'error_code')],
  array['denied', 'GROUP_FULL'],
  'sending beyond open seats returns GROUP_FULL'
);

-- Eligible classmates.
select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'candidates', public.list_group_eligible_classmates(pg_temp.result('g1', 'group_id')::uuid);
reset role;

select is(
  (select array[row ->> 'availableSeats', row ->> 'cannotInviteReason'] from p4_results where label = 'candidates'),
  array['0', 'GROUP_FULL'],
  'candidate list reports no seats and the GROUP_FULL reason'
);

select is(
  (
    select jsonb_object_agg(
      classmate ->> 'displayName',
      (classmate ->> 'state') || coalesce(':' || (classmate ->> 'groupName'), '')
    )
    from p4_results, jsonb_array_elements(row -> 'classmates') as classmate
    where label = 'candidates'
  ),
  '{"Student S1": "pending", "Student S2": "pending", "Student S3": "eligible", "Student S4": "in_group:Root Team", "Student S5": "eligible"}'::jsonb,
  'candidates show eligible, pending, and already-grouped classmates and exclude the leader'
);

select ok(
  (select row::text not like '%@example.edu%' from p4_results where label = 'candidates'),
  'candidate list never exposes emails'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004203');
set local role authenticated;
select throws_ok(
  format($$select public.list_group_eligible_classmates(%L)$$, pg_temp.result('g1', 'group_id')),
  '42501',
  'NOT_GROUP_LEADER',
  'non-leaders cannot list invitation candidates'
);
reset role;

-- Cancel.
select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'cancel_s2', to_jsonb(cancelled)
from public.cancel_group_invitation(pg_temp.result('l_s2', 'invitation_id')::uuid) as cancelled;
insert into p4_results
select 'cancel_s2_again', to_jsonb(cancelled)
from public.cancel_group_invitation(pg_temp.result('l_s2', 'invitation_id')::uuid) as cancelled;
reset role;

select is(
  array[
    pg_temp.result('cancel_s2', 'outcome'),
    (
      select count(*)::text
      from public.notifications
      where recipient_id = '00000000-0000-0000-0000-000000004204'
        and type = 'group_invitation_cancelled'
    )
  ],
  array['cancelled', '1'],
  'leader cancels a pending invitation and the invitee is notified'
);

select is(pg_temp.result('cancel_s2_again', 'outcome'), 'cancelled', 'cancel is idempotent');

select pg_temp.act_as('00000000-0000-0000-0000-000000004203');
set local role authenticated;
select throws_ok(
  format($$select * from public.cancel_group_invitation(%L)$$, pg_temp.result('l_s1', 'invitation_id')),
  '42501',
  'NOT_GROUP_LEADER',
  'an invitee cannot cancel; they decline instead'
);

-- Invitation detail and board.
insert into p4_results
select 'detail_s1', public.get_group_invitation(pg_temp.result('l_s1', 'invitation_id')::uuid);
insert into p4_results
select 'board_s1', public.get_class_group_board('20000000-0000-0000-0000-000000004201');
reset role;

select is(
  (
    select jsonb_build_object(
      'status', row -> 'status',
      'canRespond', row -> 'viewer' -> 'canRespond',
      'memberCount', row -> 'group' -> 'memberCount',
      'inviter', row -> 'inviter' -> 'displayName'
    )
    from p4_results where label = 'detail_s1'
  ),
  '{"status": "pending", "canRespond": true, "memberCount": 1, "inviter": "Leader L"}'::jsonb,
  'invitee reads invitation detail with response eligibility'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004205');
set local role authenticated;
select throws_ok(
  format($$select public.get_group_invitation(%L)$$, pg_temp.result('l_s1', 'invitation_id')),
  '42501',
  'FORBIDDEN',
  'a classmate cannot read someone else''s invitation'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004208');
set local role authenticated;
select throws_ok(
  format($$select public.get_group_invitation(%L)$$, pg_temp.result('l_s1', 'invitation_id')),
  '42501',
  'FORBIDDEN',
  'a student of another class cannot read the invitation'
);
reset role;

select is(
  (select jsonb_array_length(row -> 'viewer' -> 'pendingInvitations') from p4_results where label = 'board_s1'),
  2,
  'the group board lists the viewer''s pending invitations'
);

-- Accept.
select pg_temp.act_as('00000000-0000-0000-0000-000000004204');
set local role authenticated;
insert into p4_results
select 'accept_cancelled', to_jsonb(accepted)
from public.accept_group_invitation(pg_temp.result('l_s2', 'invitation_id')::uuid) as accepted;
reset role;

select is(
  pg_temp.result('accept_cancelled', 'error_code'),
  'INVITATION_NOT_PENDING',
  'a cancelled invitation cannot be accepted'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004203');
set local role authenticated;
insert into p4_results
select 'accept_s1', to_jsonb(accepted)
from public.accept_group_invitation(pg_temp.result('l_s1', 'invitation_id')::uuid) as accepted;
insert into p4_results
select 'accept_s1_again', to_jsonb(accepted)
from public.accept_group_invitation(pg_temp.result('l_s1', 'invitation_id')::uuid) as accepted;
insert into p4_results
select 'accept_s4_cancelled', to_jsonb(accepted)
from public.accept_group_invitation(pg_temp.result('s4_s1', 'invitation_id')::uuid) as accepted;
reset role;

select is(
  array[pg_temp.result('accept_s1', 'outcome'), pg_temp.result('accept_s1', 'member_count')],
  array['accepted', '2'],
  'invitee accepts and joins the group'
);

select ok(
  exists (
    select 1
    from public.group_members as member
    join public.group_invitations as invitation on invitation.id = pg_temp.result('l_s1', 'invitation_id')::uuid
    where member.group_id = pg_temp.result('g1', 'group_id')::uuid
      and member.user_id = '00000000-0000-0000-0000-000000004203'
      and member.role = 'member'
      and member.status = 'active'
      and member.invited_by = '00000000-0000-0000-0000-000000004202'
      and invitation.status = 'accepted'
      and invitation.responded_at is not null
  ),
  'acceptance creates an active member row attributed to the inviter and marks the invitation accepted'
);

select is(
  (select status from public.group_invitations where id = pg_temp.result('s4_s1', 'invitation_id')::uuid),
  'cancelled',
  'accepting one invitation cancels the student''s other pending invitations'
);

select is(
  array[
    (select count(*) from public.notifications where recipient_id = '00000000-0000-0000-0000-000000004202' and type = 'group_invitation_accepted'),
    (select count(*) from public.notifications where recipient_id = '00000000-0000-0000-0000-000000004201' and type = 'group_minimum_reached')
  ],
  array[1, 1]::bigint[],
  'leader is notified of acceptance and teachers are notified when the minimum is reached'
);

select is(
  array[
    (
      select count(*)
      from public.group_membership_history
      where user_id = '00000000-0000-0000-0000-000000004203'
        and event_type = 'joined'
        and payload ->> 'source' = 'invitation'
    ),
    (
      select count(*)
      from public.research_events
      where event_name = 'group_invitation_accepted'
        and payload ->> 'group_member_count' = '2'
        and payload ? 'invite_age_s'
    )
  ],
  array[1, 1]::bigint[],
  'acceptance appends history and a group_invitation_accepted research event'
);

select is(
  array[
    pg_temp.result('accept_s1_again', 'outcome'),
    (
      select count(*)::text
      from public.group_members
      where class_id = '20000000-0000-0000-0000-000000004201'
        and user_id = '00000000-0000-0000-0000-000000004203'
        and status = 'active'
    )
  ],
  array['accepted', '1'],
  'accept replay is idempotent and never duplicates membership'
);

select is(
  pg_temp.result('accept_s4_cancelled', 'error_code'),
  'INVITATION_NOT_PENDING',
  'a lapsed invitation from another group cannot be accepted afterwards'
);

-- Decline.
select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'l_s3', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g1', 'group_id')::uuid, '00000000-0000-0000-0000-000000004205') as sent;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004205');
set local role authenticated;
insert into p4_results
select 'decline_s3', to_jsonb(declined)
from public.decline_group_invitation(pg_temp.result('l_s3', 'invitation_id')::uuid) as declined;
insert into p4_results
select 'decline_s3_again', to_jsonb(declined)
from public.decline_group_invitation(pg_temp.result('l_s3', 'invitation_id')::uuid) as declined;
insert into p4_results
select 'accept_declined', to_jsonb(accepted)
from public.accept_group_invitation(pg_temp.result('l_s3', 'invitation_id')::uuid) as accepted;
reset role;

select is(
  array[pg_temp.result('l_s3', 'outcome'), pg_temp.result('decline_s3', 'outcome')],
  array['sent', 'declined'],
  'invitee declines a pending invitation'
);

select is(
  array[
    (select count(*) from public.notifications where recipient_id = '00000000-0000-0000-0000-000000004202' and type = 'group_invitation_declined'),
    (select count(*) from public.research_events where event_name = 'group_invitation_declined' and payload ? 'invite_age_s')
  ],
  array[1, 1]::bigint[],
  'decline notifies the leader and writes a research event'
);

select is(pg_temp.result('decline_s3_again', 'outcome'), 'declined', 'decline is idempotent');

select is(
  pg_temp.result('accept_declined', 'error_code'),
  'INVITATION_NOT_PENDING',
  'a declined invitation cannot be accepted'
);

-- Expiry.
select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'l_s3_reinvite', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g1', 'group_id')::uuid, '00000000-0000-0000-0000-000000004205') as sent;
reset role;

alter table public.group_invitations disable trigger group_invitations_guard_update;
update public.group_invitations
set created_at = now() - interval '2 days',
    expires_at = now() - interval '1 day'
where id = pg_temp.result('l_s3_reinvite', 'invitation_id')::uuid;
alter table public.group_invitations enable trigger group_invitations_guard_update;

select pg_temp.act_as('00000000-0000-0000-0000-000000004205');
set local role authenticated;
insert into p4_results
select 'detail_expired', public.get_group_invitation(pg_temp.result('l_s3_reinvite', 'invitation_id')::uuid);
insert into p4_results
select 'accept_expired', to_jsonb(accepted)
from public.accept_group_invitation(pg_temp.result('l_s3_reinvite', 'invitation_id')::uuid) as accepted;
reset role;

select is(
  (select array[row ->> 'status', row -> 'viewer' ->> 'cannotRespondReason'] from p4_results where label = 'detail_expired'),
  array['expired', 'INVITATION_EXPIRED'],
  'a pending invitation past expiry reads as expired'
);

select is(
  array[
    pg_temp.result('accept_expired', 'error_code'),
    (select status from public.group_invitations where id = pg_temp.result('l_s3_reinvite', 'invitation_id')::uuid)
  ],
  array['INVITATION_EXPIRED', 'expired'],
  'accepting an expired invitation fails and commits the expired status'
);

-- Capacity and lock at acceptance time.
select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'l_s5', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g1', 'group_id')::uuid, '00000000-0000-0000-0000-000000004207') as sent;
reset role;

insert into public.group_members (class_id, group_id, user_id, role, invited_by)
values (
  '20000000-0000-0000-0000-000000004201',
  pg_temp.result('g1', 'group_id')::uuid,
  '00000000-0000-0000-0000-000000004205',
  'member',
  '00000000-0000-0000-0000-000000004202'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004207');
set local role authenticated;
insert into p4_results
select 'accept_full', to_jsonb(accepted)
from public.accept_group_invitation(pg_temp.result('l_s5', 'invitation_id')::uuid) as accepted;
reset role;

select is(
  array[pg_temp.result('l_s5', 'outcome'), pg_temp.result('accept_full', 'error_code')],
  array['sent', 'GROUP_FULL'],
  'acceptance revalidates capacity even for a valid pending invitation'
);

update public.groups
set status = 'locked',
    locked_at = now()
where id = pg_temp.result('g1', 'group_id')::uuid;

select pg_temp.act_as('00000000-0000-0000-0000-000000004207');
set local role authenticated;
insert into p4_results
select 'accept_locked', to_jsonb(accepted)
from public.accept_group_invitation(pg_temp.result('l_s5', 'invitation_id')::uuid) as accepted;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'leader_cancel_locked', to_jsonb(cancelled)
from public.cancel_group_invitation(pg_temp.result('l_s5', 'invitation_id')::uuid) as cancelled;
reset role;

select is(pg_temp.result('accept_locked', 'error_code'), 'GROUP_LOCKED', 'a locked group rejects acceptance');

select is(
  pg_temp.result('leader_cancel_locked', 'error_code'),
  'GROUP_LOCKED',
  'a leader cannot manage invitations of a locked group'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004201');
set local role authenticated;
insert into p4_results
select 'teacher_cancel_locked', to_jsonb(cancelled)
from public.cancel_group_invitation(pg_temp.result('l_s5', 'invitation_id')::uuid) as cancelled;
reset role;

select is(
  pg_temp.result('teacher_cancel_locked', 'outcome'),
  'cancelled',
  'a class teacher may cancel invitations of a locked group'
);

-- Formation closed.
update public.groups
set status = 'forming'
where id = pg_temp.result('g1', 'group_id')::uuid;

update public.group_members
set status = 'removed',
    left_at = now()
where group_id = pg_temp.result('g1', 'group_id')::uuid
  and user_id = '00000000-0000-0000-0000-000000004205';

update public.classes
set group_formation_status = 'closed'
where id = '20000000-0000-0000-0000-000000004201';

select pg_temp.act_as('00000000-0000-0000-0000-000000004202');
set local role authenticated;
insert into p4_results
select 'send_closed', to_jsonb(sent)
from public.send_group_invitation(pg_temp.result('g1', 'group_id')::uuid, '00000000-0000-0000-0000-000000004207') as sent;
insert into p4_results
select 'detail_leader', public.get_group_detail(pg_temp.result('g1', 'group_id')::uuid);
reset role;

select is(
  pg_temp.result('send_closed', 'error_code'),
  'GROUP_FORMATION_CLOSED',
  'leaders cannot invite while formation is closed'
);

-- Group detail.
select is(
  (
    select jsonb_build_object(
      'memberCount', row -> 'memberCount',
      'isLeader', row -> 'viewer' -> 'isLeader',
      'members', jsonb_array_length(row -> 'members')
    )
    from p4_results where label = 'detail_leader'
  ),
  '{"memberCount": 2, "isLeader": true, "members": 2}'::jsonb,
  'leader reads group detail with members'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000004203');
set local role authenticated;
select is(
  (
    select jsonb_build_object(
      'isMember', detail -> 'viewer' -> 'isMember',
      'isLeader', detail -> 'viewer' -> 'isLeader',
      'pendingInvitations', detail -> 'pendingInvitations'
    )
    from (select public.get_group_detail(pg_temp.result('g1', 'group_id')::uuid) as detail) as member_view
  ),
  '{"isMember": true, "isLeader": false, "pendingInvitations": []}'::jsonb,
  'members read group detail without pending invitations'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000004208');
set local role authenticated;
select throws_ok(
  format($$select public.get_group_detail(%L)$$, pg_temp.result('g1', 'group_id')),
  '42501',
  'FORBIDDEN',
  'students of another class cannot read group detail'
);
reset role;

select ok(
  exists (
    select 1
    from realtime.messages as message
    where message.topic = 'class:20000000-0000-0000-0000-000000004201:groups'
      and message.event = 'group.invitation_changed'
  ),
  'invitation operations emit class-group invalidation signals'
);

set local role anon;
select throws_ok(
  format($$select * from public.send_group_invitation(%L, '00000000-0000-0000-0000-000000004207')$$, pg_temp.result('g1', 'group_id')),
  '42501',
  'permission denied for function send_group_invitation',
  'anonymous callers cannot send invitations'
);
reset role;

select * from finish();
rollback;
