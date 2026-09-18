begin;

-- P8-01: observation ownership, capture metadata, status history, and
-- optimistic versioning (OBS-001 to OBS-004, OBS-011; DATABASE_DESIGN §§8, 14;
-- D-019, D-020, D-026, D-043, D-051, D-052). Drafts are private to their owner:
-- no teacher, peer, or admin policy exists until submission phases add one.

-- Snapshot keys for composite foreign keys ---------------------------------------

alter table public.exploration_sessions
  add constraint exploration_sessions_id_class_activity_unique unique (id, class_id, activity_id);

alter table public.session_participants
  add constraint session_participants_snapshot_unique unique (id, session_id, session_group_id, user_id);

-- Observations ---------------------------------------------------------------------

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  client_generated_id uuid not null,
  observer_id uuid not null references public.profiles (id) on delete restrict,
  class_id uuid not null,
  activity_id uuid not null,
  session_id uuid not null,
  session_group_id uuid not null,
  session_participant_id uuid not null,
  status text not null default 'draft',
  version integer not null default 1,
  location_status text not null,
  capture_location extensions.geography(point, 4326),
  capture_accuracy_m numeric,
  captured_at timestamptz not null,
  location_unavailable_reason text,
  student_common_name text,
  student_scientific_name text,
  student_evidence_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint observations_client_id_unique unique (observer_id, client_generated_id),
  constraint observations_id_class_unique unique (id, class_id),
  constraint observations_id_session_unique unique (id, session_id),
  constraint observations_session_fk foreign key (session_id, class_id, activity_id)
    references public.exploration_sessions (id, class_id, activity_id) on delete restrict,
  constraint observations_participant_fk
    foreign key (session_participant_id, session_id, session_group_id, observer_id)
    references public.session_participants (id, session_id, session_group_id, user_id) on delete restrict,
  constraint observations_session_group_fk foreign key (session_group_id, session_id)
    references public.exploration_session_groups (id, session_id) on delete restrict,
  constraint observations_status_check check (status in (
    'draft', 'images_uploading', 'analysis_queued', 'analysis_running', 'student_review',
    'submitted', 'teacher_review', 'revision_required', 'resubmitted', 'verified',
    'unable_to_verify', 'rejected'
  )),
  constraint observations_version_check check (version >= 1),
  constraint observations_location_status_check check (
    location_status in ('captured', 'unavailable', 'teacher_accepted_missing')
  ),
  constraint observations_captured_location_check check (
    (location_status = 'captured') = (capture_location is not null)
  ),
  constraint observations_accuracy_pair_check check (
    (capture_location is null) = (capture_accuracy_m is null)
  ),
  constraint observations_accuracy_range_check check (
    capture_accuracy_m is null or (capture_accuracy_m > 0 and capture_accuracy_m <= 100000)
  ),
  constraint observations_unavailable_reason_check check (
    (location_status = 'captured') = (location_unavailable_reason is null)
    and (
      location_unavailable_reason is null
      or location_unavailable_reason in ('position_unavailable', 'timeout', 'unsupported')
    )
  ),
  constraint observations_common_name_check check (
    student_common_name is null or char_length(student_common_name) between 1 and 120
  ),
  constraint observations_scientific_name_check check (
    student_scientific_name is null or char_length(student_scientific_name) between 1 and 160
  ),
  constraint observations_evidence_note_check check (
    student_evidence_note is null or char_length(student_evidence_note) between 1 and 1000
  )
);

create index observations_session_observer_created_idx
  on public.observations (session_id, observer_id, created_at desc, id desc);
create index observations_observer_updated_idx
  on public.observations (observer_id, updated_at desc, id desc);
create index observations_class_idx on public.observations (class_id);
create index observations_activity_idx on public.observations (activity_id);
create index observations_session_group_idx on public.observations (session_group_id, session_id);
create index observations_participant_idx
  on public.observations (session_participant_id, session_id, session_group_id, observer_id);

-- Status history (append-only) -------------------------------------------------------

