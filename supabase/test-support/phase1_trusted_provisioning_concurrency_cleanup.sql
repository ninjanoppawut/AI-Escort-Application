-- Remove every deterministic fixture and test-only database object.
begin;

drop function if exists private.p1_02a_race_consume(text);
drop table if exists private.p1_02a_race_results;

delete from public.audit_logs
where actor_id in (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302'
);
delete from public.research_events
where actor_id = '00000000-0000-0000-0000-000000000302';
delete from public.teacher_invitations
where id = '20000000-0000-0000-0000-000000000301';
delete from public.school_memberships
where school_id = '10000000-0000-0000-0000-000000000301';
delete from public.schools
where id = '10000000-0000-0000-0000-000000000301';
delete from public.platform_admins
where user_id = '00000000-0000-0000-0000-000000000301';
delete from public.profiles
where id in (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302'
);
delete from auth.users
where id in (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302'
);

commit;
