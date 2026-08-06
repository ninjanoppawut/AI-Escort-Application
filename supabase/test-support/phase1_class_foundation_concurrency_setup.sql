-- Setup for the credential-free two-connection P1-02 race harness.
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

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-000000000201',
    'race.teacher@example.edu',
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    'race.student@example.edu',
    now(),
    '{}'::jsonb
  );

update public.profiles
set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000000201';

insert into public.schools (id, name, created_by)
values (
  '10000000-0000-0000-0000-000000000201',
  'Membership race school',
  '00000000-0000-0000-0000-000000000201'
);

insert into public.school_memberships (school_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000201',
    'teacher'
  ),
  (
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000202',
    'student'
  );

insert into public.classes (id, school_id, name, created_by)
values (
  '40000000-0000-0000-0000-000000000201',
  '10000000-0000-0000-0000-000000000201',
  'Membership race class',
  '00000000-0000-0000-0000-000000000201'
);

insert into public.class_members (class_id, user_id, role)
values (
  '40000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000201',
  'teacher'
);

create table private.p1_02_race_results (
  contender text primary key,
  outcome text not null
);

create function private.p1_02_race_insert_membership(
  contender_name text,
  hold_key boolean
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  result text;
begin
  begin
    insert into public.class_members (class_id, user_id, role)
    values (
      '40000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000202',
      'student'
    );

    if hold_key then
      perform pg_catalog.pg_sleep(3);
    end if;

    result := 'inserted';
  exception
    when unique_violation then
      result := sqlstate;
  end;

  insert into private.p1_02_race_results (contender, outcome)
  values (contender_name, result);

  return result;
end;
$$;

revoke execute on function private.p1_02_race_insert_membership(text, boolean)
  from public, anon, authenticated;

commit;
