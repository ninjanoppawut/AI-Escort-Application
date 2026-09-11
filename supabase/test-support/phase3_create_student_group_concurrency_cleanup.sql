drop function if exists private.p3_02_race_create(integer, text, uuid);
drop table if exists public.p3_02_race_results;

delete from public.research_events
where actor_id in (
  '00000000-0000-0000-0000-000000003501',
  '00000000-0000-0000-0000-000000003502',
  '00000000-0000-0000-0000-000000003503'
);
delete from public.audit_logs
where actor_id in (
  '00000000-0000-0000-0000-000000003501',
  '00000000-0000-0000-0000-000000003502',
  '00000000-0000-0000-0000-000000003503'
);

-- Membership history is append-only for application roles; the harness owner
-- removes only its own synthetic rows.
alter table public.group_membership_history disable trigger group_membership_history_prevent_delete;
delete from public.group_membership_history
where class_id in (
  select id from public.classes where school_id = '10000000-0000-0000-0000-000000003501'
);
alter table public.group_membership_history enable trigger group_membership_history_prevent_delete;

delete from public.student_group_creation_claims
where class_id in (
  select id from public.classes where school_id = '10000000-0000-0000-0000-000000003501'
);
alter table public.group_members disable trigger group_members_one_active_leader;
delete from public.group_members
where class_id in (
  select id from public.classes where school_id = '10000000-0000-0000-0000-000000003501'
);
alter table public.group_members enable trigger group_members_one_active_leader;
delete from public.groups
where class_id in (
  select id from public.classes where school_id = '10000000-0000-0000-0000-000000003501'
);
delete from public.class_members
where class_id in (
  select id from public.classes where school_id = '10000000-0000-0000-0000-000000003501'
);
delete from public.classes
where school_id = '10000000-0000-0000-0000-000000003501';
delete from public.school_memberships
where school_id = '10000000-0000-0000-0000-000000003501';
delete from public.schools
where id = '10000000-0000-0000-0000-000000003501';
delete from public.profiles
where id in (
  '00000000-0000-0000-0000-000000003501',
  '00000000-0000-0000-0000-000000003502',
  '00000000-0000-0000-0000-000000003503'
);
delete from auth.users
where id in (
  '00000000-0000-0000-0000-000000003501',
  '00000000-0000-0000-0000-000000003502',
  '00000000-0000-0000-0000-000000003503'
);
