begin;

-- At most one active group per session (D-003, P7-01) --------------------------

create unique index exploration_session_groups_one_active_per_session
  on public.exploration_session_groups (session_id)
  where status = 'active';

-- Helpers -----------------------------------------------------------------------

create function private.require_session_teacher(target_session_id uuid, lock_session boolean)
returns public.exploration_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.exploration_sessions%rowtype;
begin
  if lock_session then
    select * into session_row
    from public.exploration_sessions as candidate
    where candidate.id = target_session_id
    for update;
  else
    select * into session_row
    from public.exploration_sessions as candidate
    where candidate.id = target_session_id;
  end if;

  if session_row.id is null
    or not (select private.is_active_class_teacher((select auth.uid()), session_row.class_id)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return session_row;
end;
$$;

create function private.notify_session_group(
  target_session_group_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  notified integer;
begin
  insert into public.notifications (
    recipient_id, type, title, message, entity_type, entity_id, payload,
    class_id, session_id, activity_id, group_id, actor_id
  )
  select
    participant.user_id, notification_type, notification_title, notification_message,
    'exploration_session', session_row.id,
    jsonb_build_object(
      'classId', session_row.class_id,
      'sessionId', session_row.id,
      'activityId', session_row.activity_id,
      'sessionGroupId', session_group.id,
      'groupId', session_group.group_id,
      'queuePosition', session_group.queue_position
    ),
    session_row.class_id, session_row.id, session_row.activity_id, session_group.group_id, actor_user_id
  from public.session_participants as participant
  join public.exploration_session_groups as session_group
    on session_group.id = participant.session_group_id
  join public.exploration_sessions as session_row on session_row.id = session_group.session_id
  where participant.session_group_id = target_session_group_id
    and participant.participation_status = 'active';

  get diagnostics notified = row_count;
  return notified;
end;
$$;

-- Promotes the next waiting group to ready when no group is waiting in line yet.
create function private.promote_next_session_group(target_session_id uuid, actor_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_group public.exploration_session_groups%rowtype;
begin
  if exists (
    select 1 from public.exploration_session_groups as session_group
    where session_group.session_id = target_session_id
      and session_group.status in ('ready', 'active')
  ) then
    return null;
  end if;

  select * into next_group
  from public.exploration_session_groups as session_group
  where session_group.session_id = target_session_id
    and session_group.status = 'waiting'
  order by session_group.queue_position
  limit 1;

  if next_group.id is null then
    return null;
  end if;

  update public.exploration_session_groups as session_group
  set status = 'ready'
  where session_group.id = next_group.id;

  perform private.notify_session_group(
    next_group.id, 'session_group_next', 'กลุ่มของคุณเป็นกลุ่มถัดไป',
    'กลุ่มของคุณเป็นกลุ่มถัดไป เตรียมพร้อมสำรวจ', actor_user_id
  );

  return next_group.id;
end;
$$;

-- Activate one group (SES-004, P7-02) --------------------------------------------

create function public.activate_session_group(target_session_id uuid, target_group_id uuid)
returns table(
  outcome text,
  error_code text,
  error_details jsonb,
  session_group_id uuid,
  status text,
  queue_position integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  target_row public.exploration_session_groups%rowtype;
  active_row public.exploration_session_groups%rowtype;
begin
  actor_profile := private.require_active_verified_actor();
  session_row := private.require_session_teacher(target_session_id, true);
  select * into class_row from public.classes as class where class.id = session_row.class_id;

  if session_row.status = 'paused' then
    return query select 'denied'::text, 'SESSION_PAUSED'::text, null::jsonb, null::uuid, null::text, null::integer;
    return;
  end if;

  if session_row.status <> 'open' then
    return query select 'denied'::text, 'SESSION_NOT_OPEN'::text, null::jsonb, null::uuid, null::text, null::integer;
    return;
  end if;

  perform 1
  from public.exploration_session_groups as session_group
  where session_group.session_id = session_row.id
  order by session_group.id
  for update;

  select * into target_row
  from public.exploration_session_groups as session_group
  where session_group.session_id = session_row.id
    and session_group.group_id = target_group_id;

  if target_row.id is null or target_row.status = 'completed' then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text,
      jsonb_build_object('reason', case when target_row.id is null then 'group_not_in_session' else 'group_completed' end),
      target_row.id, target_row.status, target_row.queue_position;
    return;
  end if;

  if target_row.status = 'active' then
    return query select 'activated'::text, null::text, null::jsonb, target_row.id, target_row.status, target_row.queue_position;
    return;
  end if;

  select * into active_row
  from public.exploration_session_groups as session_group
  where session_group.session_id = session_row.id
    and session_group.status = 'active';

  if active_row.id is not null then
    return query select 'denied'::text, 'ACTIVE_GROUP_CONFLICT'::text,
      jsonb_build_object('activeGroupId', active_row.group_id, 'activeSessionGroupId', active_row.id),
      target_row.id, target_row.status, target_row.queue_position;
    return;
  end if;

  update public.exploration_session_groups as session_group
  set status = 'active',
      activated_at = now()
  where session_group.id = target_row.id;

  perform private.notify_session_group(
    target_row.id, 'session_group_active', 'กลุ่มของคุณเริ่มสำรวจได้แล้ว',
    'กลุ่มของคุณเริ่มสำรวจได้แล้ว', actor_profile.id
  );

  perform private.promote_next_session_group(session_row.id, actor_profile.id);

  insert into public.session_events (
    session_id, class_id, session_group_id, actor_id, event_type, from_status, to_status, payload
  )
  values (
    session_row.id, session_row.class_id, target_row.id, actor_profile.id, 'group_activated',
    target_row.status, 'active', jsonb_build_object('queue_position', target_row.queue_position)
  );

  perform private.insert_session_research_event(
    'session_group_activated', actor_profile.id, class_row.school_id, session_row.class_id,
    session_row.activity_id, session_row.id,
    jsonb_build_object(
      'queue_position', target_row.queue_position,
      'wait_duration_s', greatest(extract(epoch from now() - session_row.opened_at)::integer, 0)
    )
  );

  perform private.insert_audit_log(
    actor_profile.id, 'session_group_activated', 'exploration_session_group', target_row.id,
    class_row.school_id, session_row.class_id, 'succeeded',
    jsonb_build_object('queue_position', target_row.queue_position)
  );

  return query select 'activated'::text, null::text, null::jsonb, target_row.id, 'active'::text, target_row.queue_position;
end;
$$;

-- Pause and resume (SES-006, D-056) ----------------------------------------------

create function public.pause_exploration_session(target_session_id uuid)
returns table(outcome text, error_code text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  active_row public.exploration_session_groups%rowtype;
begin
  actor_profile := private.require_active_verified_actor();
  session_row := private.require_session_teacher(target_session_id, true);
  select * into class_row from public.classes as class where class.id = session_row.class_id;

  if session_row.status = 'paused' then
    return query select 'paused'::text, null::text, session_row.status;
    return;
  end if;

  if session_row.status <> 'open' then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, session_row.status;
    return;
  end if;

  select * into active_row
  from public.exploration_session_groups as session_group
  where session_group.session_id = session_row.id
    and session_group.status = 'active'
  for update;

  if active_row.id is not null then
    update public.exploration_session_groups as session_group
    set status = 'paused'
    where session_group.id = active_row.id;
  end if;

  update public.exploration_sessions as candidate
  set status = 'paused',
      paused_at = now()
  where candidate.id = session_row.id;

  insert into public.session_events (
    session_id, class_id, session_group_id, actor_id, event_type, from_status, to_status, payload
  )
  values (
    session_row.id, session_row.class_id, active_row.id, actor_profile.id, 'session_paused',
    'open', 'paused', '{}'::jsonb
  );

  perform private.insert_session_research_event(
    'session_group_paused', actor_profile.id, class_row.school_id, session_row.class_id,
    session_row.activity_id, session_row.id,
    jsonb_build_object('reason_category', 'teacher_pause')
  );

  perform private.insert_audit_log(
    actor_profile.id, 'session_paused', 'exploration_session', session_row.id,
    class_row.school_id, session_row.class_id, 'succeeded', '{}'::jsonb
  );

  return query select 'paused'::text, null::text, 'paused'::text;
end;
$$;

create function public.resume_exploration_session(target_session_id uuid)
returns table(outcome text, error_code text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  paused_row public.exploration_session_groups%rowtype;
begin
  actor_profile := private.require_active_verified_actor();
  session_row := private.require_session_teacher(target_session_id, true);
  select * into class_row from public.classes as class where class.id = session_row.class_id;

  if session_row.status = 'open' then
    return query select 'resumed'::text, null::text, session_row.status;
    return;
  end if;

  if session_row.status <> 'paused' then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, session_row.status;
    return;
  end if;

  select * into paused_row
  from public.exploration_session_groups as session_group
  where session_group.session_id = session_row.id
    and session_group.status = 'paused'
  order by session_group.queue_position
  limit 1
  for update;

  if paused_row.id is not null then
    update public.exploration_session_groups as session_group
    set status = 'active'
    where session_group.id = paused_row.id;

    perform private.notify_session_group(
      paused_row.id, 'session_group_active', 'กลับมาสำรวจต่อได้แล้ว',
      'ครูเปิดให้กลุ่มของคุณสำรวจต่อ', actor_profile.id
    );
  end if;

  update public.exploration_sessions as candidate
  set status = 'open',
      paused_at = null
  where candidate.id = session_row.id;

  insert into public.session_events (
    session_id, class_id, session_group_id, actor_id, event_type, from_status, to_status, payload
  )
  values (
    session_row.id, session_row.class_id, paused_row.id, actor_profile.id, 'session_resumed',
    'paused', 'open', '{}'::jsonb
  );

  perform private.insert_audit_log(
    actor_profile.id, 'session_resumed', 'exploration_session', session_row.id,
    class_row.school_id, session_row.class_id, 'succeeded', '{}'::jsonb
  );

  return query select 'resumed'::text, null::text, 'open'::text;
end;
$$;

-- Complete one group, then the session (SES-006) ---------------------------------

create function public.complete_session_group(target_session_id uuid, target_group_id uuid)
returns table(
  outcome text,
  error_code text,
  session_group_id uuid,
  status text,
  next_ready_group_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  target_row public.exploration_session_groups%rowtype;
  promoted_id uuid;
begin
  actor_profile := private.require_active_verified_actor();
  session_row := private.require_session_teacher(target_session_id, true);
  select * into class_row from public.classes as class where class.id = session_row.class_id;

  if session_row.status not in ('open', 'paused') then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, null::uuid, null::text, null::uuid;
    return;
  end if;

  select * into target_row
  from public.exploration_session_groups as session_group
  where session_group.session_id = session_row.id
    and session_group.group_id = target_group_id
  for update;

  if target_row.id is null then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, null::uuid, null::text, null::uuid;
    return;
  end if;

  if target_row.status = 'completed' then
    return query select 'completed'::text, null::text, target_row.id, target_row.status, null::uuid;
    return;
  end if;

  update public.exploration_session_groups as session_group
  set status = 'completed',
      completed_at = now()
  where session_group.id = target_row.id;

  promoted_id := private.promote_next_session_group(session_row.id, actor_profile.id);

  insert into public.session_events (
    session_id, class_id, session_group_id, actor_id, event_type, from_status, to_status, payload
  )
  values (
    session_row.id, session_row.class_id, target_row.id, actor_profile.id, 'group_completed',
    target_row.status, 'completed', '{}'::jsonb
  );

  perform private.insert_session_research_event(
    'session_group_completed', actor_profile.id, class_row.school_id, session_row.class_id,
    session_row.activity_id, session_row.id,
    jsonb_build_object(
      'active_duration_s',
      case
        when target_row.activated_at is null then 0
        else greatest(extract(epoch from now() - target_row.activated_at)::integer, 0)
      end
    )
  );

  perform private.insert_audit_log(
    actor_profile.id, 'session_group_completed', 'exploration_session_group', target_row.id,
    class_row.school_id, session_row.class_id, 'succeeded',
    jsonb_build_object('queue_position', target_row.queue_position)
  );

  return query select 'completed'::text, null::text, target_row.id, 'completed'::text, promoted_id;
end;
$$;

create function public.complete_exploration_session(target_session_id uuid)
returns table(outcome text, error_code text, status text, completed_groups integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  closed_groups integer := 0;
  participant_total integer;
  session_group_row public.exploration_session_groups%rowtype;
begin
  actor_profile := private.require_active_verified_actor();
  session_row := private.require_session_teacher(target_session_id, true);
  select * into class_row from public.classes as class where class.id = session_row.class_id;

  if session_row.status = 'completed' then
    return query select 'completed'::text, null::text, session_row.status, 0;
    return;
  end if;

  if session_row.status = 'scheduled' then
    return query select 'denied'::text, 'INVALID_STATUS_TRANSITION'::text, session_row.status, 0;
    return;
  end if;

  update public.exploration_session_groups as session_group
  set status = 'completed',
      completed_at = now()
  where session_group.session_id = session_row.id
    and session_group.status <> 'completed';

  get diagnostics closed_groups = row_count;

  update public.exploration_sessions as candidate
  set status = 'completed',
      paused_at = null,
      completed_at = now(),
      completed_by = actor_profile.id
  where candidate.id = session_row.id;

  for session_group_row in
    select * from public.exploration_session_groups as session_group
    where session_group.session_id = session_row.id
  loop
    perform private.notify_session_group(
      session_group_row.id, 'session_completed', 'กิจกรรมเสร็จสิ้นแล้ว',
      'รอบสำรวจ ' || session_row.title || ' เสร็จสิ้นแล้ว', actor_profile.id
    );
  end loop;

  select count(*)::integer into participant_total
  from public.session_participants as participant
  where participant.session_id = session_row.id;

  insert into public.session_events (
    session_id, class_id, actor_id, event_type, from_status, to_status, payload
  )
  values (
    session_row.id, session_row.class_id, actor_profile.id, 'session_completed',
    session_row.status, 'completed', jsonb_build_object('completed_groups', closed_groups)
  );

  perform private.insert_session_research_event(
    'session_completed', actor_profile.id, class_row.school_id, session_row.class_id,
    session_row.activity_id, session_row.id,
    jsonb_build_object(
      'duration_s',
      case
        when session_row.opened_at is null then 0
        else greatest(extract(epoch from now() - session_row.opened_at)::integer, 0)
      end,
      'participant_count', participant_total,
      'observation_count', 0
    )
  );

  perform private.insert_audit_log(
    actor_profile.id, 'session_completed', 'exploration_session', session_row.id,
    class_row.school_id, session_row.class_id, 'succeeded',
    jsonb_build_object('completed_groups', closed_groups, 'participant_count', participant_total)
  );

  return query select 'completed'::text, null::text, 'completed'::text, closed_groups;
end;
$$;

-- Read models --------------------------------------------------------------------

create function private.session_queue_payload(target_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sessionGroupId', session_group.id,
      'groupId', session_group.group_id,
      'groupName', group_row.name,
      'queuePosition', session_group.queue_position,
      'status', session_group.status,
      'activatedAt', session_group.activated_at,
      'completedAt', session_group.completed_at,
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
  ), '[]'::jsonb)
  from public.exploration_session_groups as session_group
  join public.groups as group_row on group_row.id = session_group.group_id
  where session_group.session_id = target_session_id;
$$;

create function public.get_session_live(target_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  version_row public.activity_versions%rowtype;
begin
  actor_profile := private.require_active_verified_actor();
  session_row := private.require_session_teacher(target_session_id, false);
  select * into class_row from public.classes as class where class.id = session_row.class_id;
  select * into version_row from public.activity_versions as version where version.id = session_row.activity_version_id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', session_row.id,
      'classId', session_row.class_id,
      'title', session_row.title,
      'status', session_row.status,
      'openedAt', session_row.opened_at,
      'pausedAt', session_row.paused_at,
      'completedAt', session_row.completed_at
    ),
    'className', class_row.name,
    'activity', jsonb_build_object(
      'id', session_row.activity_id,
      'title', version_row.title,
      'versionNumber', version_row.version_number,
      'instructions', version_row.instructions
    ),
    'geometry', (private.activity_version_payload(version_row.id)) -> 'geometry',
    'queue', private.session_queue_payload(session_row.id),
    'counts', jsonb_build_object(
      'groups', (
        select count(*) from public.exploration_session_groups as session_group
        where session_group.session_id = session_row.id
      ),
      'completedGroups', (
        select count(*) from public.exploration_session_groups as session_group
        where session_group.session_id = session_row.id and session_group.status = 'completed'
      ),
      'participants', (
        select count(*) from public.session_participants as participant
        where participant.session_id = session_row.id
      )
    ),
    'allowedActions', jsonb_build_object(
      'canActivate', session_row.status = 'open',
      'canPause', session_row.status = 'open',
      'canResume', session_row.status = 'paused',
      'canComplete', session_row.status in ('open', 'paused')
    ),
    'refreshedAt', now()
  );
end;
$$;

create function public.get_session_participant_view(target_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  session_row public.exploration_sessions%rowtype;
  class_row public.classes%rowtype;
  version_row public.activity_versions%rowtype;
  participant_row public.session_participants%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
  group_row public.groups%rowtype;
begin
  actor_profile := private.require_active_verified_actor();

  select * into session_row
  from public.exploration_sessions as candidate
  where candidate.id = target_session_id;

  if session_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into participant_row
  from public.session_participants as participant
  where participant.session_id = session_row.id
    and participant.user_id = actor_profile.id;

  if participant_row.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select * into class_row from public.classes as class where class.id = session_row.class_id;
  select * into version_row from public.activity_versions as version where version.id = session_row.activity_version_id;
  select * into session_group_row
  from public.exploration_session_groups as session_group
  where session_group.id = participant_row.session_group_id;
  select * into group_row from public.groups as candidate where candidate.id = session_group_row.group_id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', session_row.id,
      'classId', session_row.class_id,
      'title', session_row.title,
      'status', session_row.status,
      'openedAt', session_row.opened_at,
      'completedAt', session_row.completed_at
    ),
    'className', class_row.name,
    'activity', jsonb_build_object(
      'id', session_row.activity_id,
      'title', version_row.title,
      'versionNumber', version_row.version_number,
      'instructions', version_row.instructions
    ),
    'geometry', (private.activity_version_payload(version_row.id)) -> 'geometry',
    'myGroup', jsonb_build_object(
      'sessionGroupId', session_group_row.id,
      'groupId', session_group_row.group_id,
      'name', group_row.name,
      'status', session_group_row.status,
      'queuePosition', session_group_row.queue_position,
      'roleAtStart', participant_row.role_at_start,
      'members', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'userId', participant.user_id,
            'displayName', profile.display_name,
            'roleAtStart', participant.role_at_start
          )
          order by (participant.role_at_start = 'leader') desc, profile.display_name, participant.user_id
        )
        from public.session_participants as participant
        join public.profiles as profile on profile.id = participant.user_id
        where participant.session_group_id = session_group_row.id
      ), '[]'::jsonb)
    ),
    'groupsAhead', (
      select count(*)
      from public.exploration_session_groups as session_group
      where session_group.session_id = session_row.id
        and session_group.queue_position < session_group_row.queue_position
        and session_group.status <> 'completed'
    ),
    'permissions', jsonb_build_object(
      'canPublishLocation', session_row.status = 'open' and session_group_row.status = 'active'
        and participant_row.participation_status = 'active',
      'canSubmitObservations', session_row.status = 'open' and session_group_row.status = 'active'
        and participant_row.participation_status = 'active',
      'blockedReason', case
        when session_row.status = 'completed' then 'session_completed'
        when session_row.status = 'paused' then 'session_paused'
        when session_group_row.status = 'completed' then 'group_completed'
        when session_group_row.status <> 'active' then 'group_waiting'
        else null
      end
    ),
    'refreshedAt', now()
  );
end;
$$;

revoke execute on function private.require_session_teacher(uuid, boolean) from public, anon, authenticated;
revoke execute on function private.notify_session_group(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function private.promote_next_session_group(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.session_queue_payload(uuid) from public, anon, authenticated;
revoke execute on function public.activate_session_group(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pause_exploration_session(uuid) from public, anon, authenticated;
revoke execute on function public.resume_exploration_session(uuid) from public, anon, authenticated;
revoke execute on function public.complete_session_group(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.complete_exploration_session(uuid) from public, anon, authenticated;
revoke execute on function public.get_session_live(uuid) from public, anon, authenticated;
revoke execute on function public.get_session_participant_view(uuid) from public, anon, authenticated;

grant execute on function public.activate_session_group(uuid, uuid) to authenticated;
grant execute on function public.pause_exploration_session(uuid) to authenticated;
grant execute on function public.resume_exploration_session(uuid) to authenticated;
grant execute on function public.complete_session_group(uuid, uuid) to authenticated;
grant execute on function public.complete_exploration_session(uuid) to authenticated;
grant execute on function public.get_session_live(uuid) to authenticated;
grant execute on function public.get_session_participant_view(uuid) to authenticated;

comment on index public.exploration_session_groups_one_active_per_session is
  'D-003: at most one active exploration group per session, enforced in PostgreSQL.';
comment on function public.activate_session_group(uuid, uuid) is
  'P7-02 activates one queued group, promotes the next waiting group to ready, and notifies both.';
comment on function public.pause_exploration_session(uuid) is
  'P7-02 pauses a running session and its active group (D-056); drafts stay editable, submission stops.';
comment on function public.resume_exploration_session(uuid) is
  'P7-02 resumes a paused session and returns its paused group to active.';
comment on function public.complete_session_group(uuid, uuid) is
  'P7-02 completes one group without ending the session and promotes the next waiting group.';
comment on function public.complete_exploration_session(uuid) is
  'P7-02 completes every remaining group and the session, notifying all participants.';
comment on function public.get_session_live(uuid) is
  'P7-02 teacher live read model: queue, participants, counts, and allowed actions.';
comment on function public.get_session_participant_view(uuid) is
  'P7-02 participant read model: own group, queue position, activity geometry, and what the current state permits.';

commit;
