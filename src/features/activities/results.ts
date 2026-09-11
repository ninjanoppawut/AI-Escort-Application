import type { z } from "zod";

import type { ApiError } from "@/lib/http/envelope";
import type { Database } from "@/lib/supabase/database.types";

import type { ActivityDraft } from "./contracts";
import {
  activityApiError,
  httpStatusForActivityError,
  isActivityDenialCode,
  type ActivityUiErrorCode,
} from "./errors";

type Functions = Database["public"]["Functions"];
type SaveRow = Functions["save_activity_draft"]["Returns"][number];
type PublishRow = Functions["publish_activity"]["Returns"][number];

export type ActivityOperationResult<T> =
  | { data: T; error?: never; status?: never }
  | { data?: never; error: ApiError; status: number };

export function activityFailure(
  code: ActivityUiErrorCode,
  details: Record<string, unknown> = {},
): ActivityOperationResult<never> {
  return {
    error: activityApiError(code, details),
    status: httpStatusForActivityError(code),
  };
}

export interface SavedActivityDraft {
  outcome: "created" | "saved";
  activityId: string;
  activityVersionId: string;
  versionNumber: number;
}

export interface PublishedActivity {
  outcome: "published";
  activityId: string;
  activityVersionId: string;
  versionNumber: number;
}

function detailsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function denial(row: { error_code: string | null; error_details: unknown }) {
  return isActivityDenialCode(row.error_code)
    ? activityFailure(row.error_code, detailsOf(row.error_details))
    : activityFailure("FORBIDDEN");
}

export function buildSaveActivityArgs(input: {
  draft: ActivityDraft;
  classId?: string;
  activityId?: string;
  expectedVersion?: number;
}): Functions["save_activity_draft"]["Args"] {
  const args: Functions["save_activity_draft"]["Args"] = {
    draft:
      input.draft as unknown as Functions["save_activity_draft"]["Args"]["draft"],
  };
  if (input.classId) args.target_class_id = input.classId;
  if (input.activityId) args.target_activity_id = input.activityId;
  if (input.expectedVersion !== undefined) {
    args.expected_version_number = input.expectedVersion;
  }
  return args;
}

export function interpretSaveActivityRow(
  row: SaveRow | undefined,
): ActivityOperationResult<SavedActivityDraft> {
  if (!row) return activityFailure("FORBIDDEN");
  if (row.outcome === "denied") return denial(row);
  if (
    (row.outcome !== "created" && row.outcome !== "saved") ||
    !row.activity_id ||
    !row.activity_version_id
  ) {
    return activityFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: row.outcome,
      activityId: row.activity_id,
      activityVersionId: row.activity_version_id,
      versionNumber: row.version_number,
    },
  };
}

export function interpretPublishActivityRow(
  row: PublishRow | undefined,
): ActivityOperationResult<PublishedActivity> {
  if (!row) return activityFailure("FORBIDDEN");
  if (row.outcome === "denied") return denial(row);
  if (row.outcome !== "published" || !row.activity_version_id) {
    return activityFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: "published",
      activityId: row.activity_id,
      activityVersionId: row.activity_version_id,
      versionNumber: row.version_number,
    },
  };
}

export function parseActivityReadModel<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): ActivityOperationResult<z.infer<TSchema>> {
  const parsed = schema.safeParse(value);
  return parsed.success ? { data: parsed.data } : activityFailure("FORBIDDEN");
}

/** Safe 422 details for a rejected request body: field paths only. */
export function validationFailure(error: z.ZodError): {
  error: ApiError;
  status: number;
} {
  return {
    error: activityApiError("VALIDATION_FAILED", {
      fields: [...new Set(error.issues.map((issue) => issue.path.join(".")))],
    }),
    status: httpStatusForActivityError("VALIDATION_FAILED"),
  };
}
