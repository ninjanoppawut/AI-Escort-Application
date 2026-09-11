begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000401', 'teacher.race@example.edu', now(), '{}'::jsonb);

update public.profiles
set account_type = 'teacher'
where id = '00000000-0000-0000-0000-000000000401';

insert into public.schools (id, name, created_by)
values ('10000000-0000-0000-0000-000000000401', 'Race School', '00000000-0000-0000-0000-000000000401');

insert into public.school_memberships (school_id, user_id, role)
values ('10000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000401', 'teacher');

create table if not exists public.p1_03_race_results (
  contender text primary key,
  outcome text not null,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.p1_03_race_subjects (
  class_id uuid primary key,
  invite_id uuid not null
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000401', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);

insert into public.p1_03_race_subjects (class_id, invite_id)
select created.class_id, issued.invite_id
from public.create_class(
  '10000000-0000-0000-0000-000000000401',
  'Race Class',
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
cross join lateral public.issue_class_invite(created.class_id, now() + interval '1 day', 20) as issued;

create or replace function private.p1_03_race_rotate()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_invite_id uuid;
begin
  select invite_id into subject_invite_id from public.p1_03_race_subjects limit 1;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000401', 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );

  begin
    perform * from public.rotate_class_invite(subject_invite_id, now() + interval '2 days', 30);
    insert into public.p1_03_race_results (contender, outcome)
    values ('rotate', 'succeeded')
    on conflict (contender) do update set outcome = excluded.outcome, message = null, created_at = now();
  exception
    when others then
      insert into public.p1_03_race_results (contender, outcome, message)
      values ('rotate', 'failed', sqlerrm)
      on conflict (contender) do update set outcome = excluded.outcome, message = excluded.message, created_at = now();
  end;
end;
$$;

create or replace function private.p1_03_race_disable()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_invite_id uuid;
begin
  select invite_id into subject_invite_id from public.p1_03_race_subjects limit 1;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000401', 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );

  begin
    perform * from public.disable_class_invite(subject_invite_id);
    insert into public.p1_03_race_results (contender, outcome)
    values ('disable', 'succeeded')
    on conflict (contender) do update set outcome = excluded.outcome, message = null, created_at = now();
  exception
    when others then
      insert into public.p1_03_race_results (contender, outcome, message)
      values ('disable', 'failed', sqlerrm)
      on conflict (contender) do update set outcome = excluded.outcome, message = excluded.message, created_at = now();
  end;
end;
$$;

commit;
