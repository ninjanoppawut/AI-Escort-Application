begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000003501', 'teacher.group.race@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003502', 'student.group.race.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000003503', 'student.group.race.b@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000003501';

insert into public.schools (id, name, created_by)
values ('10000000-0000-0000-0000-000000003501', 'Group Race School', '00000000-0000-0000-0000-000000003501');

insert into public.school_memberships (school_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000003501', '00000000-0000-0000-0000-000000003501', 'teacher'),
  ('10000000-0000-0000-0000-000000003501', '00000000-0000-0000-0000-000000003502', 'student'),
  ('10000000-0000-0000-0000-000000003501', '00000000-0000-0000-0000-000000003503', 'student');

-- One class per race round; each class has exactly one group slot.
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
select
  ('20000000-0000-0000-0000-0000000035' || lpad(round_number::text, 2, '0'))::uuid,
  '10000000-0000-0000-0000-000000003501',
  'Group Race Class ' || round_number,
  1,
  4,
  1,
  true,
  'open',
  '00000000-0000-0000-0000-000000003501'
from generate_series(1, 10) as round_number;

insert into public.class_members (class_id, user_id, role)
select class_row.id, member.user_id, member.role
from public.classes as class_row
cross join (
  values
    ('00000000-0000-0000-0000-000000003501'::uuid, 'teacher'),
    ('00000000-0000-0000-0000-000000003502'::uuid, 'student'),
    ('00000000-0000-0000-0000-000000003503'::uuid, 'student')
) as member(user_id, role)
where class_row.school_id = '10000000-0000-0000-0000-000000003501';

create table if not exists public.p3_02_race_results (
  round_number integer not null,
  contender text not null,
  outcome text not null,
  error_code text,
  group_id uuid,
  message text,
  created_at timestamptz not null default now(),
  primary key (round_number, contender)
);

create or replace function private.p3_02_race_create(
  round_number integer,
  contender_name text,
  actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_class_id uuid :=
    ('20000000-0000-0000-0000-0000000035' || lpad(round_number::text, 2, '0'))::uuid;
  created_row record;
begin
  -- Contenders queue behind the harness gate so both reach the RPC together.
  perform pg_advisory_lock_shared(3502);
  perform pg_advisory_unlock_shared(3502);

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', actor_user_id, 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );

  begin
    select * into created_row
    from public.create_student_group(subject_class_id, contender_name || ' team', null);

    insert into public.p3_02_race_results (round_number, contender, outcome, error_code, group_id)
    values (round_number, contender_name, created_row.outcome, created_row.error_code, created_row.group_id);
  exception
    when others then
      insert into public.p3_02_race_results (round_number, contender, outcome, message)
      values (round_number, contender_name, 'raised', sqlerrm);
  end;
end;
$$;

commit;
