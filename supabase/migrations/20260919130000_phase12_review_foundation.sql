begin;

-- P12-01: immutable teacher reviews, targeted revision topics, additional-topic
-- (unlock) requests, anonymous issue reports, and the review/revision status
-- edges (REV-007 to REV-012; DATABASE_DESIGN §§12, 14, 14B; D-015 to D-017,
-- D-048, D-049, D-052, D-057, D-065 to D-067). Every decision and revision adds
-- rows; no earlier submission, review, topic, or history row is changed.

-- Observation columns ---------------------------------------------------------------

alter table public.observations
  add column verified_common_name text,
  add column verified_scientific_name text,
  add column latest_review_id uuid,
  add column latest_reviewed_at timestamptz,
  add column review_count integer not null default 0,
  add constraint observations_verified_names_check check (
    (verified_common_name is null) = (verified_scientific_name is null)
    and (verified_common_name is null or char_length(verified_common_name) between 1 and 120)
    and (verified_scientific_name is null or char_length(verified_scientific_name) between 1 and 160)
  ),
  add constraint observations_review_count_check check (review_count >= 0);

alter table public.observation_submissions
  add constraint observation_submissions_id_observation_unique unique (id, observation_id);

-- Revision topic vocabulary (D-065) -----------------------------------------------------

-- Capture location and time are never a topic: they are immutable (D-019, D-020).
create function private.revision_field_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['images', 'common_name', 'scientific_name', 'traits', 'evidence_note', 'reference_note']::text[];
$$;

create function private.is_revision_field_key_list(keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select keys is not null
    and cardinality(keys) between 1 and 6
    and keys <@ private.revision_field_keys()
    and cardinality(keys) = (select count(distinct key) from unnest(keys) as key);
$$;

-- Teacher reviews -------------------------------------------------------------------

create table public.teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null,
  submission_id uuid not null,
  observer_id uuid not null references public.profiles (id) on delete restrict,
  class_id uuid not null,
  session_id uuid not null,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  decision text not null,
  verified_common_name text,
  verified_scientific_name text,
  corrected_traits jsonb not null default '{}'::jsonb,
  feedback text,
  review_started_at timestamptz,
  reviewed_at timestamptz not null default now(),
  constraint teacher_reviews_observation_fk foreign key (observation_id, observer_id, class_id, session_id)
    references public.observations (id, observer_id, class_id, session_id) on delete restrict,
  constraint teacher_reviews_submission_fk foreign key (submission_id, observation_id)
    references public.observation_submissions (id, observation_id) on delete restrict,
  -- One decision per submitted version: a second reviewer loses the race (REV-012).
  constraint teacher_reviews_submission_unique unique (submission_id),
  constraint teacher_reviews_id_observation_unique unique (id, observation_id),
  constraint teacher_reviews_decision_check check (
    decision in ('verified', 'revision_required', 'unable_to_verify', 'rejected')
  ),
  constraint teacher_reviews_verified_names_check check (
    (decision = 'verified') = (verified_common_name is not null and verified_scientific_name is not null)
    and (verified_common_name is null or char_length(verified_common_name) between 1 and 120)
    and (verified_scientific_name is null or char_length(verified_scientific_name) between 1 and 160)
  ),
  constraint teacher_reviews_feedback_check check (
    (feedback is null or char_length(feedback) between 1 and 500)
    and (decision not in ('revision_required', 'rejected') or feedback is not null)
  ),
  constraint teacher_reviews_corrections_check check (
    jsonb_typeof(corrected_traits) = 'object'
    and (decision = 'verified' or corrected_traits = '{}'::jsonb)
  )
);

create index teacher_reviews_observation_time_idx on public.teacher_reviews (observation_id, reviewed_at desc, id desc);
create index teacher_reviews_owner_idx on public.teacher_reviews (observer_id, class_id);
create index teacher_reviews_class_time_idx on public.teacher_reviews (class_id, reviewed_at desc, id desc);
create index teacher_reviews_reviewer_idx on public.teacher_reviews (reviewer_id);
create index teacher_reviews_session_idx on public.teacher_reviews (session_id);

alter table public.observations
  add constraint observations_latest_review_fk foreign key (latest_review_id, id)
    references public.teacher_reviews (id, observation_id) on delete restrict;
