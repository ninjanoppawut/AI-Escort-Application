-- Fail closed unless one consume wins, one replay loses, and the trusted state is singular.
do $$
declare
  consumed_count bigint;
  replay_loser_count bigint;
  final_membership_count bigint;
  final_event_count bigint;
  final_invitation_count bigint;
begin
  select count(*)
  into consumed_count
  from private.p1_02a_race_results
  where outcome = 'consumed';

  select count(*)
  into replay_loser_count
  from private.p1_02a_race_results
  where outcome = 'TEACHER_INVITE_INVALID';

  select count(*)
  into final_membership_count
  from public.school_memberships
  where school_id = '10000000-0000-0000-0000-000000000301'
    and user_id = '00000000-0000-0000-0000-000000000302'
    and role = 'teacher'
    and status = 'active';

  select count(*)
  into final_event_count
  from public.research_events
  where event_name = 'teacher_invitation_consumed'
    and actor_id = '00000000-0000-0000-0000-000000000302'
    and school_id = '10000000-0000-0000-0000-000000000301';

  select count(*)
  into final_invitation_count
  from public.teacher_invitations
  where id = '20000000-0000-0000-0000-000000000301'
    and status = 'accepted'
    and accepted_by = '00000000-0000-0000-0000-000000000302';

  if consumed_count <> 1 then
    raise exception 'P1_02A_RACE_CONSUMED_COUNT_INVALID';
  end if;

  if replay_loser_count <> 1 then
    raise exception 'P1_02A_RACE_REPLAY_LOSER_COUNT_INVALID';
  end if;

  if final_membership_count <> 1 then
    raise exception 'P1_02A_RACE_MEMBERSHIP_COUNT_INVALID';
  end if;

  if final_event_count <> 1 then
    raise exception 'P1_02A_RACE_EVENT_COUNT_INVALID';
  end if;

  if final_invitation_count <> 1 then
    raise exception 'P1_02A_RACE_INVITATION_COUNT_INVALID';
  end if;
end;
$$;
