drop function if exists private.p1_03_race_rotate();
drop function if exists private.p1_03_race_disable();
drop table if exists public.p1_03_race_results;
drop table if exists public.p1_03_race_subjects;

delete from public.research_events
where actor_id = '00000000-0000-0000-0000-000000000401';
delete from public.audit_logs
where actor_id = '00000000-0000-0000-0000-000000000401';
delete from public.class_invites
where created_by = '00000000-0000-0000-0000-000000000401';
delete from public.class_members
where user_id = '00000000-0000-0000-0000-000000000401';
delete from public.classes
where created_by = '00000000-0000-0000-0000-000000000401';
delete from public.school_memberships
where user_id = '00000000-0000-0000-0000-000000000401';
delete from public.schools
where created_by = '00000000-0000-0000-0000-000000000401';
delete from public.profiles
where id = '00000000-0000-0000-0000-000000000401';
delete from auth.users
where id = '00000000-0000-0000-0000-000000000401';
