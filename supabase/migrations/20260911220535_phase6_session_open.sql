begin;

-- Research events gain relational activity and session references
-- (DATABASE_DESIGN §14, RESEARCH_EVENT_DICTIONARY `session_opened`).
alter table public.research_events
  add column activity_id uuid references public.activities (id) on delete restrict,
  add column session_id uuid references public.exploration_sessions (id) on delete restrict;

create index research_events_activity_time_idx
  on public.research_events (activity_id, occurred_at desc, id desc)
  where activity_id is not null;
create index research_events_session_time_idx
  on public.research_events (session_id, occurred_at desc, id desc)
  where session_id is not null;

create function private.insert_session_research_event(
  event_name text,
  event_actor_id uuid,
  event_school_id uuid,
  event_class_id uuid,
  event_activity_id uuid,
  event_session_id uuid,
  event_payload jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.research_events (
    event_name, schema_version, actor_id, school_id, class_id, activity_id, session_id, occurred_at, payload
  )
  values (
    event_name, 1, event_actor_id, event_school_id, event_class_id, event_activity_id, event_session_id,
    now(), coalesce(event_payload, '{}'::jsonb)
  );
$$;

-- Create a scheduled session (P6-03) -------------------------------------------

create function public.create_exploration_session(
  target_activity_id uuid,
  session_title text,
  scheduled_start timestamptz default null
)
returns table(
  outcome text,
  error_code text,
  session_id uuid,
  class_id uuid,
  activity_version_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  activity_row public.activities%rowtype;
  published_version public.activity_versions%rowtype;
  trimmed_title text := btrim(coalesce(session_title, ''));
  inserted_session public.exploration_sessions%rowtype;
begin
  actor_profile := private.require_active_verified_actor();

  select * into activity_row from public.activities as activity where activity.id = target_activity_id;
  if activity_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  class_row := private.require_class_teacher(activity_row.class_id, false);

  if char_length(trimmed_title) not between 1 and 120 then
    return query select 'denied'::text, 'VALIDATION_FAILED'::text, null::uuid, class_row.id, null::uuid;
    return;
  end if;

  select * into published_version
  from public.activity_versions as version
  where version.activity_id = activity_row.id and version.status = 'published';

  if published_version.id is null then
    return query select 'denied'::text, 'ACTIVITY_NOT_PUBLISHED'::text, null::uuid, class_row.id, null::uuid;
    return;
  end if;

  insert into public.exploration_sessions (
    class_id, activity_id, activity_version_id, title, scheduled_at, created_by
  )
  values (
    class_row.id, activity_row.id, published_version.id, trimmed_title, scheduled_start, actor_profile.id
  )
  returning * into inserted_session;

  perform private.insert_audit_log(
    actor_profile.id, 'session_created', 'exploration_session', inserted_session.id,
    class_row.school_id, class_row.id, 'succeeded',
    jsonb_build_object('activity_version_number', published_version.version_number)
  );

  return query
  select 'created'::text, null::text, inserted_session.id, class_row.id, published_version.id;
end;
$$;

-- Open with an immutable snapshot (P6-03, D-043) --------------------------------

create function public.open_exploration_session(target_session_id uuid, group_order uuid[])
returns table(
  outcome text,
  error_code text,
  session_id uuid,
  group_count integer,
  participant_count integer,
  error_details jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  session_row public.exploration_sessions%rowtype;
  running_session_id uuid;
  eligible_ids uuid[];
  group_total integer;
  participant_total integer;
  version_number_value integer;
begin
  actor_profile := private.require_active_verified_actor();

  select * into session_row from public.exploration_sessions as candidate where candidate.id = target_session_id;
  if session_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  -- The class lock serializes opening with group creation; group row locks
  -- below serialize it with moves, invitations, and removals.
  class_row := private.require_class_teacher(session_row.class_id, true);

  select * into session_row
  from public.exploration_sessions as candidate
  where candidate.id = target_session_id
  for update;

  if session_row.status in ('open', 'paused') then
    return query
    select 'opened'::text, null::text, session_row.id,
      (select count(*)::integer from public.exploration_session_groups as session_group where session_group.session_id = session_row.id),
      (select count(*)::integer from public.session_participants as participant where participant.session_id = session_row.id),
      null::jsonb;
    return;
  end if;

  if session_row.status <> 'scheduled' then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, session_row.id, 0, 0,
      jsonb_build_object('reason', 'session_completed');
    return;
  end if;

  select candidate.id into running_session_id
  from public.exploration_sessions as candidate
  where candidate.class_id = class_row.id
    and candidate.status in ('open', 'paused')
  limit 1;

  if running_session_id is not null then
    return query select 'denied'::text, 'SESSION_ALREADY_RUNNING'::text, session_row.id, 0, 0,
      jsonb_build_object('runningSessionId', running_session_id);
    return;
  end if;

  perform 1
  from public.groups as candidate
  where candidate.class_id = class_row.id
    and candidate.deleted_at is null
    and candidate.status <> 'archived'
  order by candidate.id
  for update;

  select coalesce(array_agg(candidate.id order by candidate.created_at, candidate.id), '{}'::uuid[])
  into eligible_ids
  from public.groups as candidate
  where candidate.class_id = class_row.id
    and candidate.deleted_at is null
    and candidate.status <> 'archived'
    and exists (
      select 1
      from public.group_members as member
      where member.group_id = candidate.id
        and member.status = 'active'
    );

  if cardinality(eligible_ids) = 0 then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, session_row.id, 0, 0,
      jsonb_build_object('reason', 'no_groups');
    return;
  end if;

  if group_order is null
    or cardinality(group_order) <> cardinality(eligible_ids)
    or (select count(distinct ordered.group_ref) from unnest(group_order) as ordered(group_ref)) <> cardinality(group_order)
    or exists (
      select ordered.group_ref from unnest(group_order) as ordered(group_ref)
      except
      select eligible.group_ref from unnest(eligible_ids) as eligible(group_ref)
    ) then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, session_row.id, 0, 0,
      jsonb_build_object('reason', 'queue_mismatch', 'eligibleGroupIds', to_jsonb(eligible_ids));
    return;
  end if;

  insert into public.exploration_session_groups (session_id, class_id, group_id, queue_position)
  select session_row.id, class_row.id, ordered.group_ref, ordered.queue_rank::integer
  from unnest(group_order) with ordinality as ordered(group_ref, queue_rank);

  get diagnostics group_total = row_count;

  insert into public.session_participants (session_id, class_id, session_group_id, user_id, role_at_start)
  select session_row.id, class_row.id, session_group.id, member.user_id, member.role
  from public.exploration_session_groups as session_group
  join public.group_members as member
    on member.group_id = session_group.group_id
   and member.status = 'active'
  where session_group.session_id = session_row.id;

  get diagnostics participant_total = row_count;

  update public.exploration_sessions as candidate
  set status = 'open',
      opened_at = now(),
      opened_by = actor_profile.id
  where candidate.id = session_row.id;

  insert into public.session_events (session_id, class_id, actor_id, event_type, from_status, to_status, payload)
  values (
    session_row.id, class_row.id, actor_profile.id, 'session_opened', 'scheduled', 'open',
    jsonb_build_object('group_count', group_total, 'participant_count', participant_total)
  );

  select version.version_number into version_number_value
  from public.activity_versions as version
  where version.id = session_row.activity_version_id;

  perform private.insert_session_research_event(
    'session_opened', actor_profile.id, class_row.school_id, class_row.id,
    session_row.activity_id, session_row.id,
    jsonb_build_object(
      'participant_count', participant_total,
      'group_count', group_total,
      'activity_version', version_number_value
    )
  );

  perform private.insert_audit_log(
    actor_profile.id, 'session_opened', 'exploration_session', session_row.id,
    class_row.school_id, class_row.id, 'succeeded',
    jsonb_build_object('group_count', group_total, 'participant_count', participant_total)
  );

  return query
  select 'opened'::text, null::text, session_row.id, group_total, participant_total, null::jsonb;
end;
$$;

-- Read models --------------------------------------------------------------------

create function public.get_session_setup(target_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  session_row public.exploration_sessions%rowtype;
  version_row public.activity_versions%rowtype;
begin
  actor_profile := private.require_active_verified_actor();

  select * into session_row from public.exploration_sessions as candidate where candidate.id = target_session_id;
  if session_row.id is null
    or not (select private.is_active_class_teacher(actor_profile.id, session_row.class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into class_row from public.classes as class where class.id = session_row.class_id;
  select * into version_row from public.activity_versions as version where version.id = session_row.activity_version_id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', session_row.id,
      'classId', session_row.class_id,
      'title', session_row.title,
      'status', session_row.status,
      'scheduledAt', session_row.scheduled_at,
      'openedAt', session_row.opened_at,
      'createdAt', session_row.created_at
    ),
    'className', class_row.name,
    'activity', jsonb_build_object(
      'id', session_row.activity_id,
      'title', version_row.title,
      'versionNumber', version_row.version_number,
      'versionStatus', version_row.status,
      'hasBoundary', exists (
        select 1 from public.activity_boundaries as boundary_row
        where boundary_row.activity_version_id = version_row.id
      ),
      'hasRoute', exists (
        select 1 from public.activity_routes as route_row
        where route_row.activity_version_id = version_row.id
      ),
      'checkpointCount', (
        select count(*) from public.activity_checkpoints as checkpoint_row
        where checkpoint_row.activity_version_id = version_row.id
      )
    ),
    'runningSession', (
      select jsonb_build_object('id', other.id, 'title', other.title)
      from public.exploration_sessions as other
      where other.class_id = session_row.class_id
        and other.status in ('open', 'paused')
        and other.id <> session_row.id
      limit 1
    ),
    'eligibleGroups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', group_row.id,
          'name', group_row.name,
          'status', group_row.status,
          'memberCount', counts.member_count,
          'leaderName', (
            select profile.display_name
            from public.group_members as member
            join public.profiles as profile on profile.id = member.user_id
            where member.group_id = group_row.id and member.status = 'active' and member.role = 'leader'
            limit 1
          )
        )
        order by group_row.created_at, group_row.id
      )
      from public.groups as group_row
      cross join lateral (
        select count(*) as member_count
        from public.group_members as member
        where member.group_id = group_row.id and member.status = 'active'
      ) as counts
      where group_row.class_id = session_row.class_id
        and group_row.deleted_at is null
        and group_row.status <> 'archived'
        and counts.member_count > 0
    ), '[]'::jsonb),
    'excludedGroups', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', group_row.id, 'name', group_row.name, 'reason', 'no_members')
        order by group_row.created_at, group_row.id
      )
      from public.groups as group_row
      where group_row.class_id = session_row.class_id
        and group_row.deleted_at is null
        and group_row.status <> 'archived'
        and not exists (
          select 1 from public.group_members as member
          where member.group_id = group_row.id and member.status = 'active'
        )
    ), '[]'::jsonb),
    'unassignedStudentCount', (
      select count(*)
      from public.class_members as membership
      where membership.class_id = session_row.class_id
        and membership.role = 'student'
        and membership.status = 'active'
        and not exists (
          select 1 from public.group_members as member
          where member.class_id = session_row.class_id
            and member.user_id = membership.user_id
            and member.status = 'active'
        )
    ),
    'queue', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sessionGroupId', session_group.id,
          'groupId', session_group.group_id,
          'groupName', group_row.name,
          'queuePosition', session_group.queue_position,
          'status', session_group.status,
          'participants', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'userId', participant.user_id,
                'displayName', profile.display_name,
                'roleAtStart', participant.role_at_start,
                'participationStatus', participant.participation_status
              )
              order by (participant.role_at_start = 'leader') desc, profile.display_name, participant.user_id
            )
            from public.session_participants as participant
            join public.profiles as profile on profile.id = participant.user_id
            where participant.session_group_id = session_group.id
          ), '[]'::jsonb)
        )
        order by session_group.queue_position
      )
      from public.exploration_session_groups as session_group
      join public.groups as group_row on group_row.id = session_group.group_id
      where session_group.session_id = session_row.id
    ), '[]'::jsonb),
    'participantCount', (
      select count(*) from public.session_participants as participant
      where participant.session_id = session_row.id
    ),
    'refreshedAt', now()
  );
