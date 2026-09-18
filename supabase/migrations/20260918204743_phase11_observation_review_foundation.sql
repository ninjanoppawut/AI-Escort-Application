begin;

-- P11-01: student review, immutable submissions, same-species relations, and
-- histories (REV-001 to REV-006; DATABASE_DESIGN §§8, 11, 13; D-012 to D-015,
-- D-022 to D-026, D-052, D-055). The manual path is draft -> student_review ->
-- submitted; AI candidates (P10) and teacher review (P12) extend the same
-- transition function later. Same-species and possible-same-specimen signals
-- never block, merge, or change either observation.

-- Observation columns ---------------------------------------------------------------

alter table public.observations
  add column identity_source text,
  add column student_reference_note text,
  add column normalized_taxon_key text,
  add column same_species_in_session boolean not null default false,
  add column same_species_count integer not null default 0,
  add column first_submitted_at timestamptz,
  add column latest_submitted_at timestamptz,
  add column submission_count integer not null default 0,
  add constraint observations_identity_source_check check (
    identity_source is null or identity_source in ('manual', 'ai_candidate')
  ),
  add constraint observations_reference_note_check check (
    student_reference_note is null or char_length(student_reference_note) between 1 and 300
  ),
  add constraint observations_same_species_count_check check (same_species_count >= 0),
  add constraint observations_submission_count_check check (submission_count >= 0),
  add constraint observations_submitted_at_check check (
    (first_submitted_at is null) = (submission_count = 0)
  );

create index observations_session_taxon_submitted_idx
  on public.observations (session_id, normalized_taxon_key)
  where first_submitted_at is not null;

alter table public.observation_media
  add constraint observation_media_id_observation_unique unique (id, observation_id);

-- Pure helpers --------------------------------------------------------------------------

