-- Setup for the credential-free two-connection P1-02A invitation-consumption race harness.
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

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-000000000301',
    'race.admin@example.edu',
    now(),
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    'race.teacher@example.edu',
    now(),
    '{}'::jsonb
  );

insert into public.platform_admins (user_id, reason)
values (
  '00000000-0000-0000-0000-000000000301',
  'Deterministic P1-02A race bootstrap'
);

insert into public.schools (id, name, created_by)
values (
  '10000000-0000-0000-0000-000000000301',
  'Teacher invitation race school',
  '00000000-0000-0000-0000-000000000301'
);

insert into public.teacher_invitations (
  id,
  school_id,
  email,
  token_hash,
  created_by,
  expires_at
)
values (
  '20000000-0000-0000-0000-000000000301',
  '10000000-0000-0000-0000-000000000301',
  'race.teacher@example.edu',
  private.hash_invitation_token('p1-02a-race-token'),
  '00000000-0000-0000-0000-000000000301',
  now() + interval '1 day'
);

create table private.p1_02a_race_results (
  contender text primary key,
  outcome text not null
);

create function private.p1_02a_race_consume(contender_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  result text;
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', '00000000-0000-0000-0000-000000000302',
      'role', 'authenticated',
      'aal', 'aal1'
    )::text,
    true
  );

  begin
    perform *
    from public.consume_teacher_invitation('p1-02a-race-token');
    result := 'consumed';
  exception
    when others then
      result := sqlerrm;
  end;

  insert into private.p1_02a_race_results (contender, outcome)
  values (contender_name, result);

  return result;
end;
$$;

revoke execute on function private.p1_02a_race_consume(text)
  from public, anon, authenticated;

commit;