create index observations_latest_review_idx on public.observations (latest_review_id) where latest_review_id is not null;

-- Revision topics and additional-topic requests ---------------------------------------------

create table public.observation_unlock_requests (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null,
  review_id uuid not null,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  class_id uuid not null,
  session_id uuid not null,
  requested_fields text[] not null,
  reason text not null,
  status text not null default 'pending',
  granted_fields text[],
  decided_by uuid references public.profiles (id) on delete restrict,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint observation_unlock_requests_observation_fk
    foreign key (observation_id, requested_by, class_id, session_id)
    references public.observations (id, observer_id, class_id, session_id) on delete restrict,
  constraint observation_unlock_requests_review_fk foreign key (review_id, observation_id)
    references public.teacher_reviews (id, observation_id) on delete restrict,
  constraint observation_unlock_requests_fields_check check (private.is_revision_field_key_list(requested_fields)),
  constraint observation_unlock_requests_reason_check check (char_length(reason) between 5 and 300),
  constraint observation_unlock_requests_status_check check (
    status in ('pending', 'granted', 'denied', 'cancelled')
  ),
  constraint observation_unlock_requests_decision_check check (
    (status = 'pending') = (decided_at is null)
    and (status in ('granted', 'denied')) = (decided_by is not null)
    and (status = 'granted') = (granted_fields is not null)
    and (granted_fields is null or (private.is_revision_field_key_list(granted_fields)
      and granted_fields <@ requested_fields))
    and (decision_note is null or char_length(decision_note) between 1 and 300)
  )
);

create unique index one_pending_unlock_request_per_observation
  on public.observation_unlock_requests (observation_id, requested_by)
  where status = 'pending';
create index observation_unlock_requests_observation_idx
  on public.observation_unlock_requests (observation_id, created_at desc, id desc);
create index observation_unlock_requests_review_idx on public.observation_unlock_requests (review_id, observation_id);
create index observation_unlock_requests_class_idx on public.observation_unlock_requests (class_id, status, created_at);
create index observation_unlock_requests_requester_idx on public.observation_unlock_requests (requested_by);
create index observation_unlock_requests_decider_idx on public.observation_unlock_requests (decided_by);
create index observation_unlock_requests_session_idx on public.observation_unlock_requests (session_id);

create table public.observation_revision_topics (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null,
  review_id uuid not null,
  observer_id uuid not null,
  class_id uuid not null,
  field_key text not null,
  source text not null,
  unlock_request_id uuid references public.observation_unlock_requests (id) on delete restrict,
  opened_by uuid not null references public.profiles (id) on delete restrict,
  opened_at timestamptz not null default now(),
  constraint observation_revision_topics_review_fk foreign key (review_id, observation_id)
    references public.teacher_reviews (id, observation_id) on delete restrict,
  constraint observation_revision_topics_unique unique (review_id, field_key),
  constraint observation_revision_topics_key_check check (field_key = any (private.revision_field_keys())),
  constraint observation_revision_topics_source_check check (
    (source = 'review' and unlock_request_id is null)
    or (source = 'unlock_request' and unlock_request_id is not null)
  )
);

create index observation_revision_topics_observation_idx on public.observation_revision_topics (observation_id, review_id);
create index observation_revision_topics_owner_idx on public.observation_revision_topics (observer_id, class_id);
create index observation_revision_topics_request_idx on public.observation_revision_topics (unlock_request_id);
create index observation_revision_topics_opened_by_idx on public.observation_revision_topics (opened_by);

-- Issue reports (D-049, D-066) -------------------------------------------------------------

