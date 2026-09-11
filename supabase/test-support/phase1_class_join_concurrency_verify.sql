do $$
declare
  subject_class_id uuid;
  subject_invite_id uuid;
  success_count integer;
  failure_count integer;
  member_count integer;
  school_member_count integer;
  used_count_value integer;
  join_event_count integer;
begin
  select class_id, invite_id
  into subject_class_id, subject_invite_id
  from public.p1_04_race_subjects
  limit 1;

  select count(*) filter (where outcome = 'succeeded'),
         count(*) filter (where outcome = 'failed')
  into success_count, failure_count
  from public.p1_04_race_results;

  if success_count <> 1 or failure_count <> 1 then
    raise exception 'Expected one successful join and one failed join, found success %, failure %',
      success_count, failure_count;
  end if;

  if not exists (
    select 1
    from public.p1_04_race_results
    where outcome = 'failed'
      and message = 'INVITE_INVALID'
  ) then
    raise exception 'Expected failed contender to receive INVITE_INVALID';
  end if;

  select count(*)
  into member_count
  from public.class_members
  where class_id = subject_class_id
    and role = 'student'
    and status = 'active';

  if member_count <> 1 then
    raise exception 'Expected one active student class member, found %',
      member_count;
  end if;

  select count(*)
  into school_member_count
  from public.school_memberships
  where school_id = '10000000-0000-0000-0000-000000000501'
    and role = 'student'
    and status = 'active';

  if school_member_count <> 1 then
    raise exception 'Expected one active student school member, found %',
      school_member_count;
  end if;

  select used_count
  into used_count_value
  from public.class_invites
  where id = subject_invite_id;

  if used_count_value <> 1 then
    raise exception 'Expected invite used_count to stop at one, found %',
      used_count_value;
  end if;

  select count(*)
  into join_event_count
  from public.research_events
  where class_id = subject_class_id
    and event_name = 'class_joined';

  if join_event_count <> 1 then
    raise exception 'Expected one class_joined research event, found %',
      join_event_count;
  end if;
end;
$$;
