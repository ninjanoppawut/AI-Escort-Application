# Database Design

## 1. Principles

- PostgreSQL is the source of truth.
- Use UUID primary keys and `timestamptz` timestamps.
- Store geometry in PostGIS columns.
- Enable RLS on every exposed table.
- Preserve AI output, student verification, and teacher review separately.
- Enforce critical session rules with database constraints and transactions.
- Never auto-delete or auto-merge observations from dedupe scores.

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
exploration_sessions
exploration_session_groups
session_participants
location_events
location_tracks
observations
observation_media
ai_analysis_runs
ai_plant_candidates
ai_observed_traits
student_trait_verifications
observation_identifications
plant_specimens
observation_duplicate_candidates
teacher_reviews
observation_status_history
reflections
assessment_results
audit_logs
```

## 3. Session constraints

```sql
create unique index one_active_group_per_session
on exploration_session_groups(session_id)
where status = 'active';
```

Group activation must run through one atomic transaction/RPC.

## 4. Session participant snapshot

```sql
create table session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references exploration_sessions(id) on delete cascade,
  session_group_id uuid not null references exploration_session_groups(id),
  user_id uuid not null references profiles(id),
  role_at_start text not null,
  participation_status text not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique(session_id, user_id)
);
```

Observation and track ownership should reference the participant snapshot where practical.

## 5. Observations

```sql
create table observations (
  id uuid primary key default gen_random_uuid(),
  client_generated_id uuid not null,
  session_id uuid not null references exploration_sessions(id),
  activity_id uuid not null references activities(id),
  session_group_id uuid not null references exploration_session_groups(id),
  participant_id uuid not null references session_participants(id),
  observer_id uuid not null references profiles(id),

  capture_location geography(point, 4326) not null,
  capture_accuracy_m numeric,
  captured_at timestamptz not null,
  capture_boundary_state text,

  submission_location geography(point, 4326),
  submission_accuracy_m numeric,
  submitted_at timestamptz,

  normalized_taxon_id text,
  specimen_id uuid,
  duplicate_status text not null default 'not_checked',

  status text not null check (status in (
    'draft','media_pending','analyzing','student_review','duplicate_review',
    'ready_to_submit','submitted','teacher_review','verified',
    'revision_required','unable_to_verify','rejected'
  )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(observer_id, client_generated_id)
);
```

Capture location is authoritative for the plant record. Submission location is retained separately.

## 6. Observation media

```sql
create table observation_media (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  storage_path text not null,
  media_type text not null,
  evidence_type text,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);
```

## 7. Gemini analysis

```sql
create table ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  provider text not null,
  model text not null,
  schema_version integer not null,
  prompt_version text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  raw_response_path text
);
```

```sql
create table ai_plant_candidates (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references ai_analysis_runs(id) on delete cascade,
  rank integer not null,
  provider_taxon_id text,
  normalized_taxon_id text,
  common_name_th text,
  common_name_en text,
  scientific_name text,
  confidence numeric,
  evidence_summary text,
  unique(analysis_run_id, rank)
);
```

```sql
create table ai_observed_traits (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references ai_analysis_runs(id) on delete cascade,
  trait_key text not null,
  proposed_value text,
  visibility_state text not null default 'visible',
  confidence numeric,
  unique(analysis_run_id, trait_key)
);
```

`visibility_state` should distinguish visible, uncertain, not_visible, and unknown.

## 8. Student verification

```sql
create table student_trait_verifications (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  ai_trait_id uuid not null references ai_observed_traits(id),
  student_status text not null check (student_status in (
    'match','not_match','unsure','not_visible'
  )),
  corrected_value text,
  evidence_note text,
  verified_by uuid not null references profiles(id),
  verified_at timestamptz not null default now(),
  unique(observation_id, ai_trait_id, verified_by)
);
```

## 9. Identification records

```sql
create table observation_identifications (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  source text not null check (source in ('ai','student','teacher','expert')),
  suggested_by uuid references profiles(id),
  normalized_taxon_id text,
  scientific_name text,
  common_name_th text,
  common_name_en text,
  confidence numeric,
  evidence_summary text,
  is_accepted boolean not null default false,
  created_at timestamptz not null default now()
);
```

Only an authorized teacher/expert workflow may mark the final identification accepted.

## 10. Species and specimen deduplication

### Plant specimens

```sql
create table plant_specimens (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id),
  normalized_taxon_id text,
  representative_location geography(point, 4326),
  created_at timestamptz not null default now()
);
```

Observations confirmed to represent the same physical plant may share a specimen record. Observation evidence remains separate.

### Duplicate candidates

```sql
create table observation_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  candidate_observation_id uuid not null references observations(id) on delete cascade,
  duplicate_level text not null check (duplicate_level in ('species','specimen')),
  taxon_match_score numeric,
  trait_similarity_score numeric,
  visual_similarity_score numeric,
  location_distance_m numeric,
  time_difference_seconds integer,
  combined_score numeric,
  system_recommendation text,
  student_decision text check (student_decision in (
    'same_specimen','different_specimen','unsure'
  )),
  student_decided_by uuid references profiles(id),
  student_decided_at timestamptz,
  teacher_decision text,
  teacher_decided_by uuid references profiles(id),
  teacher_decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique(observation_id, candidate_observation_id, duplicate_level)
);
```

Rules:

- Same normalized taxon creates a species-level warning.
- Species-level duplication does not block submission.
- Specimen-level ranking combines taxon, traits, image similarity, location, and time.
- Distance alone cannot create a confirmed duplicate.
- No automatic delete or merge is allowed.

## 11. Teacher review

```sql
create table teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  reviewer_id uuid not null references profiles(id),
  decision text not null check (decision in (
    'verified','revision_required','unable_to_verify','rejected'
  )),
  accepted_identification_id uuid references observation_identifications(id),
  duplicate_decision text,
  feedback text,
  reviewed_at timestamptz not null default now()
);
```

## 12. Status history

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
```

## 13. Recommended RPCs

```text
open_exploration_session(session_id)
activate_session_group(session_id, group_id)
create_observation_draft(payload)
request_gemini_analysis(observation_id)
record_student_trait_verification(payload)
run_observation_dedupe(observation_id)
submit_observation(observation_id, submission_location)
review_observation(observation_id, decision, feedback)
resolve_duplicate_candidate(candidate_id, decision)
```

Sensitive functions must validate `auth.uid()`, use fixed `search_path`, and restrict execution grants.

## 14. RLS intent

- Students create and edit only their own drafts while their group is active.
- Submitted records become immutable to students except through a revision workflow.
- Students see only observations allowed by class/session policy.
- Teachers review observations in classes they teach.
- Gemini service writes only through trusted server functions.
- Duplicate candidates never expose observations outside authorized class/session scope.

## 15. Retention

- Raw live-location events: short configurable retention.
- Capture location and summarized track: retained with educational evidence according to school/research policy.
- Original observation images: private by default.
- Gemini payloads: retain normalized output; minimize raw prompt/response retention.
- Audit, review, and status history: restricted and retained longer.