create table public.observation_issue_reports (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations (id) on delete restrict,
  reporter_id uuid not null references public.profiles (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  session_id uuid not null,
  report_type text not null,
  reason text not null,
  status text not null default 'open',
  resolved_by uuid references public.profiles (id) on delete restrict,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint observation_issue_reports_type_check check (
    report_type in ('identity', 'image', 'location', 'privacy', 'other')
  ),
  constraint observation_issue_reports_reason_check check (char_length(reason) between 10 and 500),
  constraint observation_issue_reports_status_check check (
    status in ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  constraint observation_issue_reports_resolution_check check (
    (status in ('resolved', 'dismissed')) = (resolved_at is not null)
    and (resolved_at is null) = (resolved_by is null)
    and (resolution_note is null or char_length(resolution_note) between 1 and 500)
  )
);

create index observation_issue_reports_observation_created_idx
  on public.observation_issue_reports (observation_id, created_at desc, id desc);
create index observation_issue_reports_reporter_created_idx
  on public.observation_issue_reports (reporter_id, created_at desc, id desc);
create index observation_issue_reports_class_status_idx
  on public.observation_issue_reports (class_id, status, created_at desc, id desc);
create index observation_issue_reports_resolved_by_idx on public.observation_issue_reports (resolved_by);

-- Guards ------------------------------------------------------------------------------------

create trigger teacher_reviews_append_only
before update or delete on public.teacher_reviews
for each row execute function private.reject_append_only_mutation();

create trigger observation_revision_topics_append_only
before update or delete on public.observation_revision_topics
for each row execute function private.reject_append_only_mutation();

create function private.guard_unlock_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'APPEND_ONLY';
  end if;
  if (new.id, new.observation_id, new.review_id, new.requested_by, new.class_id, new.session_id,
      new.requested_fields, new.reason, new.created_at)
    is distinct from
     (old.id, old.observation_id, old.review_id, old.requested_by, old.class_id, old.session_id,
      old.requested_fields, old.reason, old.created_at)
    or old.status <> 'pending' then
    raise exception using errcode = '42501', message = 'UNLOCK_REQUEST_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger observation_unlock_requests_guard
before update or delete on public.observation_unlock_requests
for each row execute function private.guard_unlock_request_update();

create function private.guard_issue_report_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'APPEND_ONLY';
  end if;
  if (new.id, new.observation_id, new.reporter_id, new.class_id, new.session_id, new.report_type,
      new.reason, new.created_at)
    is distinct from
     (old.id, old.observation_id, old.reporter_id, old.class_id, old.session_id, old.report_type,
      old.reason, old.created_at)
    or old.status in ('resolved', 'dismissed') then
    raise exception using errcode = '42501', message = 'ISSUE_REPORT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger observation_issue_reports_guard
before update or delete on public.observation_issue_reports
for each row execute function private.guard_issue_report_update();

-- Submitted images stay: a revision adds images instead (owner item 77).
create or replace function private.guard_observation_media_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.id, new.client_media_id, new.observation_id, new.observer_id, new.class_id, new.session_id,
      new.position, new.mime_type, new.byte_size, new.width_px, new.height_px, new.image_hash,
      new.preprocessing_version, new.captured_at, new.created_at)
    is distinct from
     (old.id, old.client_media_id, old.observation_id, old.observer_id, old.class_id, old.session_id,
      old.position, old.mime_type, old.byte_size, old.width_px, old.height_px, old.image_hash,
      old.preprocessing_version, old.captured_at, old.created_at) then
    raise exception using errcode = '42501', message = 'OBSERVATION_MEDIA_IMMUTABLE';
  end if;

  if new.status is distinct from old.status
    and (old.status, new.status) not in (('pending', 'uploaded'), ('pending', 'deleting'), ('uploaded', 'deleting')) then
    raise exception using errcode = '23514', message = 'INVALID_STATUS_TRANSITION';
  end if;

  if new.status = 'deleting' and old.status <> 'deleting'
    and exists (
      select 1 from public.observation_submission_media as submitted where submitted.media_id = old.id
    ) then
    raise exception using errcode = '42501', message = 'OBSERVATION_MEDIA_SUBMITTED';
  end if;

  if new.category is distinct from old.category and old.status = 'deleting' then
    raise exception using errcode = '23514', message = 'INVALID_STATUS_TRANSITION';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Status edges (PRD §11): submitted/resubmitted -> teacher_review -> decision;
-- revision_required -> resubmitted on the same observation (D-016).
create or replace function private.observation_status_transition_allowed(from_status text, to_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (from_status, to_status) in (
    ('draft', 'student_review'),
    ('student_review', 'submitted'),
    ('submitted', 'teacher_review'),
    ('resubmitted', 'teacher_review'),
    ('submitted', 'verified'), ('submitted', 'revision_required'),
    ('submitted', 'unable_to_verify'), ('submitted', 'rejected'),
    ('resubmitted', 'verified'), ('resubmitted', 'revision_required'),
    ('resubmitted', 'unable_to_verify'), ('resubmitted', 'rejected'),
    ('teacher_review', 'verified'), ('teacher_review', 'revision_required'),
    ('teacher_review', 'unable_to_verify'), ('teacher_review', 'rejected'),
    ('revision_required', 'resubmitted')
  );
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

  -- Submitted content is frozen outside a revision; each resubmission records
  -- a new immutable submission (the revision RPCs limit edits to open topics).
  if old.status in ('submitted', 'teacher_review', 'resubmitted', 'verified', 'unable_to_verify', 'rejected')
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
    and not (
      new.submission_count = old.submission_count + 1
      and ((old.status = 'student_review' and new.status = 'submitted')
        or (old.status = 'revision_required' and new.status = 'resubmitted'))
    ) then
    raise exception using errcode = '23514', message = 'OBSERVATION_SUBMISSION_COUNT_STEP';
  end if;

  if new.review_count is distinct from old.review_count
    and not (new.review_count = old.review_count + 1 and new.latest_review_id is distinct from old.latest_review_id) then
    raise exception using errcode = '23514', message = 'OBSERVATION_REVIEW_COUNT_STEP';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- RLS: owners and class teachers read; every write goes through the RPCs ---------------------

alter table public.teacher_reviews enable row level security;
alter table public.observation_revision_topics enable row level security;
alter table public.observation_unlock_requests enable row level security;
alter table public.observation_issue_reports enable row level security;

revoke all on table public.teacher_reviews from public, anon, authenticated;
revoke all on table public.observation_revision_topics from public, anon, authenticated;
revoke all on table public.observation_unlock_requests from public, anon, authenticated;
revoke all on table public.observation_issue_reports from public, anon, authenticated;

grant select on table public.teacher_reviews to authenticated;
grant select on table public.observation_revision_topics to authenticated;
grant select on table public.observation_unlock_requests to authenticated;
grant select on table public.observation_issue_reports to authenticated;

create policy teacher_reviews_select_owner_or_teacher
on public.teacher_reviews
for select
to authenticated
using (
  (observer_id = (select auth.uid()) and (select private.current_user_is_class_student(class_id)))
  or (select private.current_user_is_class_teacher(class_id))
);

create policy observation_revision_topics_select_owner_or_teacher
on public.observation_revision_topics
for select
to authenticated
using (
  (observer_id = (select auth.uid()) and (select private.current_user_is_class_student(class_id)))
  or (select private.current_user_is_class_teacher(class_id))
);

create policy observation_unlock_requests_select_owner_or_teacher
on public.observation_unlock_requests
for select
to authenticated
using (
  (requested_by = (select auth.uid()) and (select private.current_user_is_class_student(class_id)))
  or (select private.current_user_is_class_teacher(class_id))
);

-- The observation owner has no policy here: reporter identity stays hidden (D-049).
create policy observation_issue_reports_select_reporter_or_teacher
on public.observation_issue_reports
for select
to authenticated
using (
  (reporter_id = (select auth.uid()) and (select private.current_user_is_class_student(class_id)))
  or (select private.current_user_is_class_teacher(class_id))
);

revoke execute on function private.revision_field_keys() from public, anon, authenticated;
revoke execute on function private.is_revision_field_key_list(text[]) from public, anon, authenticated;
revoke execute on function private.guard_unlock_request_update() from public, anon, authenticated;
revoke execute on function private.guard_issue_report_update() from public, anon, authenticated;

comment on table public.teacher_reviews is
  'P12-01 immutable teacher decisions, one per submitted version; corrections sit beside student values.';
comment on table public.observation_revision_topics is
  'P12-01 append-only topics a revision may change, opened by a review or a granted unlock request.';
comment on table public.observation_unlock_requests is
  'P12-01 student requests for additional revision topics; decided once by a class teacher.';
comment on table public.observation_issue_reports is
  'P12-01 issue reports; the observation owner never reads reporter identity.';

commit;
