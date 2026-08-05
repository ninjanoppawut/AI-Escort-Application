import { z } from "zod";

export const researchEventNameSchema = z.enum([
  "account_confirmed",
  "teacher_invitation_consumed",
  "class_joined",
  "group_created",
  "group_creation_failed",
  "group_invitation_sent",
  "group_invitation_accepted",
  "group_invitation_declined",
  "group_leader_changed",
  "student_moved_between_groups",
  "group_locked",
  "group_deleted",
  "group_archived",
  "session_opened",
  "session_group_activated",
  "session_group_paused",
  "session_group_completed",
  "observation_started",
  "photo_captured",
  "image_uploaded",
  "ai_analysis_queued",
  "ai_analysis_completed",
  "ai_analysis_failed",
  "student_reviewed_ai_result",
  "student_corrected_ai_trait",
  "manual_entry_used",
  "same_species_warning_shown",
  "observation_submitted",
  "teacher_requested_revision",
  "revision_unlock_requested",
  "observation_resubmitted",
  "teacher_verified",
  "teacher_review_completed",
  "observation_issue_reported",
  "session_completed",
  "map_marker_opened",
  "export_requested",
  "export_completed",
  "admin_incident_acknowledged",
]);

export type ResearchEventName = z.infer<typeof researchEventNameSchema>;

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
