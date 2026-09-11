begin;

create extension if not exists postgis with schema extensions;

-- Activities and immutable versions (SES-001, DATABASE_DESIGN §14A) -----------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  title text not null,
  description text,
  status text not null default 'draft',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_id_class_unique unique (id, class_id),
  constraint activities_status_check check (status in ('draft', 'published', 'archived')),
  constraint activities_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint activities_description_check check (description is null or char_length(description) <= 2000)
);

create index activities_class_status_updated_idx
  on public.activities (class_id, status, updated_at desc, id desc);
create index activities_created_by_idx on public.activities (created_by);

create table public.activity_versions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  class_id uuid not null,
  version_number integer not null,
  title text not null,
  instructions text,
  status text not null default 'draft',
  created_by uuid not null references public.profiles (id) on delete restrict,
  published_by uuid references public.profiles (id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_versions_activity_class_fk foreign key (activity_id, class_id)
    references public.activities (id, class_id) on delete cascade,
  constraint activity_versions_id_class_unique unique (id, class_id),
  constraint activity_versions_id_activity_unique unique (id, activity_id),
  constraint activity_versions_activity_number_unique unique (activity_id, version_number),
  constraint activity_versions_number_check check (version_number >= 1),
  constraint activity_versions_status_check check (status in ('draft', 'published', 'superseded')),
  constraint activity_versions_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint activity_versions_instructions_check check (instructions is null or char_length(instructions) <= 4000),
  constraint activity_versions_published_check check (
    (status = 'draft' and published_at is null and published_by is null)
    or (status <> 'draft' and published_at is not null and published_by is not null)
  )
);

create unique index activity_versions_one_published
  on public.activity_versions (activity_id)
  where status = 'published';
create unique index activity_versions_one_draft
  on public.activity_versions (activity_id)
  where status = 'draft';
create index activity_versions_class_idx on public.activity_versions (class_id);
create index activity_versions_created_by_idx on public.activity_versions (created_by);
create index activity_versions_published_by_idx on public.activity_versions (published_by);

create table public.activity_boundaries (
  activity_version_id uuid primary key references public.activity_versions (id) on delete cascade,
  boundary extensions.geometry(polygon, 4326) not null,
  created_at timestamptz not null default now(),
  constraint activity_boundaries_geometry_check check (
    not extensions.st_isempty(boundary)
    and extensions.st_isvalid(boundary)
    and extensions.st_npoints(boundary) between 4 and 2000
  )
);

create table public.activity_routes (
  activity_version_id uuid primary key references public.activity_versions (id) on delete cascade,
  route extensions.geometry(linestring, 4326) not null,
  created_at timestamptz not null default now(),
  constraint activity_routes_geometry_check check (
    not extensions.st_isempty(route)
    and extensions.st_isvalid(route)
    and extensions.st_npoints(route) between 2 and 2000
  )
);

create table public.activity_checkpoints (
  id uuid primary key default gen_random_uuid(),
  activity_version_id uuid not null references public.activity_versions (id) on delete cascade,
  sequence_number integer not null,
  title text not null,
  instructions text,
  location extensions.geometry(point, 4326) not null,
  radius_m numeric not null default 20,
  created_at timestamptz not null default now(),
  constraint activity_checkpoints_version_sequence_unique unique (activity_version_id, sequence_number),
  constraint activity_checkpoints_sequence_check check (sequence_number between 1 and 50),
  constraint activity_checkpoints_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint activity_checkpoints_instructions_check check (instructions is null or char_length(instructions) <= 1000),
  constraint activity_checkpoints_radius_check check (radius_m > 0 and radius_m <= 500),
  constraint activity_checkpoints_location_check check (not extensions.st_isempty(location))
);