-- Syntactic binomial key for same-species matching within a session (taxon-key-v1).
-- It does not depend on a taxonomy source (DEC-Q004 is open): no synonyms, no
-- common names; indeterminate names never match. The version is stored so a
-- later authoritative normalization can recompute it.
create function private.observation_taxon_key_v1(scientific_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text;
  tokens text[];
  genus text;
  epithet text;
begin
  if scientific_name is null then
    return null;
  end if;

  cleaned := lower(btrim(normalize(scientific_name, NFKC)));
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  if cleaned = '' then
    return null;
  end if;

  tokens := string_to_array(cleaned, ' ');
  genus := tokens[1];

  if genus in ('×', 'x') and array_length(tokens, 1) >= 3 then
    genus := tokens[2];
    epithet := tokens[3];
  elsif array_length(tokens, 1) >= 2 then
    epithet := tokens[2];
    if epithet in ('×', 'x') and array_length(tokens, 1) >= 3 then
      epithet := 'x ' || tokens[3];
    end if;
  else
    return null;
  end if;

  if genus !~ '^[a-z]{2,}$' then
    return null;
  end if;

  if epithet in ('sp.', 'sp', 'spp.', 'spp', 'cf.', 'cf', 'aff.', 'aff') then
    return null;
  end if;

  if epithet !~ '^(x )?[a-z][a-z-]*$' then
    return null;
  end if;

  return genus || ' ' || epithet;
end;
$$;

create function private.is_unknown_plant_name(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is null
    or btrim(value) = ''
    or btrim(value) !~ '[[:alnum:]ก-๙]'
    or lower(btrim(value)) in ('ไม่ทราบ', 'ไม่รู้', 'ไม่แน่ใจ', 'unknown', 'n/a', 'na', '-', '?');
$$;

-- Working minimum from design S-20 (owner confirmation item 63).
create function private.observation_evidence_note_min_chars()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20;
$$;

-- Transitions and guards -------------------------------------------------------------------

-- P10 adds the analysis edges and P12 the review edges with create or replace.
create or replace function private.observation_status_transition_allowed(from_status text, to_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (from_status, to_status) in (
    ('draft', 'student_review'),
    ('student_review', 'submitted')
  );
$$;

create or replace function private.observation_edit_denial(target_observation_id uuid)
returns table(code text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  observation_row public.observations%rowtype;
  session_row public.exploration_sessions%rowtype;
  session_group_row public.exploration_session_groups%rowtype;
begin
  select * into observation_row from public.observations as candidate where candidate.id = target_observation_id;
  select * into session_row from public.exploration_sessions as candidate where candidate.id = observation_row.session_id;
  select * into session_group_row
  from public.exploration_session_groups as candidate
  where candidate.id = observation_row.session_group_id;

  if observation_row.status in (
    'submitted', 'teacher_review', 'revision_required', 'resubmitted', 'verified', 'unable_to_verify', 'rejected'
  ) then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'submitted'::text;
  elsif observation_row.status not in ('draft', 'student_review') then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'not_draft'::text;
  elsif session_row.status = 'completed' then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'session_completed'::text;
  elsif session_group_row.status = 'completed' then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'group_completed'::text;
  elsif session_row.status not in ('open', 'paused') or session_group_row.status not in ('active', 'paused') then
    return query select 'INVALID_STATUS_TRANSITION'::text, 'group_waiting'::text;
  else
    return query select null::text, null::text;
  end if;
end;
$$;

create or replace function private.guard_observation_update()
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

  -- Submitted content is frozen; revisions (P12) record new submissions instead.
  if old.status in ('submitted', 'teacher_review', 'revision_required', 'resubmitted', 'verified',
      'unable_to_verify', 'rejected')
    and (new.student_common_name, new.student_scientific_name, new.student_evidence_note,
         new.student_reference_note, new.identity_source, new.normalized_taxon_key,
         new.same_species_in_session, new.same_species_count, new.first_submitted_at,
         new.submission_count)
      is distinct from
        (old.student_common_name, old.student_scientific_name, old.student_evidence_note,
         old.student_reference_note, old.identity_source, old.normalized_taxon_key,
         old.same_species_in_session, old.same_species_count, old.first_submitted_at,
         old.submission_count) then
    raise exception using errcode = '42501', message = 'OBSERVATION_SUBMITTED_IMMUTABLE';
  end if;

  if old.first_submitted_at is not null and new.first_submitted_at is distinct from old.first_submitted_at then
    raise exception using errcode = '42501', message = 'OBSERVATION_SUBMITTED_IMMUTABLE';
  end if;

  if new.submission_count is distinct from old.submission_count
    and not (new.submission_count = old.submission_count + 1 and new.status = 'submitted' and old.status <> 'submitted') then
    raise exception using errcode = '23514', message = 'OBSERVATION_SUBMISSION_COUNT_STEP';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Student trait verification (working review; the submission snapshot is the record) ----

create table public.student_trait_verifications (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null,
  observer_id uuid not null,
  class_id uuid not null,
  session_id uuid not null,
  analysis_run_id uuid,
  trait_key text not null,
  trait_source text not null,
  ai_value jsonb,
  student_status text,
  student_value jsonb,
  corrected_value jsonb,
  note text,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_trait_verifications_observation_fk
    foreign key (observation_id, observer_id, class_id, session_id)
    references public.observations (id, observer_id, class_id, session_id) on delete restrict,
  constraint student_trait_verifications_unique unique nulls not distinct (observation_id, analysis_run_id, trait_key),
  constraint student_trait_verifications_key_check check (trait_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint student_trait_verifications_source_check check (trait_source in ('manual', 'ai')),
  constraint student_trait_verifications_status_check check (
    student_status is null or student_status in ('match', 'not_match', 'unsure', 'not_visible')
  ),
  constraint student_trait_verifications_value_check check (
    student_value is null
    or (jsonb_typeof(student_value) = 'string' and char_length(student_value #>> '{}') between 1 and 120)
  ),
  constraint student_trait_verifications_note_check check (note is null or char_length(note) between 1 and 300),
  constraint student_trait_verifications_position_check check (position between 1 and 40),
  constraint student_trait_verifications_manual_check check (
    trait_source <> 'manual'
    or (
      analysis_run_id is null and ai_value is null and corrected_value is null
      and (
        (student_value is not null and student_status is null)
        or (student_value is null and student_status in ('unsure', 'not_visible'))
      )
    )
  ),
  constraint student_trait_verifications_ai_check check (
    trait_source <> 'ai'
    or (analysis_run_id is not null and (corrected_value is null or student_status = 'not_match'))
  )
);

create index student_trait_verifications_owner_scope_idx
  on public.student_trait_verifications (observation_id, observer_id, class_id, session_id);

create function private.guard_trait_verification_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_status text;
begin
  select status into parent_status
  from public.observations
  where id = coalesce(new.observation_id, old.observation_id);

  if parent_status not in ('draft', 'student_review') then
    raise exception using errcode = '42501', message = 'OBSERVATION_SUBMITTED_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger student_trait_verifications_guard_write
before insert or update or delete on public.student_trait_verifications
for each row execute function private.guard_trait_verification_write();

-- Immutable submissions -----------------------------------------------------------------

create table public.observation_submissions (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null,
  observer_id uuid not null,
  class_id uuid not null,
  session_id uuid not null,
  submission_number integer not null,
  client_submission_id uuid not null,
  submission_kind text not null,
  based_on_version integer not null,
  observation_version integer not null,
  common_name text not null,
  scientific_name text not null,
  evidence_note text not null,
  reference_note text,
  identity_source text not null,
  taxon_key text,
  taxon_key_version text not null default 'taxon-key-v1',
  verification_snapshot jsonb not null,
  media_snapshot jsonb not null,
  capture_snapshot jsonb not null,
  same_species_count integer not null default 0,
  same_species_acknowledged boolean not null default false,
  possible_same_specimen_count integer not null default 0,
  snapshot_schema_version text not null default 'submission-v1',
  submitted_by uuid not null references public.profiles (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  constraint observation_submissions_observation_fk
    foreign key (observation_id, observer_id, class_id, session_id)
    references public.observations (id, observer_id, class_id, session_id) on delete restrict,
  constraint observation_submissions_number_unique unique (observation_id, submission_number),
  constraint observation_submissions_client_unique unique (observer_id, client_submission_id),
  constraint observation_submissions_number_check check (submission_number >= 1),
  constraint observation_submissions_kind_check check (
    submission_kind in ('initial', 'resubmission')
    and ((submission_number = 1) = (submission_kind = 'initial'))
  ),
  constraint observation_submissions_version_check check (
    based_on_version >= 1 and observation_version = based_on_version + 1
  ),
  constraint observation_submissions_names_check check (
    char_length(common_name) between 1 and 120 and char_length(scientific_name) between 1 and 160
  ),
  constraint observation_submissions_evidence_check check (char_length(evidence_note) between 1 and 1000),
  constraint observation_submissions_reference_check check (
    reference_note is null or char_length(reference_note) between 1 and 300
  ),
  constraint observation_submissions_identity_check check (identity_source in ('manual', 'ai_candidate')),
  constraint observation_submissions_snapshot_check check (
    jsonb_typeof(verification_snapshot) = 'object'
    and jsonb_typeof(media_snapshot) = 'array'
    and jsonb_array_length(media_snapshot) between 1 and 10
    and jsonb_typeof(capture_snapshot) = 'object'
  ),
  constraint observation_submissions_same_species_check check (
    same_species_count >= 0 and possible_same_specimen_count >= 0
    and (same_species_acknowledged = false or same_species_count > 0)
  )
);

create index observation_submissions_owner_scope_idx
  on public.observation_submissions (observation_id, observer_id, class_id, session_id);
create index observation_submissions_class_time_idx
  on public.observation_submissions (class_id, submitted_at desc, id desc);
create index observation_submissions_session_time_idx
  on public.observation_submissions (session_id, submitted_at desc, id desc);
create index observation_submissions_submitted_by_idx on public.observation_submissions (submitted_by);

create table public.observation_submission_media (
  submission_id uuid not null references public.observation_submissions (id) on delete restrict,
  media_id uuid not null,
  observation_id uuid not null,
  position integer not null,
  category text not null,
  primary key (submission_id, media_id),
  constraint observation_submission_media_media_fk foreign key (media_id, observation_id)
    references public.observation_media (id, observation_id) on delete restrict
);

create index observation_submission_media_media_idx
  on public.observation_submission_media (media_id, observation_id);

-- Same-species and possible-same-specimen relations (never merged automatically) --------

create table public.observation_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null,
  candidate_observation_id uuid not null,
  session_id uuid not null,
  class_id uuid not null,
  relationship_type text not null,
  pair_low uuid generated always as (least(observation_id, candidate_observation_id)) stored,
  pair_high uuid generated always as (greatest(observation_id, candidate_observation_id)) stored,
  morphology_score numeric,
  visual_similarity_score numeric,
  location_distance_m numeric,
  temporal_distance_seconds integer,
  system_recommendation text,
  student_acknowledged_at timestamptz,
  teacher_decision text,
  decided_by uuid references public.profiles (id) on delete restrict,
  decided_at timestamptz,
  source_submission_id uuid references public.observation_submissions (id) on delete restrict,
  rule_version text not null,
  created_at timestamptz not null default now(),
  constraint observation_duplicate_candidates_observation_fk foreign key (observation_id, session_id)
    references public.observations (id, session_id) on delete restrict,
  constraint observation_duplicate_candidates_candidate_fk foreign key (candidate_observation_id, session_id)
    references public.observations (id, session_id) on delete restrict,
  constraint observation_duplicate_candidates_pair_unique unique (pair_low, pair_high, relationship_type),
  constraint observation_duplicate_candidates_distinct_check check (observation_id <> candidate_observation_id),
  constraint observation_duplicate_candidates_type_check check (
    relationship_type in ('same_species', 'possible_same_specimen')
  ),
  constraint observation_duplicate_candidates_decision_check check (
    teacher_decision is null
    or (relationship_type = 'possible_same_specimen' and teacher_decision in ('same_specimen', 'not_same_specimen'))
  ),
  constraint observation_duplicate_candidates_decided_check check (
    (teacher_decision is null) = (decided_by is null and decided_at is null)
  ),
  constraint observation_duplicate_candidates_scores_check check (
    morphology_score is null and visual_similarity_score is null
  ),
  constraint observation_duplicate_candidates_distance_check check (
    location_distance_m is null or location_distance_m >= 0
  )
);

create index observation_duplicate_candidates_observation_idx
  on public.observation_duplicate_candidates (observation_id, session_id);
create index observation_duplicate_candidates_candidate_idx
  on public.observation_duplicate_candidates (candidate_observation_id, session_id);
create index observation_duplicate_candidates_class_idx on public.observation_duplicate_candidates (class_id);
create index observation_duplicate_candidates_decided_by_idx on public.observation_duplicate_candidates (decided_by);
create index observation_duplicate_candidates_submission_idx on public.observation_duplicate_candidates (source_submission_id);

create table public.observation_relation_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.observation_duplicate_candidates (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  session_id uuid not null references public.exploration_sessions (id) on delete restrict,
  event_type text not null,
  from_decision text,
  to_decision text,
  actor_id uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint observation_relation_events_type_check check (
    event_type in ('candidate_created', 'teacher_decided', 'teacher_decision_changed')
  )
);

create index observation_relation_events_candidate_idx on public.observation_relation_events (candidate_id, created_at);
create index observation_relation_events_class_idx on public.observation_relation_events (class_id);
create index observation_relation_events_session_idx on public.observation_relation_events (session_id);
create index observation_relation_events_actor_idx on public.observation_relation_events (actor_id);

-- Append-only and decision-only guards ------------------------------------------------------

create function private.reject_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'APPEND_ONLY';
end;
$$;

create trigger observation_submissions_append_only
before update or delete on public.observation_submissions
for each row execute function private.reject_append_only_mutation();

create trigger observation_submission_media_append_only
before update or delete on public.observation_submission_media
for each row execute function private.reject_append_only_mutation();

create trigger observation_relation_events_append_only
before update or delete on public.observation_relation_events
for each row execute function private.reject_append_only_mutation();

create function private.guard_duplicate_candidate_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'APPEND_ONLY';
  end if;

  if (new.id, new.observation_id, new.candidate_observation_id, new.session_id, new.class_id,
      new.relationship_type, new.morphology_score, new.visual_similarity_score,
      new.location_distance_m, new.temporal_distance_seconds, new.system_recommendation,
      new.student_acknowledged_at, new.source_submission_id, new.rule_version, new.created_at)
    is distinct from
     (old.id, old.observation_id, old.candidate_observation_id, old.session_id, old.class_id,
      old.relationship_type, old.morphology_score, old.visual_similarity_score,
      old.location_distance_m, old.temporal_distance_seconds, old.system_recommendation,
      old.student_acknowledged_at, old.source_submission_id, old.rule_version, old.created_at) then
    raise exception using errcode = '42501', message = 'RELATION_SIGNALS_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger observation_duplicate_candidates_guard
before update or delete on public.observation_duplicate_candidates
for each row execute function private.guard_duplicate_candidate_update();

-- RLS ---------------------------------------------------------------------------------------

alter table public.student_trait_verifications enable row level security;
alter table public.observation_submissions enable row level security;
alter table public.observation_submission_media enable row level security;
alter table public.observation_duplicate_candidates enable row level security;
alter table public.observation_relation_events enable row level security;

revoke all on table public.student_trait_verifications from public, anon, authenticated;
revoke all on table public.observation_submissions from public, anon, authenticated;
revoke all on table public.observation_submission_media from public, anon, authenticated;
revoke all on table public.observation_duplicate_candidates from public, anon, authenticated;
revoke all on table public.observation_relation_events from public, anon, authenticated;
grant select on table public.student_trait_verifications to authenticated;
grant select on table public.observation_submissions to authenticated;
grant select on table public.observation_submission_media to authenticated;
grant select on table public.observation_duplicate_candidates to authenticated;
grant select on table public.observation_relation_events to authenticated;

create policy student_trait_verifications_select_owner
on public.student_trait_verifications
for select
to authenticated
using (
  observer_id = (select auth.uid())
  and (select private.current_user_is_class_student(class_id))
);

create policy observation_submissions_select_owner_or_teacher
on public.observation_submissions
for select
to authenticated
using (
  (observer_id = (select auth.uid()) and (select private.current_user_is_class_student(class_id)))
  or (select private.current_user_is_class_teacher(class_id))
);

create policy observation_submission_media_select_owner_or_teacher
on public.observation_submission_media
for select
to authenticated
using (
  exists (
    select 1 from public.observation_submissions as submission
    where submission.id = submission_id
      and (
        (submission.observer_id = (select auth.uid())
          and (select private.current_user_is_class_student(submission.class_id)))
        or (select private.current_user_is_class_teacher(submission.class_id))
      )
  )
);

create policy observation_duplicate_candidates_select_teacher
on public.observation_duplicate_candidates
for select
to authenticated
using ((select private.current_user_is_class_teacher(class_id)));

create policy observation_relation_events_select_teacher
on public.observation_relation_events
for select
to authenticated
using ((select private.current_user_is_class_teacher(class_id)));

-- Storage: teachers read only submitted images; submitted images cannot be deleted ----------

create or replace function private.observation_media_object_readable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.observation_media as media
    where media.storage_path = object_name
      and (
        (media.observer_id = (select auth.uid())
          and (select private.current_user_is_class_student(media.class_id)))
        or (
          (select private.current_user_is_class_teacher(media.class_id))
          and exists (
            select 1 from public.observation_submission_media as submitted
            where submitted.media_id = media.id
          )
        )
      )
  );
$$;

create or replace function private.observation_media_object_deletable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.observation_media as media
    where media.storage_path = object_name
      and media.status = 'deleting'
      and media.observer_id = (select auth.uid())
      and not exists (
        select 1 from public.observation_submission_media as submitted
        where submitted.media_id = media.id
      )
  );
$$;

-- Grants ------------------------------------------------------------------------------------

revoke execute on function private.observation_taxon_key_v1(text) from public, anon, authenticated;
revoke execute on function private.is_unknown_plant_name(text) from public, anon, authenticated;
revoke execute on function private.observation_evidence_note_min_chars() from public, anon, authenticated;
revoke execute on function private.guard_trait_verification_write() from public, anon, authenticated;
revoke execute on function private.reject_append_only_mutation() from public, anon, authenticated;
revoke execute on function private.guard_duplicate_candidate_update() from public, anon, authenticated;

comment on table public.observation_submissions is
  'P11-01 immutable observation submissions (append-only snapshots of names, evidence, verification, media, and capture metadata).';
comment on table public.observation_duplicate_candidates is
  'P11-01 same-species and possible-same-specimen signals. Teacher decisions only; observations are never merged or changed.';

commit;