end;
$$;

create function public.list_class_sessions(target_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  class_row public.classes%rowtype;
  viewer_is_teacher boolean := false;
begin
  actor_profile := private.require_active_verified_actor();

  select * into class_row from public.classes as class where class.id = target_class_id;
  if class_row.id is not null then
    viewer_is_teacher := (select private.is_active_class_teacher(actor_profile.id, class_row.id));
  end if;

  if class_row.id is null or not (
    viewer_is_teacher
    or exists (
      select 1 from public.class_members as membership
      where membership.class_id = class_row.id
        and membership.user_id = actor_profile.id
        and membership.status = 'active'
    )
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return jsonb_build_object(
    'classId', class_row.id,
    'className', class_row.name,
    'viewerRole', case when viewer_is_teacher then 'teacher' else 'student' end,
    'items', coalesce((
      select jsonb_agg(entry.payload order by entry.sort_at desc, entry.session_ref desc)
      from (
        select
          session_row.id as session_ref,
          coalesce(session_row.scheduled_at, session_row.created_at) as sort_at,
          jsonb_build_object(
            'id', session_row.id,
            'title', session_row.title,
            'status', session_row.status,
            'scheduledAt', session_row.scheduled_at,
            'openedAt', session_row.opened_at,
            'completedAt', session_row.completed_at,
            'activityId', session_row.activity_id,
            'activityTitle', version.title,
            'groupCount', (
              select count(*) from public.exploration_session_groups as session_group
              where session_group.session_id = session_row.id
            ),
            'participantCount', (
              select count(*) from public.session_participants as participant
              where participant.session_id = session_row.id
            ),
            'viewerIsParticipant', exists (
              select 1 from public.session_participants as participant
              where participant.session_id = session_row.id
                and participant.user_id = actor_profile.id
            )
          ) as payload
        from public.exploration_sessions as session_row
        join public.activity_versions as version on version.id = session_row.activity_version_id
        where session_row.class_id = class_row.id
        order by coalesce(session_row.scheduled_at, session_row.created_at) desc, session_row.id desc
        limit 100
      ) as entry
    ), '[]'::jsonb),
    'refreshedAt', now()
  );
end;
$$;

revoke execute on function private.insert_session_research_event(text, uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.create_exploration_session(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.open_exploration_session(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.get_session_setup(uuid) from public, anon, authenticated;
revoke execute on function public.list_class_sessions(uuid) from public, anon, authenticated;

grant execute on function public.create_exploration_session(uuid, text, timestamptz) to authenticated;
grant execute on function public.open_exploration_session(uuid, uuid[]) to authenticated;
grant execute on function public.get_session_setup(uuid) to authenticated;
grant execute on function public.list_class_sessions(uuid) to authenticated;

comment on function public.create_exploration_session(uuid, text, timestamptz) is
  'P6-03 schedules a session against the activity''s published version.';
comment on function public.open_exploration_session(uuid, uuid[]) is
  'P6-03 locks the class and its groups, validates the full queue order, and snapshots groups and participants immutably before opening.';
comment on function public.get_session_setup(uuid) is
  'P6-03 teacher session setup read model: eligible and excluded groups, readiness, and the opened snapshot roster.';
comment on function public.list_class_sessions(uuid) is
  'P6-03 class session list for teachers and class members.';

commit;