create table public.activity_plugin_configs (
  activity_version_id uuid primary key references public.activity_versions (id) on delete cascade,
  plugin_key text not null default 'plant_survey',
  schema_version integer not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_plugin_configs_key_check check (plugin_key in ('plant_survey')),
  constraint activity_plugin_configs_schema_version_check check (schema_version >= 1),
  constraint activity_plugin_configs_config_check check (jsonb_typeof(config) = 'object')
);

-- Sessions and participant snapshots (SES-002, SES-003, DATABASE_DESIGN §7) ---

create table public.exploration_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  activity_id uuid not null,
  activity_version_id uuid not null,
  title text not null,
  scheduled_at timestamptz,
  status text not null default 'scheduled',
  opened_by uuid references public.profiles (id) on delete restrict,
  opened_at timestamptz,
  paused_at timestamptz,
  completed_by uuid references public.profiles (id) on delete restrict,
  completed_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exploration_sessions_id_class_unique unique (id, class_id),
  constraint exploration_sessions_activity_class_fk foreign key (activity_id, class_id)
    references public.activities (id, class_id) on delete restrict,
  constraint exploration_sessions_version_activity_fk foreign key (activity_version_id, activity_id)
    references public.activity_versions (id, activity_id) on delete restrict,
  constraint exploration_sessions_status_check check (status in ('scheduled', 'open', 'paused', 'completed')),
  constraint exploration_sessions_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint exploration_sessions_opened_check check (
    (status = 'scheduled' and opened_at is null and opened_by is null)
    or (status <> 'scheduled' and opened_at is not null and opened_by is not null)
  ),
  constraint exploration_sessions_paused_check check ((status = 'paused') = (paused_at is not null)),
  constraint exploration_sessions_completed_check check (
    (status = 'completed') = (completed_at is not null and completed_by is not null)
  )
);

create index exploration_sessions_class_status_scheduled_idx
  on public.exploration_sessions (class_id, status, scheduled_at desc, id desc);
create unique index exploration_sessions_one_running_per_class
  on public.exploration_sessions (class_id)
  where status in ('open', 'paused');
create index exploration_sessions_activity_idx on public.exploration_sessions (activity_id);
create index exploration_sessions_version_idx on public.exploration_sessions (activity_version_id);
create index exploration_sessions_created_by_idx on public.exploration_sessions (created_by);
create index exploration_sessions_opened_by_idx on public.exploration_sessions (opened_by);
create index exploration_sessions_completed_by_idx on public.exploration_sessions (completed_by);

create table public.exploration_session_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  class_id uuid not null,
  group_id uuid not null,
  queue_position integer not null,
  status text not null default 'waiting',
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exploration_session_groups_session_class_fk foreign key (session_id, class_id)
    references public.exploration_sessions (id, class_id) on delete cascade,
  constraint exploration_session_groups_group_class_fk foreign key (group_id, class_id)
    references public.groups (id, class_id) on delete restrict,
  constraint exploration_session_groups_id_session_unique unique (id, session_id),
  constraint exploration_session_groups_session_group_unique unique (session_id, group_id),
  constraint exploration_session_groups_session_queue_unique unique (session_id, queue_position),
  constraint exploration_session_groups_queue_check check (queue_position >= 1),
  constraint exploration_session_groups_status_check check (
    status in ('waiting', 'ready', 'active', 'paused', 'completed')
  ),
  constraint exploration_session_groups_completed_check check ((status = 'completed') = (completed_at is not null))
);

create index exploration_session_groups_group_idx on public.exploration_session_groups (group_id);
create index exploration_session_groups_class_idx on public.exploration_session_groups (class_id);

create table public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  class_id uuid not null,
  session_group_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role_at_start text not null,
  participation_status text not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  constraint session_participants_session_class_fk foreign key (session_id, class_id)
    references public.exploration_sessions (id, class_id) on delete cascade,
  constraint session_participants_group_session_fk foreign key (session_group_id, session_id)
    references public.exploration_session_groups (id, session_id) on delete cascade,
  constraint session_participants_session_user_unique unique (session_id, user_id),
  constraint session_participants_role_check check (role_at_start in ('leader', 'member')),
  constraint session_participants_status_check check (participation_status in ('active', 'left', 'removed')),
  constraint session_participants_left_check check ((participation_status = 'active') = (left_at is null))
);

