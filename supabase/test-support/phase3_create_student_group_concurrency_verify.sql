do $$
declare
  round_row record;
  group_count integer;
  leader_count integer;
  claim_count integer;
  failed_event_count integer;
  created_event_count integer;
begin
  if (select count(*) from public.p3_02_race_results) <> 20 then
    raise exception 'Expected 20 contender results across 10 rounds, found %',
      (select count(*) from public.p3_02_race_results);
  end if;

  if exists (select 1 from public.p3_02_race_results where outcome = 'raised') then
    raise exception 'A contender raised unexpectedly: %',
      (select message from public.p3_02_race_results where outcome = 'raised' limit 1);
  end if;

  for round_row in
    select
      result.round_number,
      ('20000000-0000-0000-0000-0000000035' || lpad(result.round_number::text, 2, '0'))::uuid as class_id,
      count(*) filter (where result.outcome = 'created') as created_count,
      count(*) filter (
        where result.outcome = 'denied' and result.error_code = 'GROUP_LIMIT_REACHED'
      ) as limit_count
    from public.p3_02_race_results as result
    group by result.round_number
  loop
    if round_row.created_count <> 1 or round_row.limit_count <> 1 then
      raise exception 'Round %: expected one created and one GROUP_LIMIT_REACHED, found created %, limit %',
        round_row.round_number, round_row.created_count, round_row.limit_count;
    end if;

    select count(*) into group_count
    from public.groups
    where class_id = round_row.class_id
      and deleted_at is null
      and status <> 'archived';

    if group_count <> 1 then
      raise exception 'Round %: expected one current group, found %',
        round_row.round_number, group_count;
    end if;

    select count(*) into leader_count
    from public.group_members
    where class_id = round_row.class_id
      and role = 'leader'
      and status = 'active';

    if leader_count <> 1 then
      raise exception 'Round %: expected one active leader, found %',
        round_row.round_number, leader_count;
    end if;

    select count(*) into claim_count
    from public.student_group_creation_claims
    where class_id = round_row.class_id
      and status = 'claimed';

    if claim_count <> 1 then
      raise exception 'Round %: expected one creation claim, found %',
        round_row.round_number, claim_count;
    end if;

    select
      count(*) filter (where event_name = 'group_created'),
      count(*) filter (
        where event_name = 'group_creation_failed'
          and payload ->> 'error_code' = 'GROUP_LIMIT_REACHED'
      )
    into created_event_count, failed_event_count
    from public.research_events
    where class_id = round_row.class_id;

    if created_event_count <> 1 or failed_event_count <> 1 then
      raise exception 'Round %: expected one group_created and one group_creation_failed event, found % and %',
        round_row.round_number, created_event_count, failed_event_count;
    end if;
  end loop;
end;
$$;
