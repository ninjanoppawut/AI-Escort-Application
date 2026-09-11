begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000501', 'teacher.join.race@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000502', 'student.join.race.a@example.edu', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000503', 'student.join.race.b@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000000501';

insert into public.schools (id, name, created_by)
values ('10000000-0000-0000-0000-000000000501', 'Join Race School', '00000000-0000-0000-0000-000000000501');

insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000501', 'teacher');

create table if not exists public.p1_04_race_subjects (
  class_id uuid primary key,
  invite_id uuid not null,
  invite_code text not null
);

create table if not exists public.p1_04_race_results (
  contender text primary key,
  outcome text not null,
  class_id uuid,
  membership_id uuid,
  message text,
  created_at timestamptz not null default now()
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000501', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);

insert into public.p1_04_race_subjects (class_id, invite_id, invite_code)
select created.class_id, issued.invite_id, issued.code
from public.create_class(
  '10000000-0000-0000-0000-000000000501',
  'Join Race Class',
  'Biology',
  '2569',
  '1',
  null,
  2,
  4,
  4,
  true,
  'open'
) as created
cross join lateral public.issue_class_invite(created.class_id, now() + interval '1 day', 1) as issued;

create or replace function private.p1_04_race_join(
  contender_name text,
  actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_code text;
  joined_row record;
begin
  select invite_code into subject_code from public.p1_04_race_subjects limit 1;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', actor_user_id, 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );

  begin
    select * into joined_row
    from public.join_class_with_invite(subject_code, null);

    insert into public.p1_04_race_results (
      contender,
      outcome,
      class_id,
      membership_id
    )
    values (
      contender_name,
      'succeeded',
      joined_row.class_id,
      joined_row.membership_id
    )
    on conflict (contender) do update
    set outcome = excluded.outcome,
        class_id = excluded.class_id,
        membership_id = excluded.membership_id,
        message = null,
        created_at = now();
  exception
    when others then
      insert into public.p1_04_race_results (contender, outcome, message)
      values (contender_name, 'failed', sqlerrm)
      on conflict (contender) do update
      set outcome = excluded.outcome,
          message = excluded.message,
          created_at = now();
  end;
end;
$$;

commit;