create index session_participants_user_session_idx on public.session_participants (user_id, session_id);
create index session_participants_group_idx on public.session_participants (session_group_id, session_id);
create index session_participants_class_idx on public.session_participants (class_id);

create table public.session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  class_id uuid not null,
  session_group_id uuid references public.exploration_session_groups (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint session_events_session_class_fk foreign key (session_id, class_id)
    references public.exploration_sessions (id, class_id) on delete cascade,
  constraint session_events_type_check check (btrim(event_type) <> ''),
  constraint session_events_payload_check check (jsonb_typeof(payload) = 'object')
);

create index session_events_session_created_idx
  on public.session_events (session_id, created_at desc, id desc);
create index session_events_class_idx on public.session_events (class_id);
create index session_events_group_idx on public.session_events (session_group_id);
create index session_events_actor_idx on public.session_events (actor_id);

-- Immutability guards -----------------------------------------------------------

create function private.guard_activity_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
    end if;
    return old;
  end if;

  if new.activity_id <> old.activity_id
    or new.class_id <> old.class_id
    or new.version_number <> old.version_number
    or new.created_by <> old.created_by then
    raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
  end if;

  if old.status = 'draft' and new.status in ('draft', 'published') then
    return new;
  end if;

  -- A published version may only be superseded; its content never changes.
  if old.status = 'published'
    and new.status = 'superseded'
    and new.title = old.title
    and new.instructions is not distinct from old.instructions
    and new.published_at = old.published_at
    and new.published_by = old.published_by then
    return new;
  end if;

  raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
end;
$$;

create function private.guard_activity_version_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version_id uuid;
  version_status text;
begin
  if tg_op = 'DELETE' then
    target_version_id := old.activity_version_id;
  else
    target_version_id := new.activity_version_id;
  end if;

  if tg_op = 'UPDATE' and new.activity_version_id <> old.activity_version_id then
    raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
  end if;

  select version.status
  into version_status
  from public.activity_versions as version
  where version.id = target_version_id;

  -- A cascaded delete from a removed draft version no longer finds its parent.
  if tg_op = 'DELETE' and version_status is null then
    return old;
  end if;

  if version_status is distinct from 'draft' then
    raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create function private.guard_exploration_session_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'scheduled' then
      raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
    end if;
    return old;
  end if;

  if new.class_id <> old.class_id
    or new.activity_id <> old.activity_id
    or new.created_by <> old.created_by
    or (old.status <> 'scheduled' and new.activity_version_id <> old.activity_version_id)
    or (old.status = 'completed' and new.status <> 'completed') then
    raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
  end if;

  return new;
end;
$$;

create function private.guard_session_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Rows disappear only with their session, which itself cannot be deleted
    -- once opened.
    if exists (
      select 1 from public.exploration_sessions as session_row where session_row.id = old.session_id
    ) then
      raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
    end if;
    return old;
  end if;

  if tg_table_name = 'session_participants' then
    if new.session_id <> old.session_id
      or new.class_id <> old.class_id
      or new.session_group_id <> old.session_group_id
      or new.user_id <> old.user_id
      or new.role_at_start <> old.role_at_start
      or new.joined_at <> old.joined_at then
      raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
    end if;
  elsif tg_table_name = 'exploration_session_groups' then
    if new.session_id <> old.session_id
      or new.class_id <> old.class_id
      or new.group_id <> old.group_id
      or new.queue_position <> old.queue_position then
      raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
    end if;
  else
    -- session_events are append-only.
    raise exception using errcode = '55000', message = 'INVALID_STATUS_TRANSITION';
  end if;

  return new;
