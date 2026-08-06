-- Fail closed unless one insert wins, one loses, and one row remains.
do $$
declare
  first_outcome text;
  second_outcome text;
  final_membership_count bigint;
begin
  select outcome
  into first_outcome
  from private.p1_02_race_results
  where contender = 'a';

  select outcome
  into second_outcome
  from private.p1_02_race_results
  where contender = 'b';

  select count(*)
  into final_membership_count
  from public.class_members
  where class_id = '40000000-0000-0000-0000-000000000201'
    and user_id = '00000000-0000-0000-0000-000000000202';

  if first_outcome <> 'inserted' then
    raise exception 'P1_02_RACE_FIRST_CONTENDER_FAILED';
  end if;

  if second_outcome <> '23505' then
    raise exception 'P1_02_RACE_SECOND_CONTENDER_DID_NOT_LOSE';
  end if;

  if final_membership_count <> 1 then
    raise exception 'P1_02_RACE_FINAL_STATE_INVALID';
  end if;
end;
$$;
