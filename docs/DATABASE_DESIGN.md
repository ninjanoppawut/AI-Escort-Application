# Database Design

## 1. Principles

- PostgreSQL is the source of truth.
- Use UUID primary keys and `timestamptz`.
- Use PostGIS for route, boundary, capture location, and spatial candidate search.
- Enable RLS on every table in exposed schemas.
- Critical invariants use constraints, partial unique indexes, and atomic functions.
- Core queryable data uses relational columns.
- Flexible AI/research payloads may use versioned `jsonb`.
- Preserve append-only history for AI runs, submissions, reviews, status changes, group changes, and research events.
- Realtime improves UI responsiveness but never replaces database validation.
- Index every foreign-key column used for joins, cascade checks, RLS membership/ownership predicates, or worker selection; document any deliberate exception.
- Mutable lists use keyset-friendly indexes matching their filter/equality columns followed by stable sort columns such as `(created_at, id)`.
- Multi-row mutations acquire locks in a consistent documented order and keep transactions free of external network calls.

## 2. Core tables

```text
profiles
platform_admins
break_glass_access_grants
teacher_invitations
schools
school_memberships
classes
class_members
class_invites

groups
group_members
student_group_creation_claims
group_invitations
group_membership_history

activities
activity_versions
activity_routes
activity_boundaries
activity_checkpoints
activity_plugin_configs

exploration_sessions
exploration_session_groups
session_participants
location_events
location_tracks
session_events

observations
observation_media
ai_analysis_runs
observation_ai_results
student_trait_verifications
observation_submissions
teacher_reviews
observation_revision_topics
observation_unlock_requests
observation_issue_reports
observation_status_history
observation_duplicate_candidates
specimens
research_events

notifications
audit_logs
operational_error_events
operational_incidents
operational_incident_notes
idempotency_keys
exports
```

