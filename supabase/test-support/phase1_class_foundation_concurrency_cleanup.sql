-- Remove every deterministic fixture and test-only database object.
begin;

drop function if exists private.p1_02_race_insert_membership(text, boolean);
drop table if exists private.p1_02_race_results;

delete from public.class_members
where class_id = '40000000-0000-0000-0000-000000000201';
delete from public.classes
where id = '40000000-0000-0000-0000-000000000201';
delete from public.school_memberships
where school_id = '10000000-0000-0000-0000-000000000201';
delete from public.schools
where id = '10000000-0000-0000-0000-000000000201';
delete from public.profiles
where id in (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202'
);
delete from auth.users
where id in (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202'
);

commit;
