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