### Identity and platform control

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null,
  display_name text not null,
  account_type text not null default 'student'
    check (account_type in ('student','teacher')),
  status text not null default 'active'
    check (status in ('active','deactivated')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_unique
on profiles (lower(email));

create table platform_admins (
  user_id uuid primary key references profiles(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active','revoked')),
  granted_by uuid references profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references profiles(id) on delete restrict,
  revoked_at timestamptz,
  reason text not null
);

create table break_glass_access_grants (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references platform_admins(user_id) on delete restrict,
  resource_type text not null,
  resource_id uuid not null,
  reason text not null,
  status text not null default 'requested'
    check (status in ('requested','active','expired','revoked','denied')),
  requested_at timestamptz not null default now(),
  approved_by uuid references platform_admins(user_id) on delete restrict,
  approved_at timestamptz,
  expires_at timestamptz not null,
  revoked_by uuid references platform_admins(user_id) on delete restrict,
  revoked_at timestamptz,
  check (expires_at > requested_at and expires_at <= requested_at + interval '1 hour')
);

create index break_glass_active_admin_expiry_idx
on break_glass_access_grants (admin_user_id, expires_at)
where status = 'active';

create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active'
    check (status in ('active','archived')),
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete restrict,
  role text not null check (role in ('student','teacher')),
  status text not null default 'active'
    check (status in ('active','left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create index school_memberships_user_school_idx
on school_memberships (user_id, school_id)
where status = 'active';

create table teacher_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending','accepted','revoked','expired')),
  created_by uuid not null references profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references profiles(id) on delete restrict,
  accepted_at timestamptz,
  revoked_by uuid references profiles(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index one_pending_teacher_invite_per_school_email
on teacher_invitations (school_id, lower(email))
where status = 'pending';
```

`profiles.email`, `profiles.account_type`, and `profiles.status` are server-managed. A bootstrap trigger may create a student profile from a confirmed Auth identity, but it must never grant teacher/admin capability. Teacher invitation consumption compares normalized verified email, locks the invitation/profile rows, updates account type, and creates the school membership atomically.

Platform-admin checks use `platform_admins`; admin is never stored in `class_members` or `school_memberships`. Admin table grants are not directly writable through the Data API.

## 3. Classes and class membership

### `classes`

```sql
create table classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),
  name text not null,
  subject text,
  academic_year text,
  semester text,
  description text,

  min_group_size integer not null default 1 check (min_group_size >= 1),
  max_group_size integer not null default 5 check (max_group_size >= min_group_size),
  maximum_groups integer not null default 1 check (maximum_groups >= 1),
  allow_student_groups boolean not null default true,
  group_formation_status text not null default 'closed'
    check (group_formation_status in ('open','closed')),

  created_by uuid not null references profiles(id),
  status text not null default 'active'
    check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Application and RPC validation must ensure `max_group_size >= min_group_size` and handle configuration changes that conflict with already formed groups.

### `class_members`

```sql
create table class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('student','teacher')),
  status text not null default 'active' check (status in ('active','left')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (class_id, user_id)
);
```

### `class_invites`

```sql
create table class_invites (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references profiles(id),
  expires_at timestamptz,
  max_uses integer,
  used_count integer not null default 0,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);
```

Joining must occur through an RPC that validates the invite, increments usage atomically, and creates a student membership. The caller never supplies the joined role.

## 4. Student-led groups

### `groups`

```sql
create table groups (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  description text,
  icon_key text,
  created_by uuid not null references profiles(id),
  creator_type text not null check (creator_type in ('student','teacher')),
  status text not null default 'forming'
    check (status in ('forming','ready','approved','locked','archived')),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  locked_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Only groups with `deleted_at is null` and status other than `archived` count toward current group capacity.

### `group_members`

```sql
create table group_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('leader','member')),
  status text not null check (status in ('active','left','removed')),
  invited_by uuid references profiles(id),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
```

The application must verify that `group_members.class_id` matches `groups.class_id`. This may be enforced with a composite foreign key or through trusted mutation functions and database triggers.

### Exactly one leader per active group

```sql
create unique index one_active_leader_per_group
on group_members(group_id)
where role = 'leader' and status = 'active';
```

A populated forming/ready/approved/locked group must always have exactly one leader. The unique index prevents more than one; RPCs must prevent zero.

### One current group per student per class

```sql
create unique index one_active_group_per_student_per_class
on group_members(class_id, user_id)
where status = 'active';
```

This applies equally to leaders and ordinary members.

### One student-created group per class

A permanent creation claim prevents a student from repeatedly creating and deleting groups to become leader again.

Recommended table:

```sql
create table student_group_creation_claims (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  group_id uuid references groups(id),
  status text not null default 'claimed'
    check (status in ('claimed','reset_by_teacher')),
  reset_by uuid references profiles(id),
  reset_at timestamptz,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);
```

The teacher may reset a claim only when the previous group was invalid, deleted before use, or otherwise explicitly resolved. The reset is audited.

### `group_invitations`

```sql
create table group_invitations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  invitee_id uuid not null references profiles(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','expired')),
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, invitee_id)
);
```

Only a current leader or teacher may create invitations. Acceptance checks current group membership and destination capacity again; a stale invitation does not bypass constraints.

### Group membership history

```sql
create table group_membership_history (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id),
  group_id uuid references groups(id),
  user_id uuid not null references profiles(id),
  event_type text not null check (event_type in (
    'joined','left','removed','moved_in','moved_out',
    'became_leader','leadership_transferred'
  )),
  actor_id uuid references profiles(id),
  related_group_id uuid references groups(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

## 5. Atomic group operations

### `create_student_group(class_id, name, description)`

The function must run in one transaction and:

1. validate `auth.uid()` is an active student in the class;
2. lock the class configuration row;
3. verify student group creation is enabled and formation is open;
4. verify the student has no active group in the class;
5. verify no unreset creation claim exists;
6. count current non-archived/non-deleted groups;
7. fail with `GROUP_LIMIT_REACHED` when count >= `maximum_groups`;
8. create the group;
9. create the creation claim;
10. add the creator as the sole active leader;
11. write audit/research events;
12. create/broadcast the class group-change event.

The row lock ensures two students racing for the final slot cannot both succeed.

### `accept_group_invitation(invitation_id)`

The function revalidates:

- invitation is pending and not expired;
- student is an active class member;
- student is not already in another active group;
- destination group is accepting members and not full;
- group formation/membership is not locked.

It then activates membership, marks the invitation accepted, expires/cancels incompatible pending invitations, creates notifications, and emits group-change events.

### `transfer_group_leadership(group_id, new_leader_id)`

The function changes the old leader to member and new member to leader atomically. It is allowed for the current leader before lock or for a teacher. It must never commit a state with zero or two active leaders.

### `move_student_between_groups(class_id, student_id, destination_group_id, successor_leader_id)`

Teacher-only operation. It must:

- lock source/destination memberships and groups;
- verify same class and destination capacity;
- block normal movement during an affected active session;
- handle source leadership before moving;
- update memberships atomically;
- cancel incompatible invitations;
- write membership history, audit events, and notifications;
- emit group-change events.

### `delete_or_archive_group(group_id, member_handling)`

Teacher-only operation.

- If no session/history dependency exists, soft-delete the group, cancel invitations, and return members to unassigned or move them as explicitly requested.
- If the group has session history, set status `archived` and preserve all relationships.
- An affected active session blocks the ordinary operation.
- Deletion/archival emits notifications and restores a group slot only when the group no longer counts toward current formation.

## 6. In-app notifications

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index notifications_unread_by_user
on notifications(recipient_id, created_at desc)
where read_at is null;
```

RLS permits recipients to select and mark only their own notifications. Trusted domain functions create notifications. Email delivery is out of scope for the MVP.

## 7. Session constraints

### `exploration_session_groups`

```sql
create table exploration_session_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references exploration_sessions(id) on delete cascade,
  group_id uuid not null references groups(id),
  queue_position integer not null,
  status text not null check (status in ('waiting','ready','active','paused','completed')),
  activated_at timestamptz,
  completed_at timestamptz,
  unique (session_id, group_id),
  unique (session_id, queue_position)
);

create unique index one_active_group_per_session
on exploration_session_groups(session_id)
where status = 'active';
```

Group activation occurs through one atomic RPC that validates teacher permission and session status.

### Participant snapshot

```sql
create table session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references exploration_sessions(id) on delete cascade,
  session_group_id uuid not null references exploration_session_groups(id),
  user_id uuid not null references profiles(id),
  role_at_start text not null,
  participation_status text not null default 'active',
  joined_at timestamptz,
  left_at timestamptz,
  unique (session_id, user_id)
);
```

Observations reference `session_participant_id` so later group changes do not rewrite history.

## 8. Observations

```sql
create table observations (
  id uuid primary key default gen_random_uuid(),
  client_generated_id uuid not null,
  activity_id uuid not null references activities(id),
  session_id uuid not null references exploration_sessions(id),
  session_group_id uuid not null references exploration_session_groups(id),
  session_participant_id uuid not null references session_participants(id),
  observer_id uuid not null references profiles(id),

  capture_location geography(point, 4326),
  capture_accuracy_m numeric,
  captured_at timestamptz not null,
  location_status text not null default 'captured'
    check (location_status in ('captured','unavailable','teacher_accepted_missing')),

  status text not null check (status in (
    'draft','images_uploading','analysis_queued','analysis_running',
    'student_review','submitted','teacher_review','revision_required',
    'resubmitted','verified','unable_to_verify','rejected'
  )),

  student_common_name text,
  student_scientific_name text,
  student_evidence_note text,
  normalized_taxon_key text,
  specimen_id uuid,

  same_species_in_session boolean not null default false,
  same_species_count integer not null default 0,

  first_submitted_at timestamptz,
  latest_submitted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (observer_id, client_generated_id)
);
```

Submission validation requires:

- at least one uploaded media row;
- no more than ten media rows;
- Thai/common name;
- scientific name;
- evidence note;
- student review payload;
- location or explicit flagged location state.

The capture location is the marker location. Do not require or store submission location for normal map behavior.

## 9. Observation media

```sql
create table observation_media (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  position integer not null check (position between 1 and 10),
  category text not null check (category in (
    'whole_plant','leaf','leaf_underside','stem_trunk',
    'flower','fruit','habitat','other'
  )),
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 5242880),
  width_px integer,
  height_px integer,
  image_hash text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  unique (observation_id, position)
);
```

Application validation enforces one `whole_plant` image and a maximum of ten images. Bucket policy/config should limit accepted MIME types and processed file size.

## 10. AI analysis

### `ai_analysis_runs`

```sql
create table ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  provider text not null default 'gemini',
  model text not null,
  prompt_version text not null,
  response_schema_version text not null,
  status text not null check (status in (
    'queued','running','succeeded','failed','cancelled'
  )),
  attempt_count integer not null default 0,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  latency_ms integer,
  usage_metadata jsonb not null default '{}'::jsonb
);
```

### `observation_ai_results`

```sql
create table observation_ai_results (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null unique references ai_analysis_runs(id) on delete cascade,
  observation_id uuid not null references observations(id) on delete cascade,
  normalized_result jsonb not null,
  raw_response_reference text,
  top_common_name text,
  top_scientific_name text,
  top_confidence numeric,
  created_at timestamptz not null default now()
);
```

The exact JSON shape may be finalized later, but every stored payload must declare/associate its schema version and pass server validation.

## 11. Student verification and submissions

### Trait verification

```sql
create table student_trait_verifications (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  analysis_run_id uuid references ai_analysis_runs(id),
  trait_key text not null,
  ai_value jsonb,
  student_status text not null check (student_status in (
    'match','not_match','unsure','not_visible'
  )),
  corrected_value jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (observation_id, analysis_run_id, trait_key)
);
```

### Submission history

```sql
create table observation_submissions (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  submission_number integer not null,
  submitted_by uuid not null references profiles(id),
  common_name text not null,
  scientific_name text not null,
  evidence_note text not null,
  verification_snapshot jsonb not null,
  media_snapshot jsonb not null,
  same_species_acknowledged boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (observation_id, submission_number)
);
```

A revision creates a new submission row; it does not erase the previous row.

## 12. Teacher review

```sql
create table teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  submission_id uuid not null references observation_submissions(id),
  reviewer_id uuid not null references profiles(id),
  decision text not null check (decision in (
    'verified','revision_required','unable_to_verify','rejected'
  )),
  verified_common_name text,
  verified_scientific_name text,
  corrected_traits jsonb not null default '{}'::jsonb,
  feedback text,
  reviewed_at timestamptz not null default now()
);
```

Teacher corrections are separate from Gemini and student values. The latest verified review is used for the verified display identity.

## 13. Same-species and specimen relationships

```sql
create table observation_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  candidate_observation_id uuid not null references observations(id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'same_species','possible_same_specimen'
  )),
  taxon_match_score numeric,
  morphology_similarity_score numeric,
  visual_similarity_score numeric,
  location_distance_m numeric,
  temporal_distance_seconds integer,
  combined_score numeric,
  system_recommendation text,
  student_acknowledged_at timestamptz,
  teacher_decision text,
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (observation_id, candidate_observation_id, relationship_type)
);
```

Same-species matching is scoped to the same session for the MVP. It warns, tags, and creates a teacher notification but never blocks.

```sql
create table specimens (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id),
  normalized_taxon_key text,
  canonical_location geography(point, 4326),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
