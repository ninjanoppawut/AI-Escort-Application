# Database Design

## 1. Principles

- PostgreSQL is the source of truth.
- Use UUID primary keys.
- Use `timestamptz` for all timestamps.
- Store geometry in PostGIS columns and expose GeoJSON at API boundaries.
- Enable RLS on every table in exposed schemas.
- Enforce critical rules with constraints, indexes, and transactions.
- Use soft-state fields only when a complete audit history is unnecessary.

## 2. Core tables

### Identity and organization

```text
profiles
schools
school_memberships
classes
class_members
class_invites
```

### Collaboration and activities

```text
groups
group_members
activities
activity_routes
activity_boundaries
activity_checkpoints
activity_plugin_configs
activity_requirements
```

### Live sessions

```text
exploration_sessions
exploration_session_groups
session_participants
location_events
location_tracks
session_events
```

### Survey and learning

```text
observations
observation_media
observation_traits
observation_ecology
observation_identifications
observation_comments
reflections
rubrics
rubric_criteria
assessment_results
```

### Operations

```text
notifications
audit_logs
ai_requests
exports
```

## 3. Key schemas

### `profiles`

```sql
id uuid primary key references auth.users(id) on delete cascade,
display_name text not null,
avatar_path text,
locale text not null default 'th',
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

Do not store class authorization in the profile row.

### `class_members`

```sql
id uuid primary key default gen_random_uuid(),
class_id uuid not null references classes(id) on delete cascade,
user_id uuid not null references profiles(id) on delete cascade,
role text not null check (role in ('student','teacher','assistant_teacher')),
status text not null check (status in ('invited','active','suspended','left')),
joined_at timestamptz,
created_at timestamptz not null default now(),
unique (class_id, user_id)
```

### `activities`

```sql
id uuid primary key default gen_random_uuid(),
class_id uuid not null references classes(id) on delete cascade,
creator_id uuid not null references profiles(id),
title text not null,
description text,
status text not null,
approval_status text not null,
approved_by uuid references profiles(id),
approved_at timestamptz,
starts_at timestamptz,
ends_at timestamptz,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

### Geometry tables

```sql
activity_routes(
  activity_id uuid primary key references activities(id) on delete cascade,
  route geography(linestring, 4326) not null
)

activity_boundaries(
  activity_id uuid primary key references activities(id) on delete cascade,
  boundary geography(multipolygon, 4326) not null
)

activity_checkpoints(
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  position integer not null,
  location geography(point, 4326) not null,
  title text not null,
  instructions text,
  unique(activity_id, position)
)
```

### `exploration_sessions`

```sql
id uuid primary key default gen_random_uuid(),
activity_id uuid not null references activities(id),
opened_by uuid references profiles(id),
status text not null check (status in ('scheduled','open','paused','completed','cancelled')),
started_at timestamptz,
ended_at timestamptz,
created_at timestamptz not null default now()
```

### `exploration_session_groups`

```sql
id uuid primary key default gen_random_uuid(),
session_id uuid not null references exploration_sessions(id) on delete cascade,
group_id uuid not null references groups(id),
queue_position integer not null,
status text not null check (status in ('waiting','ready','active','paused','completed')),
activated_at timestamptz,
completed_at timestamptz,
unique(session_id, group_id),
unique(session_id, queue_position)
```

Critical constraint:

```sql
create unique index one_active_group_per_session
on exploration_session_groups(session_id)
where status = 'active';
```

Group switching must occur through one transaction or RPC that validates teacher permission and session status.

### `observations`

```sql
id uuid primary key default gen_random_uuid(),
client_generated_id uuid not null,
session_id uuid not null references exploration_sessions(id),
activity_id uuid not null references activities(id),
group_id uuid not null references groups(id),
observer_id uuid not null references profiles(id),
plugin_type text not null,
location geography(point, 4326) not null,
gps_accuracy_m numeric,
observed_at timestamptz not null,
status text not null check (status in ('draft','pending_sync','submitted','reviewed','verified')),
student_identification_text text,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique(observer_id, client_generated_id)
```

### `observation_identifications`

```sql
id uuid primary key default gen_random_uuid(),
observation_id uuid not null references observations(id) on delete cascade,
suggested_by uuid references profiles(id),
source text not null check (source in ('student','peer','teacher','expert','ai')),
taxon_id text,
scientific_name text,
common_name text,
confidence numeric,
evidence_summary text,
is_accepted boolean not null default false,
created_at timestamptz not null default now()
```

Only authorized teacher/expert workflows may mark an identification accepted. Preserve earlier suggestions.

## 4. RLS policy intent

Create reusable SQL predicates or carefully designed helper functions for:

- active class membership;
- teacher role in a class;
- membership in a session group;
- teacher ownership of the session's class;
- observation ownership and visibility.

Avoid broad policies such as `to authenticated using (true)`.

### Example: activity visibility

A user may select an activity when an active `class_members` row exists for its class.

### Example: activity creation

A teacher may create directly. A student may create only when:

- they are an active student member;
- the class setting allows student activity creation;
- `creator_id = auth.uid()`;
- initial approval state is `draft` or `submitted`.

### Example: locations

- Participant inserts only their own location event.
- Participant selects current-session locations only for permitted group members.
- Teacher selects locations for sessions in classes they teach.
- Historical raw tracks are not generally visible to classmates.

## 5. Transactional functions

Recommended RPCs:

```text
join_class_with_invite(code)
submit_activity(activity_id)
approve_activity(activity_id)
open_exploration_session(session_id)
activate_session_group(session_id, group_id)
complete_active_group(session_id)
submit_observation(observation_id)
verify_observation(observation_id, identification_id)
```

Sensitive functions must validate `auth.uid()` internally, use a fixed `search_path`, revoke default public execute permissions when appropriate, and grant execution only to intended roles.

## 6. Storage paths

```text
observation-originals/{class_id}/{session_id}/{observation_id}/{media_id}
observation-processed/{class_id}/{session_id}/{observation_id}/{media_id}
class-assets/{class_id}/{asset_id}
activity-exports/{class_id}/{export_id}
```

Storage policies must derive access from class/session membership rather than trusting path segments alone.

## 7. Retention

Suggested configurable defaults:

- raw high-resolution location events: short retention;
- summarized tracks: retained with activity results;
- observation data and educational evidence: retained according to school policy;
- failed AI payloads and debug data: minimal retention;
- audit logs: longer retention with restricted access.

The final retention periods remain a product/legal decision and are tracked in `DECISIONS_AND_QUESTIONS.md`.