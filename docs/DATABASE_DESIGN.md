# Database Design

## 1. Principles

- PostgreSQL is the source of truth.
- Use UUID primary keys and `timestamptz`.
- Use PostGIS for route, boundary, capture location, and spatial candidate search.
- Enable RLS on every table in exposed schemas.
- Critical invariants use constraints, partial unique indexes, and atomic functions.
- Core queryable data uses relational columns.
- Flexible AI/research payloads may use versioned `jsonb`.
- Preserve append-only history for AI runs, submissions, reviews, status changes, and research events.

## 2. Core tables

```text
profiles
schools
school_memberships
classes
class_members
class_invites

groups
group_members
activities
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
observation_status_history
observation_duplicate_candidates
specimens
research_events

notifications
audit_logs
exports
```

## 3. Session constraints

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

## 4. Observations

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

## 5. Observation media

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

## 6. AI analysis

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

## 7. Student verification and submissions

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

Additional flexible student verification context may be stored in a `jsonb` summary on the submission row, but key decisions remain queryable.

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

## 8. Teacher review

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

## 9. Same-species and specimen relationships

### Candidate table

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

Same-species matching is scoped to the same session for the MVP. It warns and tags but never blocks.

### Specimen

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

## 10. Status and research events

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
  event_type text not null,
  occurred_at timestamptz not null default now(),
  user_id uuid references profiles(id),
  class_id uuid references classes(id),
  activity_id uuid references activities(id),
  session_id uuid references exploration_sessions(id),
  observation_id uuid references observations(id),
  payload jsonb not null default '{}'::jsonb
);
```

Use rows for events, not one growing JSON array. `jsonb` payloads may evolve while relational IDs support filtering and research export.

## 11. Recommended RPCs

```text
join_class_with_invite(code)
open_exploration_session(session_id)
activate_session_group(session_id, group_id)
start_observation(session_id, client_generated_id, capture_metadata)
queue_observation_analysis(observation_id)
submit_observation(observation_id, expected_version)
request_observation_revision(observation_id, submission_id, feedback)
review_observation(observation_id, submission_id, decision, corrections)
complete_exploration_session(session_id)
```

Sensitive functions validate `auth.uid()`, set a fixed `search_path`, restrict execute grants, and emit audit/status events.

## 12. RLS intent

- Student reads class/session data only with active membership/participant access.
- Student creates and edits only their own observation while workflow state permits.
- Student cannot edit prior submission or teacher-review rows.
- Teacher reads/reviews observations only for classes they teach.
- Draft observation/media are private to creator and authorized teacher only as specifically required.
- Submitted/completed observation visibility to classmates follows session/class rules.
- AI worker access uses trusted server credentials and validates target observation/session.
- Research/audit tables are not broadly exposed to students.

## 13. Storage paths

```text
observation-images/{class_id}/{session_id}/{observation_id}/{media_id}.webp
activity-assets/{class_id}/{activity_id}/{asset_id}
activity-exports/{class_id}/{session_id}/{export_id}
```

Do not trust path segments as authorization. Storage policies derive permission from database membership and observation ownership/status.