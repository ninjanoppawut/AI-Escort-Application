do $$
declare
  subject_class_id uuid;
  subject_invite_id uuid;
  active_invites integer;
  rotated_events integer;
  disabled_events integer;
begin
  select class_id, invite_id
  into subject_class_id, subject_invite_id
  from public.p1_03_race_subjects
  limit 1;

  if (select count(*) from public.p1_03_race_results) <> 2 then
    raise exception 'Expected two race result rows, found %',
      (select count(*) from public.p1_03_race_results);
  end if;

  if (select status from public.class_invites where id = subject_invite_id) <> 'disabled' then
    raise exception 'Superseded invitation was not disabled';
  end if;

  select count(*)
  into active_invites
  from public.class_invites
  where class_id = subject_class_id
    and status = 'active';

  if active_invites not in (0, 1) then
    raise exception 'Expected zero or one replacement active invite, found %', active_invites;
  end if;

  select count(*)
  into rotated_events
  from public.research_events
  where class_id = subject_class_id
    and event_name = 'class_invitation_rotated';

  select count(*)
  into disabled_events
  from public.research_events
  where class_id = subject_class_id
    and event_name = 'class_invitation_disabled';

  if not (
    (rotated_events = 1 and disabled_events = 0 and active_invites = 1)
    or (rotated_events = 0 and disabled_events = 1 and active_invites = 0)
  ) then
    raise exception 'Inconsistent race event state: rotated %, disabled %, active %',
      rotated_events, disabled_events, active_invites;
  end if;

  if exists (
    select 1
    from public.class_invites
    where class_id = subject_class_id
      and status = 'active'
      and disabled_at is not null
  ) then
    raise exception 'Active invite has disabled metadata';
  end if;
end;
$$;