```

Separate observations may reference one specimen only after human confirmation. Never merge automatically.

## 14. Status and research events

```sql
create table observation_status_history (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create table research_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  schema_version integer not null check (schema_version >= 1),
  actor_id uuid references profiles(id) on delete restrict,
  school_id uuid references schools(id) on delete restrict,
  class_id uuid references classes(id) on delete restrict,
  group_id uuid references groups(id) on delete restrict,
  activity_id uuid references activities(id) on delete restrict,
  session_id uuid references exploration_sessions(id) on delete restrict,
  observation_id uuid references observations(id) on delete restrict,
  request_id uuid,
  trace_id text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index research_events_name_time_idx
on research_events (event_name, occurred_at desc, id desc);

create index research_events_session_time_idx
on research_events (session_id, occurred_at desc, id desc)
where session_id is not null;
```

Use rows for events, not one growing JSON array. The allowlisted payload contract is versioned in `RESEARCH_EVENT_DICTIONARY.md`; relational IDs support filtering and are pseudonymized or excluded from research export.

## 14A. Activities, geometry, and sessions

Published activity versions are immutable. A session references one published version so later activity edits never rewrite historical route/boundary/checkpoint data.

```sql
create table activities (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft','published','archived')),
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activities_class_status_updated_idx
on activities (class_id, status, updated_at desc, id desc);

create table activity_versions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  title text not null,
  instructions text,
  status text not null default 'draft'
    check (status in ('draft','published','superseded')),
  created_by uuid not null references profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (activity_id, version_number)
);

create unique index one_published_activity_version
on activity_versions (activity_id)
where status = 'published';

create table activity_routes (
  activity_version_id uuid primary key references activity_versions(id) on delete cascade,
  route geometry(linestring, 4326) not null,
  created_at timestamptz not null default now(),
  check (not st_isempty(route) and st_isvalid(route) and st_npoints(route) between 2 and 2000)
);

create table activity_boundaries (
  activity_version_id uuid primary key references activity_versions(id) on delete cascade,
  boundary geometry(polygon, 4326) not null,
  created_at timestamptz not null default now(),
  check (not st_isempty(boundary) and st_isvalid(boundary) and st_npoints(boundary) between 4 and 2000)
);

create table activity_checkpoints (
  id uuid primary key default gen_random_uuid(),
  activity_version_id uuid not null references activity_versions(id) on delete cascade,
  sequence_number integer not null check (sequence_number >= 1),
  title text not null,
  instructions text,
  location geometry(point, 4326) not null,
  radius_m numeric not null default 20 check (radius_m > 0 and radius_m <= 500),
  created_at timestamptz not null default now(),
  unique (activity_version_id, sequence_number)
);

create index activity_checkpoints_version_idx
on activity_checkpoints (activity_version_id, sequence_number);

create table activity_plugin_configs (
  activity_version_id uuid primary key references activity_versions(id) on delete cascade,
  plugin_key text not null default 'plant_survey',
  schema_version integer not null check (schema_version >= 1),
  config jsonb not null,
  created_at timestamptz not null default now()
);

create table exploration_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete restrict,
  activity_version_id uuid not null references activity_versions(id) on delete restrict,
  title text not null,
  scheduled_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled','open','paused','completed')),
  opened_by uuid references profiles(id) on delete restrict,
  opened_at timestamptz,
  paused_at timestamptz,
  completed_by uuid references profiles(id) on delete restrict,
  completed_at timestamptz,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exploration_sessions_class_status_scheduled_idx
on exploration_sessions (class_id, status, scheduled_at desc, id desc);

create table location_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references exploration_sessions(id) on delete cascade,
  session_participant_id uuid not null references session_participants(id) on delete cascade,
  event_type text not null check (event_type in ('sample','boundary_warning','checkpoint_reached')),
  location geography(point, 4326),
  accuracy_m numeric,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  device_context jsonb not null default '{}'::jsonb
);