end;
$$;

create trigger activities_set_updated_at
before update on public.activities
for each row execute function private.set_updated_at();

create trigger activity_versions_set_updated_at
before update on public.activity_versions
for each row execute function private.set_updated_at();

create trigger activity_versions_guard_mutation
before update or delete on public.activity_versions
for each row execute function private.guard_activity_version_mutation();

create trigger activity_boundaries_guard_version
before insert or update or delete on public.activity_boundaries
for each row execute function private.guard_activity_version_child();

create trigger activity_routes_guard_version
before insert or update or delete on public.activity_routes
for each row execute function private.guard_activity_version_child();

create trigger activity_checkpoints_guard_version
before insert or update or delete on public.activity_checkpoints
for each row execute function private.guard_activity_version_child();

create trigger activity_plugin_configs_guard_version
before insert or update or delete on public.activity_plugin_configs
for each row execute function private.guard_activity_version_child();

create trigger exploration_sessions_set_updated_at
before update on public.exploration_sessions
for each row execute function private.set_updated_at();

create trigger exploration_sessions_guard_mutation
before update or delete on public.exploration_sessions
for each row execute function private.guard_exploration_session_mutation();

create trigger exploration_session_groups_set_updated_at
before update on public.exploration_session_groups
for each row execute function private.set_updated_at();

create trigger exploration_session_groups_guard_snapshot
before update or delete on public.exploration_session_groups
for each row execute function private.guard_session_snapshot_mutation();

create trigger session_participants_guard_snapshot
before update or delete on public.session_participants
for each row execute function private.guard_session_snapshot_mutation();

create trigger session_events_guard_append_only
before update or delete on public.session_events
for each row execute function private.guard_session_snapshot_mutation();

-- Session-aware group helpers replace the Phase 5 stubs ------------------------

create or replace function private.group_has_session_history(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exploration_session_groups as session_group
    where session_group.group_id = target_group_id
  );
$$;

create or replace function private.group_in_active_session(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exploration_session_groups as session_group
    join public.exploration_sessions as session_row on session_row.id = session_group.session_id
    where session_group.group_id = target_group_id
      and session_row.status in ('open', 'paused')
      and session_group.status <> 'completed'
  );
$$;

-- RLS ---------------------------------------------------------------------------

create function private.current_user_can_read_activity_version(target_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.activity_versions as version
    where version.id = target_version_id
      and (
        (select private.current_user_is_class_teacher(version.class_id))
        or (
          version.status <> 'draft'
          and (select private.current_user_is_class_member(version.class_id))
        )
      )
  );
$$;

create function private.current_user_is_session_participant(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_profile_is_active())
    and exists (
      select 1
      from public.session_participants as participant
      where participant.session_id = target_session_id
        and participant.user_id = (select auth.uid())
        and participant.participation_status = 'active'
    );
$$;

alter table public.activities enable row level security;
alter table public.activity_versions enable row level security;
alter table public.activity_boundaries enable row level security;
alter table public.activity_routes enable row level security;
alter table public.activity_checkpoints enable row level security;
alter table public.activity_plugin_configs enable row level security;
alter table public.exploration_sessions enable row level security;
alter table public.exploration_session_groups enable row level security;
alter table public.session_participants enable row level security;
alter table public.session_events enable row level security;

create policy activities_select_authorized
on public.activities
for select
to authenticated
using (
  (select private.current_user_is_class_teacher(class_id))
  or (status <> 'draft' and (select private.current_user_is_class_member(class_id)))
);

create policy activity_versions_select_authorized
on public.activity_versions
for select
to authenticated
using (
  (select private.current_user_is_class_teacher(class_id))
  or (status <> 'draft' and (select private.current_user_is_class_member(class_id)))
);

create policy activity_boundaries_select_authorized
on public.activity_boundaries
for select
to authenticated
using ((select private.current_user_can_read_activity_version(activity_version_id)));

