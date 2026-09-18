import { z } from "zod";

import {
  activityFailure,
  type ActivityOperationResult,
} from "@/features/activities/results";
import type { ActivityUiErrorCode } from "@/features/activities/errors";
import type { Database } from "@/lib/supabase/database.types";

import type { CreateSessionRequest } from "./contracts";

type Functions = Database["public"]["Functions"];
type CreateRow = Functions["create_exploration_session"]["Returns"][number];
type OpenRow = Functions["open_exploration_session"]["Returns"][number];
type ActivateRow = Functions["activate_session_group"]["Returns"][number];
type PauseRow = Functions["pause_exploration_session"]["Returns"][number];
type ResumeRow = Functions["resume_exploration_session"]["Returns"][number];
type CompleteGroupRow = Functions["complete_session_group"]["Returns"][number];
type CompleteSessionRow =
  Functions["complete_exploration_session"]["Returns"][number];

const SESSION_DENIAL_CODES = [
  "VALIDATION_FAILED",
  "ACTIVITY_NOT_PUBLISHED",
  "SESSION_ALREADY_RUNNING",
  "INVALID_STATUS_TRANSITION",
] as const satisfies readonly ActivityUiErrorCode[];

type SessionDenialCode = (typeof SESSION_DENIAL_CODES)[number];

function isSessionDenialCode(value: unknown): value is SessionDenialCode {
  return (
    typeof value === "string" &&
    SESSION_DENIAL_CODES.includes(value as SessionDenialCode)
  );
}

function detailsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface CreatedSession {
  outcome: "created";
  sessionId: string;
  classId: string;
  activityVersionId: string;
}

export interface OpenedSession {
  outcome: "opened";
  sessionId: string;
  groupCount: number;
  participantCount: number;
}

export function buildCreateSessionArgs(
  input: CreateSessionRequest,
): Functions["create_exploration_session"]["Args"] {
  const args: Functions["create_exploration_session"]["Args"] = {
    target_activity_id: input.activityId,
    session_title: input.title,
  };
  if (input.scheduledAt) args.scheduled_start = input.scheduledAt;
  return args;
}

export function interpretCreateSessionRow(
  row: CreateRow | undefined,
): ActivityOperationResult<CreatedSession> {
  if (!row) return activityFailure("FORBIDDEN");
  if (row.outcome === "denied") {
    return isSessionDenialCode(row.error_code)
      ? activityFailure(row.error_code)
      : activityFailure("FORBIDDEN");
  }
  if (
    row.outcome !== "created" ||
    !row.session_id ||
    !row.activity_version_id
  ) {
    return activityFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: "created",
      sessionId: row.session_id,
      classId: row.class_id,
      activityVersionId: row.activity_version_id,
    },
  };
}

export function interpretOpenSessionRow(
  row: OpenRow | undefined,
): ActivityOperationResult<OpenedSession> {
  if (!row) return activityFailure("FORBIDDEN");
  if (row.outcome === "denied") {
    return isSessionDenialCode(row.error_code)
      ? activityFailure(row.error_code, detailsOf(row.error_details))
      : activityFailure("FORBIDDEN");
  }
  if (row.outcome !== "opened" || !row.session_id) {
    return activityFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: "opened",
      sessionId: row.session_id,
      groupCount: row.group_count,
      participantCount: row.participant_count,
    },
  };
}

// P7-02 session control --------------------------------------------------------
// Every RPC row is parsed with Zod before it becomes a response. A row that
// matches no documented shape is treated as FORBIDDEN, like the other session
// interpreters, so an unexpected database answer never reaches the browser.

const SESSION_CONTROL_DENIAL_CODES = [
  "SESSION_NOT_OPEN",
  "SESSION_PAUSED",
  "ACTIVE_GROUP_CONFLICT",
  "INVALID_STATUS_TRANSITION",
] as const satisfies readonly ActivityUiErrorCode[];

type SessionControlDenialCode = (typeof SESSION_CONTROL_DENIAL_CODES)[number];

function isSessionControlDenialCode(
  value: unknown,
): value is SessionControlDenialCode {
  return (
    typeof value === "string" &&
    SESSION_CONTROL_DENIAL_CODES.includes(value as SessionControlDenialCode)
  );
}

// Safe details per denial code; anything else in error_details is dropped.
const SESSION_CONTROL_DENIAL_DETAILS: Partial<
  Record<SessionControlDenialCode, z.ZodType<Record<string, unknown>>>
> = {
  ACTIVE_GROUP_CONFLICT: z.object({
    activeGroupId: z.uuid(),
    activeSessionGroupId: z.uuid(),
  }),
  INVALID_STATUS_TRANSITION: z.object({
    reason: z.enum(["group_not_in_session", "group_completed"]),
  }),
};

const deniedRowSchema = z.object({
  outcome: z.literal("denied"),
  error_code: z.string(),
  error_details: z.unknown().optional(),
});

const activateRowSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("activated"),
    session_group_id: z.uuid(),
    status: z.literal("active"),
    queue_position: z.number().int().positive(),
  }),
  deniedRowSchema,
]);

const pauseRowSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("paused"), status: z.literal("paused") }),
  deniedRowSchema,
]);

const resumeRowSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("resumed"), status: z.literal("open") }),
  deniedRowSchema,
]);

const completeGroupRowSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("completed"),
    session_group_id: z.uuid(),
    status: z.literal("completed"),
    next_ready_group_id: z.uuid().nullable(),
  }),
  deniedRowSchema,
]);

const completeSessionRowSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("completed"),
    status: z.literal("completed"),
    completed_groups: z.number().int().nonnegative(),
  }),
  deniedRowSchema,
]);

function sessionControlDenial(
  row: z.infer<typeof deniedRowSchema>,
): ActivityOperationResult<never> {
  if (!isSessionControlDenialCode(row.error_code)) {
    return activityFailure("FORBIDDEN");
  }
  const details = SESSION_CONTROL_DENIAL_DETAILS[row.error_code]?.safeParse(
    row.error_details,
  );
  return activityFailure(row.error_code, details?.success ? details.data : {});
}

export interface ActivatedSessionGroup {
  outcome: "activated";
  sessionId: string;
  groupId: string;
  sessionGroupId: string;
  status: "active";
  queuePosition: number;
}

export interface SessionPauseResult {
  outcome: "paused";
  sessionId: string;
  status: "paused";
}

export interface SessionResumeResult {
  outcome: "resumed";
  sessionId: string;
  status: "open";
}

export interface CompletedSessionGroup {
  outcome: "completed";
  sessionId: string;
  groupId: string;
  sessionGroupId: string;
  status: "completed";
  /** Queue entry (exploration_session_groups.id) now waiting as `ready`. */
  nextReadySessionGroupId: string | null;
  /** Class group of that queue entry; resolved by the server operation. */
  nextReadyGroupId: string | null;
}

export interface CompletedSession {
  outcome: "completed";
  sessionId: string;
  status: "completed";
  completedGroups: number;
}

/** Replaying activation of the already-active group also returns `activated`. */
export function interpretActivateSessionGroupRow(
  row: ActivateRow | undefined,
  sessionId: string,
  groupId: string,
): ActivityOperationResult<ActivatedSessionGroup> {
  const parsed = activateRowSchema.safeParse(row);
  if (!parsed.success) return activityFailure("FORBIDDEN");
  if (parsed.data.outcome === "denied") {
    return sessionControlDenial(parsed.data);
  }
  return {
    data: {
      outcome: "activated",
      sessionId,
      groupId,
      sessionGroupId: parsed.data.session_group_id,
      status: "active",
      queuePosition: parsed.data.queue_position,
    },
  };
}

/** Replaying pause on a paused session returns `paused`. */
export function interpretPauseSessionRow(
  row: PauseRow | undefined,
  sessionId: string,
): ActivityOperationResult<SessionPauseResult> {
  const parsed = pauseRowSchema.safeParse(row);
  if (!parsed.success) return activityFailure("FORBIDDEN");
  if (parsed.data.outcome === "denied") {
    return sessionControlDenial(parsed.data);
  }
  return { data: { outcome: "paused", sessionId, status: "paused" } };
}

/** Replaying resume on an open session returns `resumed`. */
export function interpretResumeSessionRow(
  row: ResumeRow | undefined,
  sessionId: string,
): ActivityOperationResult<SessionResumeResult> {
  const parsed = resumeRowSchema.safeParse(row);
  if (!parsed.success) return activityFailure("FORBIDDEN");
  if (parsed.data.outcome === "denied") {
    return sessionControlDenial(parsed.data);
  }
  return { data: { outcome: "resumed", sessionId, status: "open" } };
}

/**
 * Replaying completion of a completed group returns `completed` with no next
 * group; the queue read model stays the authority for what is `ready`.
 */
export function interpretCompleteSessionGroupRow(
  row: CompleteGroupRow | undefined,
  sessionId: string,
  groupId: string,
): ActivityOperationResult<CompletedSessionGroup> {
  const parsed = completeGroupRowSchema.safeParse(row);
  if (!parsed.success) return activityFailure("FORBIDDEN");
  if (parsed.data.outcome === "denied") {
    return sessionControlDenial(parsed.data);
  }
  return {
    data: {
      outcome: "completed",
      sessionId,
      groupId,
      sessionGroupId: parsed.data.session_group_id,
      status: "completed",
      nextReadySessionGroupId: parsed.data.next_ready_group_id,
      nextReadyGroupId: null,
    },
  };
}

/** Replaying completion of a completed session returns `completedGroups` 0. */
export function interpretCompleteSessionRow(
  row: CompleteSessionRow | undefined,
  sessionId: string,
): ActivityOperationResult<CompletedSession> {
  const parsed = completeSessionRowSchema.safeParse(row);
  if (!parsed.success) return activityFailure("FORBIDDEN");
  if (parsed.data.outcome === "denied") {
    return sessionControlDenial(parsed.data);
  }
  return {
    data: {
      outcome: "completed",
      sessionId,
      status: "completed",
      completedGroups: parsed.data.completed_groups,
    },
  };
}
