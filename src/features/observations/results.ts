import type { ApiError } from "@/lib/http/envelope";

import {
  observationDraftSchema,
  startObservationRowSchema,
  updateObservationDraftRowSchema,
  type ObservationDraft,
} from "./contracts";
import {
  httpStatusForObservationError,
  isObservationDenialCode,
  observationApiError,
  type ObservationUiErrorCode,
} from "./errors";

export type ObservationOperationResult<T> =
  | { data: T; error?: never; status?: never }
  | { data?: never; error: ApiError; status: number };

export function observationFailure(
  code: ObservationUiErrorCode,
  details: Record<string, unknown> = {},
): ObservationOperationResult<never> {
  return {
    error: observationApiError(code, details),
    status: httpStatusForObservationError(code),
  };
}

function detailsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const SAFE_REASONS = new Set([
  "group_waiting",
  "group_completed",
  "session_completed",
  "session_scheduled",
  "not_draft",
]);

const SAFE_FIELDS = new Set([
  "clientGeneratedId",
  "locationStatus",
  "lat",
  "lng",
  "accuracyM",
  "capturedAt",
  "unavailableReason",
  "expectedVersion",
  "commonName",
  "scientificName",
  "evidenceNote",
]);

/** Passes through only the documented, non-sensitive denial details. */
function denial(row: { error_code: string | null; error_details: unknown }) {
  if (!isObservationDenialCode(row.error_code)) {
    return observationFailure("FORBIDDEN");
  }
  const details = detailsOf(row.error_details);

  if (row.error_code === "VALIDATION_FAILED") {
    return observationFailure("VALIDATION_FAILED", {
      fields: SAFE_FIELDS.has(details.field as string) ? [details.field] : [],
    });
  }

  if (row.error_code === "OBSERVATION_VERSION_CONFLICT") {
    const latest = observationDraftSchema.safeParse(details.observation);
    return observationFailure("OBSERVATION_VERSION_CONFLICT", {
      currentVersion:
        typeof details.currentVersion === "number"
          ? details.currentVersion
          : null,
      ...(latest.success ? { observation: latest.data } : {}),
    });
  }

  return observationFailure(
    row.error_code,
    SAFE_REASONS.has(details.reason as string)
      ? { reason: details.reason }
      : {},
  );
}

export interface StartedObservation {
  outcome: "created" | "existing";
  observationId: string;
  version: number;
}

export function interpretStartObservationRow(
  value: unknown,
): ObservationOperationResult<StartedObservation> {
  const parsed = startObservationRowSchema.safeParse(value);
  if (!parsed.success) return observationFailure("FORBIDDEN");
  const row = parsed.data;
  if (row.outcome === "denied") return denial(row);
  return row.observation_id && row.observation_version
    ? {
        data: {
          outcome: row.outcome,
          observationId: row.observation_id,
          version: row.observation_version,
        },
      }
    : observationFailure("FORBIDDEN");
}

export interface UpdatedObservationDraft {
  outcome: "updated" | "unchanged";
  version: number;
}

export function interpretUpdateDraftRow(
  value: unknown,
): ObservationOperationResult<UpdatedObservationDraft> {
  const parsed = updateObservationDraftRowSchema.safeParse(value);
  if (!parsed.success) return observationFailure("FORBIDDEN");
  const row = parsed.data;
  if (row.outcome === "denied") return denial(row);
  return row.observation_version
    ? { data: { outcome: row.outcome, version: row.observation_version } }
    : observationFailure("FORBIDDEN");
}

export function parseObservationReadModel<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown,
): ObservationOperationResult<T> {
  const parsed = schema.safeParse(value);
  return parsed.success && parsed.data !== undefined
    ? { data: parsed.data }
    : observationFailure("FORBIDDEN");
}

export type { ObservationDraft };