create policy activity_routes_select_authorized
on public.activity_routes
for select
to authenticated
using ((select private.current_user_can_read_activity_version(activity_version_id)));

create policy activity_checkpoints_select_authorized
on public.activity_checkpoints
for select
to authenticated
using ((select private.current_user_can_read_activity_version(activity_version_id)));

create policy activity_plugin_configs_select_authorized
on public.activity_plugin_configs
for select
to authenticated
using ((select private.current_user_can_read_activity_version(activity_version_id)));

create policy exploration_sessions_select_class_members
on public.exploration_sessions
for select
to authenticated
using ((select private.current_user_is_class_member(class_id)));

create policy exploration_session_groups_select_class_members
on public.exploration_session_groups
for select
to authenticated
using ((select private.current_user_is_class_member(class_id)));

create policy session_participants_select_authorized
on public.session_participants
for select
to authenticated
using (
  (select private.current_user_is_class_teacher(class_id))
  or user_id = (select auth.uid())
  or (select private.current_user_is_session_participant(session_id))
);

create policy session_events_select_teacher
on public.session_events
for select
to authenticated
using ((select private.current_user_is_class_teacher(class_id)));

revoke all on table public.activities from anon, authenticated;
revoke all on table public.activity_versions from anon, authenticated;
revoke all on table public.activity_boundaries from anon, authenticated;
revoke all on table public.activity_routes from anon, authenticated;
revoke all on table public.activity_checkpoints from anon, authenticated;
revoke all on table public.activity_plugin_configs from anon, authenticated;
revoke all on table public.exploration_sessions from anon, authenticated;
revoke all on table public.exploration_session_groups from anon, authenticated;
revoke all on table public.session_participants from anon, authenticated;
revoke all on table public.session_events from anon, authenticated;

grant select on table public.activities to authenticated;
grant select on table public.activity_versions to authenticated;
grant select on table public.activity_boundaries to authenticated;
grant select on table public.activity_routes to authenticated;
grant select on table public.activity_checkpoints to authenticated;
grant select on table public.activity_plugin_configs to authenticated;
grant select on table public.exploration_sessions to authenticated;
grant select on table public.exploration_session_groups to authenticated;
grant select on table public.session_participants to authenticated;
grant select on table public.session_events to authenticated;

revoke execute on function private.guard_activity_version_mutation() from public, anon, authenticated;
revoke execute on function private.guard_activity_version_child() from public, anon, authenticated;
revoke execute on function private.guard_exploration_session_mutation() from public, anon, authenticated;
revoke execute on function private.guard_session_snapshot_mutation() from public, anon, authenticated;
revoke execute on function private.current_user_can_read_activity_version(uuid) from public, anon;
revoke execute on function private.current_user_is_session_participant(uuid) from public, anon;
grant execute on function private.current_user_can_read_activity_version(uuid) to authenticated;
grant execute on function private.current_user_is_session_participant(uuid) to authenticated;

comment on table public.activities is
  'P6-01 reusable activity plans per class; content lives in immutable versions.';
comment on table public.activity_versions is
  'P6-01 activity versions; published versions are immutable and may only be superseded.';
comment on table public.exploration_sessions is
  'P6-01 one real execution of a published activity version; at most one open or paused session per class.';
comment on table public.exploration_session_groups is
  'P6-01 session group queue snapshot taken at open; group identity and queue position are immutable.';
comment on table public.session_participants is
  'P6-01 immutable membership and leadership snapshot taken when a session opens (D-043).';
comment on table public.session_events is
  'P6-01 append-only session state history.';
comment on function private.group_has_session_history(uuid) is
  'P6-01 true when the group appears in any session snapshot; delete_or_archive_group archives such groups.';
comment on function private.group_in_active_session(uuid) is
  'P6-01 true while the group has an uncompleted snapshot in an open or paused session (D-045).';

commit;