create index location_events_session_participant_time_idx
on location_events (session_id, session_participant_id, recorded_at desc, id desc);

create table location_tracks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references exploration_sessions(id) on delete cascade,
  session_participant_id uuid not null references session_participants(id) on delete cascade,
  track geometry(linestring, 4326) not null,
  sample_count integer not null check (sample_count >= 2),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  generated_at timestamptz not null default now(),
  unique (session_id, session_participant_id)
);

create table session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references exploration_sessions(id) on delete cascade,
  session_group_id uuid references exploration_session_groups(id) on delete set null,
  actor_id uuid references profiles(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index session_events_session_created_idx
on session_events (session_id, created_at desc, id desc);
```

The API accepts GeoJSON in longitude/latitude order and converts to SRID 4326 at the boundary. Publishing validates that the route and checkpoints are inside or intersect the boundary according to the activity rule, that checkpoint order is unique, and that the geometry is valid. Published versions and versions referenced by sessions reject mutation/delete.

## 14B. Revision access and issue reports

```sql
create table observation_revision_topics (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  review_id uuid not null references teacher_reviews(id) on delete cascade,
  field_key text not null,
  opened_by uuid not null references profiles(id) on delete restrict,
  opened_at timestamptz not null default now(),
  unique (review_id, field_key)
);

create table observation_unlock_requests (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  requested_by uuid not null references profiles(id) on delete restrict,
  requested_fields text[] not null check (cardinality(requested_fields) between 1 and 20),
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending','granted','denied','cancelled')),
  decided_by uuid references profiles(id) on delete restrict,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index one_pending_unlock_request_per_observation
on observation_unlock_requests (observation_id, requested_by)
where status = 'pending';

create table observation_issue_reports (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete restrict,
  report_type text not null check (report_type in ('identity','image','privacy','other')),
  reason text not null,
  status text not null default 'open'
    check (status in ('open','reviewing','resolved','dismissed')),
  resolved_by uuid references profiles(id) on delete restrict,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index observation_issue_reports_observation_created_idx
on observation_issue_reports (observation_id, created_at desc, id desc);

create index observation_issue_reports_reporter_created_idx
on observation_issue_reports (reporter_id, created_at desc, id desc);
```

Issue-report creation is a trusted function that locks a reporter/observation-scoped key, checks for a report within the preceding 24 hours, inserts once, and notifies the class teacher. The observation owner never receives reporter identity through RLS/read models.

## 14C. Idempotency, audit, operations, incidents, and exports

```sql
create table idempotency_keys (
  user_id uuid not null references profiles(id) on delete cascade,
  scope text not null,
  key uuid not null,
  request_hash text not null,
  status text not null default 'pending'
    check (status in ('pending','completed','failed')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, scope, key)
);

create index idempotency_keys_expiry_idx
on idempotency_keys (expires_at);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('student','teacher','admin','system','worker')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  class_id uuid references classes(id) on delete restrict,
  session_id uuid references exploration_sessions(id) on delete restrict,
  outcome text not null check (outcome in ('succeeded','denied','failed')),
  request_id uuid,
  trace_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx
on audit_logs (created_at desc, id desc);

create index audit_logs_actor_created_idx
on audit_logs (actor_id, created_at desc, id desc);

create index audit_logs_resource_created_idx
on audit_logs (resource_type, resource_id, created_at desc, id desc);

create table operational_error_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  release_version text,
  flow text not null,
  stage text not null,
  error_code text not null,
  severity text not null check (severity in ('info','warning','error','critical')),
  request_id uuid,
  trace_id text,
  actor_id uuid references profiles(id) on delete set null,
  class_id uuid references classes(id) on delete set null,
  session_id uuid references exploration_sessions(id) on delete set null,
  fingerprint text not null,
  redacted_context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index operational_errors_flow_time_idx
on operational_error_events (flow, occurred_at desc, id desc);

create index operational_errors_code_time_idx
on operational_error_events (error_code, occurred_at desc, id desc);

create table operational_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text not null check (severity in ('sev1','sev2','sev3','sev4')),
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved')),
  flow text,
  opened_by uuid not null references profiles(id) on delete restrict,
  acknowledged_by uuid references profiles(id) on delete restrict,
  acknowledged_at timestamptz,
  resolved_by uuid references profiles(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table operational_incident_notes (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references operational_incidents(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete restrict,
  note text not null,
  created_at timestamptz not null default now()
);

create index operational_incident_notes_incident_time_idx
on operational_incident_notes (incident_id, created_at, id);

create table exports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references profiles(id) on delete restrict,
  class_id uuid not null references classes(id) on delete cascade,
  session_id uuid references exploration_sessions(id) on delete cascade,
  export_type text not null check (export_type in ('csv','geojson','research_csv')),
  status text not null default 'queued'
    check (status in ('queued','running','ready','failed','expired')),
  request_payload jsonb not null default '{}'::jsonb,
  storage_path text,
  row_count integer check (row_count >= 0),
  failure_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null
);

create index exports_requester_created_idx
on exports (requested_by, created_at desc, id desc);

create index exports_queue_idx
on exports (created_at, id)
where status = 'queued';
```

Idempotency entries are scoped to caller and operation, retain the original request hash/response for 24 hours, and reject same-key/different-body reuse. Cleanup uses the expiry index.

Audit/research/status/session/submission/review/admin-note rows are append-only for application roles. Operational context is redacted before insert. High-cardinality IDs are query fields, not metrics labels.

Export workers claim queued jobs without blocking peers, reauthorize scope at generation and download, write to the private export path, notify only after commit, and expire/delete artifacts after seven days.

## 15. Recommended RPCs

```text
join_class_with_invite(code)
consume_teacher_invitation(token)
grant_platform_admin(user_id, reason)
revoke_platform_admin(user_id, reason)
request_break_glass_access(resource_type, resource_id, reason, expires_at)
approve_break_glass_access(grant_id)
revoke_break_glass_access(grant_id, reason)
create_student_group(class_id, name, description)
invite_classmate_to_group(group_id, invitee_id)
accept_group_invitation(invitation_id)
decline_group_invitation(invitation_id)
transfer_group_leadership(group_id, new_leader_id)
move_student_between_groups(class_id, student_id, destination_group_id, successor_leader_id)
delete_or_archive_group(group_id, member_handling)
set_group_formation_state(class_id, state)
mark_notification_read(notification_id)

open_exploration_session(session_id)
activate_session_group(session_id, group_id)
start_observation(session_id, client_generated_id, capture_metadata)
queue_observation_analysis(observation_id)
submit_observation(observation_id, expected_version)
request_observation_revision(observation_id, submission_id, feedback)
review_observation(observation_id, submission_id, decision, corrections)
complete_exploration_session(session_id)
request_additional_revision_fields(observation_id, field_keys, reason)
decide_revision_unlock_request(request_id, decision, field_keys, note)
report_observation_issue(observation_id, report_type, reason)
request_export(class_id, session_id, export_type, filters)
acknowledge_operational_incident(incident_id)
append_operational_incident_note(incident_id, note)
```

Sensitive functions validate `auth.uid()`, set a fixed `search_path`, restrict execute grants, and emit audit/status/notification events.

## 16. RLS intent

- Unconfirmed Auth users cannot access protected application tables.
- A user reads/updates only permitted presentation fields on their own profile; email, account type, status, and grants are server-managed.
- Teacher invitation and platform-admin grant tables are not directly writable by ordinary authenticated users.
- Platform admin reads use protected server operations/read models, require an active relational grant, and are themselves audited.
- Student reads class/session data only with active membership/participant access.
- Student reads class group summaries required for group formation.
- Student creates a group only through the trusted group-creation RPC.
- Leader manages invitations/membership only for their own unlocked group.
- Student reads and marks only their own notifications.
- Teacher manages groups only in classes they teach.
- Student creates and edits only their own observation while workflow state permits.
- Student cannot edit prior submission or teacher-review rows.
- Teacher reads/reviews observations only for classes they teach.
- Draft observation/media are private to creator and authorized teacher only as specifically required.
- Submitted/completed observation visibility to classmates follows session/class rules.
- AI worker access uses trusted server credentials and validates target observation/session.
- Research/audit tables are not broadly exposed to students.
- Raw location events/tracks are visible only to the authorized class teacher and retention workers; completed-map access does not imply track access.
- Observation issue-report read models hide reporter identity from the observation owner.
- Operational error/incident/export tables are private to authorized server workers/admin operations and apply explicit grants in addition to RLS.

Use `(select auth.uid())` in policies and index membership/ownership columns used by RLS. `TO authenticated` without an ownership/membership/admin predicate is not authorization. Every update policy has both `USING` and `WITH CHECK`.

Views in exposed schemas use `security_invoker = true`. Privileged helper functions live in a non-exposed schema, set `search_path = ''`, validate `(select auth.uid())`, and revoke `EXECUTE` from `PUBLIC` before granting the minimum caller role.

## 17. Storage paths

```text
observation-images/{class_id}/{session_id}/{observation_id}/{media_id}.webp
activity-assets/{class_id}/{activity_id}/{asset_id}
activity-exports/{class_id}/{session_id}/{export_id}
```

Do not trust path segments as authorization. Storage policies derive permission from database membership and observation ownership/status.
