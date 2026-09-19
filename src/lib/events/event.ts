import { z } from "zod";

/**
 * Versioned research-event registry (RESEARCH_EVENT_DICTIONARY.md section 3,
 * schema version 1) and the only payload keys each event may carry. The
 * database enforces the same registry on insert (P14-05A); client-origin
 * events may add the bounded `offline_delay_s` (section 4).
 */
export const RESEARCH_EVENT_REGISTRY = {
  account_confirmed: ["account_type"],
  teacher_invitation_consumed: ["school_id", "invite_age_s"],
  class_created: [
    "minimum_group_size",
    "maximum_group_size",
    "maximum_groups",
    "allow_student_groups",
    "formation_status",
  ],
  class_group_settings_updated: [
    "minimum_group_size",
    "maximum_group_size",
    "maximum_groups",
    "allow_student_groups",
    "formation_status",
  ],
  class_invitation_issued: ["has_expiry", "has_max_uses"],
  class_invitation_disabled: ["used_count"],
  class_invitation_rotated: [
    "previous_used_count",
    "has_expiry",
    "has_max_uses",
  ],
  class_joined: ["invite_channel", "attempt_count"],
  group_created: ["creator_type", "remaining_slots"],
  group_creation_failed: ["error_code"],
  group_invitation_sent: ["group_member_count"],
  group_invitation_accepted: ["invite_age_s", "group_member_count"],
  group_invitation_declined: ["invite_age_s"],
  group_leader_changed: ["reason_category"],
  student_moved_between_groups: ["leader_changed", "reason_category"],
  group_locked: ["member_count"],
  group_deleted: ["member_count", "had_pending_invites"],
  group_archived: ["session_count"],
  session_opened: ["participant_count", "group_count", "activity_version"],
  session_group_activated: ["queue_position", "wait_duration_s"],
  session_group_paused: ["reason_category"],
  session_group_completed: ["active_duration_s"],
  observation_started: [
    "location_status",
    "offline_at_start",
    "offline_delay_s",
  ],
  photo_captured: [
    "category",
    "processed_bytes",
    "width",
    "height",
    "offline_delay_s",
  ],
  image_uploaded: ["category", "processed_bytes", "attempt_count"],
  ai_analysis_queued: ["prompt_version", "schema_version", "image_count"],
  ai_analysis_completed: [
    "provider_category",
    "model_version",
    "latency_ms",
    "candidate_count",
    "needs_more_evidence",
  ],
  ai_analysis_failed: [
    "failure_category",
    "attempt_count",
    "manual_entry_available",
  ],
  student_reviewed_ai_result: ["candidate_selected", "trait_count"],
  student_corrected_ai_trait: ["trait_key", "from_state", "to_state"],
  manual_entry_used: ["analysis_state", "reason_category"],
  same_species_warning_shown: ["candidate_count"],
  observation_submitted: [
    "submission_version",
    "same_species_acknowledged",
    "image_count",
  ],
  teacher_requested_revision: ["topic_keys", "submission_version"],
  revision_unlock_requested: ["topic_keys"],
  observation_resubmitted: ["submission_version", "changed_topic_keys"],
  teacher_verified: ["corrected_identity", "submission_version"],
  teacher_review_completed: [
    "decision",
    "review_duration_s",
    "submission_version",
  ],
  observation_issue_reported: ["report_type"],
  session_completed: ["duration_s", "participant_count", "observation_count"],
  map_marker_opened: ["viewer_role", "observation_status"],
  export_requested: ["export_type", "filter_count"],
  export_completed: ["export_type", "row_count", "duration_ms"],
  admin_incident_acknowledged: ["severity", "flow"],
} as const satisfies Record<string, readonly string[]>;

export const RESEARCH_EVENT_SCHEMA_VERSION = 1;

export type ResearchEventName = keyof typeof RESEARCH_EVENT_REGISTRY;

export const researchEventNameSchema = z.enum(
  Object.keys(RESEARCH_EVENT_REGISTRY) as [
    ResearchEventName,
    ...ResearchEventName[],
  ],
);

/** Keeps only registered payload keys, so nothing else is ever stored. */
export function registeredPayload(
  eventName: ResearchEventName,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed: readonly string[] = RESEARCH_EVENT_REGISTRY[eventName];
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => allowed.includes(key)),
  );
}

export interface ResearchEventInput<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  eventName: ResearchEventName;
  schemaVersion: number;
  actorId?: string;
  schoolId?: string;
  classId?: string;
  activityId?: string;
  sessionId?: string;
  groupId?: string;
  observationId?: string;
  requestId?: string;
  traceId?: string;
  occurredAt: string;
  payload: TPayload;
}

export interface AppendedEvent {
  id: string;
  receivedAt: string;
}

/**
 * This interface is append-only by construction: no update or delete operation
 * is exposed. Database-backed implementations arrive with their owning slice.
 */
export interface AppendOnlyEventWriter {
  append(event: ResearchEventInput): Promise<AppendedEvent>;
}
