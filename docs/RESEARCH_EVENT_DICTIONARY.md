# Research Event Dictionary

## 1. Status

This dictionary defines the MVP operational/research event envelope and minimum payloads already justified by product workflows. It does not invent survey instruments, grading scales, or optional research variables; those remain Q-005 until approved.

## 2. Common envelope

Relational columns:

```text
id
event_name
schema_version
actor_id                 # protected operational ID; pseudonymize on research export
school_id
class_id
activity_id
session_id
group_id
observation_id
request_id
trace_id
occurred_at
received_at
payload jsonb
```

Use the minimum applicable relational IDs. `payload` contains only versioned event-specific fields and never duplicates email, display name, raw image, signed URL, secret, access token, exact live-location trail, or unrestricted free text.

## 3. Event registry

| Event | Trigger | Minimum payload | Primary purpose |
|---|---|---|---|
| `account_confirmed` | verified email first confirmed | `account_type` | onboarding reliability |
| `teacher_invitation_consumed` | trusted teacher grant succeeds | `school_id`, `invite_age_s` | provisioning audit |
| `class_joined` | student class invite commits | `invite_channel`, `attempt_count` | onboarding flow |
| `group_created` | atomic group creation commits | `creator_type`, `remaining_slots` | group formation |
| `group_creation_failed` | trusted creation denied | `error_code` | flow diagnosis |
| `group_invitation_sent` | leader invite commits | `group_member_count` | collaboration |
| `group_invitation_accepted` | acceptance commits | `invite_age_s`, `group_member_count` | collaboration |
| `group_invitation_declined` | decline commits | `invite_age_s` | collaboration |
| `group_leader_changed` | atomic transfer commits | `reason_category` | group history |
| `student_moved_between_groups` | teacher move commits | `leader_changed`, `reason_category` | teacher management |
| `group_locked` | teacher locks group | `member_count` | readiness |
| `group_deleted` | unused group deletion commits | `member_count`, `had_pending_invites` | lifecycle |
| `group_archived` | historical group archive commits | `session_count` | lifecycle |
| `session_opened` | snapshot transaction commits | `participant_count`, `group_count`, `activity_version` | field setup |
| `session_group_activated` | active-group RPC commits | `queue_position`, `wait_duration_s` | session flow |
| `session_group_paused` | group/session paused | `reason_category` | session flow |
| `session_group_completed` | teacher completes group | `active_duration_s` | session flow |
| `observation_started` | durable draft begins | `location_status`, `offline_at_start` | field workflow |
| `photo_captured` | local image accepted | `category`, `processed_bytes`, `width`, `height` | media workflow |
| `image_uploaded` | private object/media row commits | `category`, `processed_bytes`, `attempt_count` | upload reliability |
| `ai_analysis_queued` | durable message commits | `prompt_version`, `schema_version`, `image_count` | AI workflow |
| `ai_analysis_completed` | normalized result commits | `provider_category`, `model_version`, `latency_ms`, `candidate_count`, `needs_more_evidence` | AI evaluation |
| `ai_analysis_failed` | run enters failed/dead-letter state | `failure_category`, `attempt_count`, `manual_entry_available` | AI reliability |
| `student_reviewed_ai_result` | verification snapshot saved | `candidate_selected`, `trait_count` | learning interaction |
| `student_corrected_ai_trait` | a trait correction is saved | `trait_key`, `from_state`, `to_state` | AI/student comparison |
| `manual_entry_used` | student chooses manual identity path | `analysis_state`, `reason_category` | degraded behavior |
| `same_species_warning_shown` | warning rendered for current submission | `candidate_count` | duplicate-awareness flow |
| `observation_submitted` | immutable submission commits | `submission_version`, `same_species_acknowledged`, `image_count` | student completion |
| `teacher_requested_revision` | review commits revision | `topic_keys`, `submission_version` | review workflow |
| `revision_unlock_requested` | student asks for more topics | `topic_keys` | revision workflow |
| `observation_resubmitted` | new immutable version commits | `submission_version`, `changed_topic_keys` | revision workflow |
| `teacher_verified` | verified review commits | `corrected_identity`, `submission_version` | review outcome |
| `teacher_review_completed` | any final review commits | `decision`, `review_duration_s`, `submission_version` | review outcome |
| `observation_issue_reported` | rate-limited report commits | `report_type` | quality/safety |
| `session_completed` | teacher completes session | `duration_s`, `participant_count`, `observation_count` | activity outcome |
| `map_marker_opened` | authorized completed/teacher marker detail opens | `viewer_role`, `observation_status` | result engagement |
| `export_requested` | export job commits | `export_type`, `filter_count` | reporting |
| `export_completed` | artifact ready | `export_type`, `row_count`, `duration_ms` | reporting reliability |
| `admin_incident_acknowledged` | admin acknowledges incident | `severity`, `flow` | operations audit |

High-cardinality identifiers remain relational columns, not payload fields or metric labels.

## 4. Timing and retry semantics

- Business events are written in the same transaction as the authoritative change when possible.
- Client interaction events use a client-generated event ID and idempotent ingestion.
- `occurred_at` is device/source time; `received_at` is trusted server time.
- Offline events preserve original occurrence time and include bounded `offline_delay_s`, not a full connectivity history.
- Duplicate event IDs return the original acknowledgement without inserting again.
- A failed research-event write must not invalidate a successful safety-critical product mutation; use an outbox/deferred retry where atomic co-commit is not practical.

## 5. Pseudonymous export

Research export derives a study-scoped pseudonymous subject ID that cannot be joined across studies without controlled mapping. Default fields:

```text
study_subject_id
event_name
schema_version
relative_or_coarsened_time
school/class/session pseudonymous IDs where approved
allowlisted payload fields
```

Exclude email, display name, raw operational IDs, exact coordinates, private image URLs, teacher free text, student evidence free text, IP address, user agent, request ID, and trace ID unless the approved protocol explicitly requires and protects them.

## 6. Change control

Adding/changing an event requires a stated question, schema-version change when breaking, privacy/retention review, producer/test update, export allowlist decision, and traceability update. Never repurpose an existing field with new semantics.