create table public.observation_status_history (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations (id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles (id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint observation_status_history_to_check check (to_status in (
    'draft', 'images_uploading', 'analysis_queued', 'analysis_running', 'student_review',
    'submitted', 'teacher_review', 'revision_required', 'resubmitted', 'verified',
    'unable_to_verify', 'rejected'
  )),
  constraint observation_status_history_reason_check check (reason ~ '^[a-z][a-z_]{0,63}$')
);

create index observation_status_history_observation_idx
  on public.observation_status_history (observation_id, created_at, id);
create index observation_status_history_changed_by_idx
  on public.observation_status_history (changed_by);

-- Research events gain an observation reference (DATABASE_DESIGN §14).
alter table public.research_events
  add column observation_id uuid references public.observations (id) on delete restrict;

create index research_events_observation_time_idx
  on public.research_events (observation_id, occurred_at desc, id desc)
  where observation_id is not null;

-- Guards -----------------------------------------------------------------------------

-- Later phases replace this with their transition matrix; P8 allows none.
create function private.observation_status_transition_allowed(from_status text, to_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select false;
$$;

create function private.guard_observation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' or new.version <> 1 then
    raise exception using errcode = '23514', message = 'OBSERVATION_MUST_START_AS_DRAFT';
  end if;
  return new;
end;
$$;

create function private.guard_observation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Identity, scope, and capture metadata never change after start (D-019, D-020).
  if (new.id, new.client_generated_id, new.observer_id, new.class_id, new.activity_id,
      new.session_id, new.session_group_id, new.session_participant_id, new.captured_at,
      new.location_unavailable_reason, new.created_at)
    is distinct from
     (old.id, old.client_generated_id, old.observer_id, old.class_id, old.activity_id,
      old.session_id, old.session_group_id, old.session_participant_id, old.captured_at,
      old.location_unavailable_reason, old.created_at)
    or new.capture_location::text is distinct from old.capture_location::text
    or new.capture_accuracy_m is distinct from old.capture_accuracy_m then
    raise exception using errcode = '42501', message = 'OBSERVATION_CAPTURE_IMMUTABLE';
  end if;

  if new.location_status is distinct from old.location_status
    and not (old.location_status = 'unavailable' and new.location_status = 'teacher_accepted_missing') then
    raise exception using errcode = '42501', message = 'OBSERVATION_CAPTURE_IMMUTABLE';
  end if;

  if new.version not in (old.version, old.version + 1) then
    raise exception using errcode = '23514', message = 'OBSERVATION_VERSION_STEP';
  end if;

  if new.status is distinct from old.status
    and not private.observation_status_transition_allowed(old.status, new.status) then
    raise exception using errcode = '23514', message = 'INVALID_STATUS_TRANSITION';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create function private.reject_observation_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'OBSERVATIONS_ARE_NOT_DELETED';
end;
$$;

create function private.record_observation_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  insert into public.observation_status_history (observation_id, from_status, to_status, changed_by, reason)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    (select auth.uid()),
    coalesce(nullif(current_setting('app.observation_status_reason', true), ''), 'status_changed')
  );
  return null;
end;
$$;

create function private.reject_observation_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'OBSERVATION_HISTORY_APPEND_ONLY';
end;
$$;

create trigger observations_guard_insert
before insert on public.observations
for each row execute function private.guard_observation_insert();

create trigger observations_guard_update
before update on public.observations
for each row execute function private.guard_observation_update();

create trigger observations_reject_delete
before delete on public.observations
for each row execute function private.reject_observation_delete();

create trigger observations_record_status_change
after insert or update of status on public.observations
for each row execute function private.record_observation_status_change();

create trigger observation_status_history_append_only
before update or delete on public.observation_status_history
for each row execute function private.reject_observation_history_mutation();

-- Helpers ----------------------------------------------------------------------------

create function private.current_user_owns_observation(target_observation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.observations as observation
    where observation.id = target_observation_id
      and observation.observer_id = (select auth.uid())
      and (select private.current_user_is_class_student(observation.class_id))
  );
$$;

-- RLS ----------------------------------------------------------------------------------

alter table public.observations enable row level security;
alter table public.observation_status_history enable row level security;

revoke all on table public.observations from public, anon, authenticated;
revoke all on table public.observation_status_history from public, anon, authenticated;
grant select on table public.observations to authenticated;
grant select on table public.observation_status_history to authenticated;

create policy observations_select_owner
on public.observations
for select
to authenticated
using (
  observer_id = (select auth.uid())
  and (select private.current_user_is_class_student(class_id))
);

create policy observation_status_history_select_owner
on public.observation_status_history
for select
to authenticated
using ((select private.current_user_owns_observation(observation_id)));

revoke execute on function private.observation_status_transition_allowed(text, text) from public, anon, authenticated;
revoke execute on function private.guard_observation_insert() from public, anon, authenticated;
revoke execute on function private.guard_observation_update() from public, anon, authenticated;
revoke execute on function private.reject_observation_delete() from public, anon, authenticated;
revoke execute on function private.record_observation_status_change() from public, anon, authenticated;
revoke execute on function private.reject_observation_history_mutation() from public, anon, authenticated;
revoke execute on function private.current_user_owns_observation(uuid) from public, anon;
grant execute on function private.current_user_owns_observation(uuid) to authenticated;

comment on table public.observations is
  'P8-01 observations. Drafts are visible only to their owner; writes go through SECURITY DEFINER RPCs. Capture metadata is immutable after start.';
comment on table public.observation_status_history is
  'P8-01 append-only observation status history, written by trigger on every status change.';

commit;
