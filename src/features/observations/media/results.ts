import type { ApiError } from "@/lib/http/envelope";

import {
  mediaRecordSchema,
  mediaRowSchema,
  type MediaRecord,
} from "./contracts";
import {
  httpStatusForMediaError,
  isMediaDenialCode,
  mediaApiError,
  type MediaUiErrorCode,
} from "./errors";

export type MediaOperationResult<T> =
  | { data: T; error?: never; status?: never }
  | { data?: never; error: ApiError; status: number };

export function mediaFailure(
  code: MediaUiErrorCode,
  details: Record<string, unknown> = {},
): MediaOperationResult<never> {
  return {
    error: mediaApiError(code, details),
    status: httpStatusForMediaError(code),
  };
}

const SAFE_REASONS = new Set([
  "group_waiting",
  "group_completed",
  "session_completed",
  "session_scheduled",
  "not_draft",
  "media_deleting",
  "bytes",
  "dimensions",
  "missing",
  "mismatch",
]);

const SAFE_FIELDS = new Set([
  "clientMediaId",
  "category",
  "byteSize",
  "dimensions",
  "sha256",
  "preprocessingVersion",
  "capturedAt",
  "attemptCount",
]);

/** Keeps only documented, path-free denial details. */
function denial(row: { error_code: string | null; error_details: unknown }) {
  if (!isMediaDenialCode(row.error_code)) return mediaFailure("FORBIDDEN");
  const details =
    row.error_details && typeof row.error_details === "object"
      ? (row.error_details as Record<string, unknown>)
      : {};
  if (row.error_code === "VALIDATION_FAILED") {
    return mediaFailure("VALIDATION_FAILED", {
      fields: SAFE_FIELDS.has(details.field as string) ? [details.field] : [],
    });
  }
  if (row.error_code === "IMAGE_LIMIT_EXCEEDED") {
    return mediaFailure("IMAGE_LIMIT_EXCEEDED", { maxImages: 10 });
  }
  return mediaFailure(
    row.error_code,
    SAFE_REASONS.has(details.reason as string)
      ? { reason: details.reason }
      : {},
  );
}

export interface MediaOutcome {
  outcome:
    | "created"
    | "existing"
    | "uploaded"
    | "updated"
    | "unchanged"
    | "deleting"
    | "deleted";
  media: MediaRecord | null;
}

export function interpretMediaRow(
  value: unknown,
  allowed: readonly MediaOutcome["outcome"][],
): MediaOperationResult<MediaOutcome> {
  const parsed = mediaRowSchema.safeParse(value);
  if (!parsed.success) return mediaFailure("FORBIDDEN");
  const row = parsed.data;
  if (row.outcome === "denied") return denial(row);
  if (!allowed.includes(row.outcome)) return mediaFailure("FORBIDDEN");
  if (row.media === null) {
    return row.outcome === "deleted"
      ? { data: { outcome: row.outcome, media: null } }
      : mediaFailure("FORBIDDEN");
  }
  const media = mediaRecordSchema.safeParse(row.media);
  return media.success
    ? { data: { outcome: row.outcome, media: media.data } }
    : mediaFailure("FORBIDDEN");
}
