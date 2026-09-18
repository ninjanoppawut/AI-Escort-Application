import { z } from "zod";

import type { ApiError } from "@/lib/http/envelope";

import { observationDraftSchema } from "../contracts";
import { SUBMIT_BLOCKERS } from "./contracts";
import {
  REVIEW_DENIAL_CODES,
  httpStatusForReviewError,
  reviewApiError,
  type ReviewUiErrorCode,
} from "./errors";

export type ReviewOperationResult<T> =
  | { data: T; error?: never; status?: never }
  | { data?: never; error: ApiError; status: number };

export function reviewFailure(
  code: ReviewUiErrorCode,
  details: Record<string, unknown> = {},
): ReviewOperationResult<never> {
  return {
    error: reviewApiError(code, details),
    status: httpStatusForReviewError(code),
  };
}

const SAFE_REASONS = new Set([
  "group_waiting",
  "group_completed",
  "session_completed",
  "session_scheduled",
  "not_draft",
  "submitted",
  "already_submitted",
  "pending",
  "missing",
  "unknown_not_accepted",
  "required",
  "too_short",
  "decision_changed",
  "not_specimen_candidate",
]);

const SAFE_FIELDS = new Set([
  "expectedVersion",
  "identitySource",
  "commonName",
  "scientificName",
  "evidenceNote",
  "referenceNote",
  "traits",
  "wholePlantImage",
  "clientSubmissionId",
  "decision",
]);

/** Passes through only documented, identifier-free denial details. */
function denial(row: { error_code: string | null; error_details: unknown }) {
  const code = row.error_code as ReviewUiErrorCode;
  if (!REVIEW_DENIAL_CODES.includes(code)) return reviewFailure("FORBIDDEN");
  const details =
    row.error_details && typeof row.error_details === "object"
      ? (row.error_details as Record<string, unknown>)
      : {};
  const safe: Record<string, unknown> = {};

  if (SAFE_REASONS.has(details.reason as string)) safe.reason = details.reason;
  if (Array.isArray(details.blockers)) {
    safe.blockers = details.blockers.filter((blocker) =>
      (SUBMIT_BLOCKERS as readonly string[]).includes(blocker as string),
    );
  }
  const fields = Array.isArray(details.fields)
    ? details.fields
    : details.field
      ? [details.field]
      : [];
  const safeFields = fields.filter((field) => SAFE_FIELDS.has(field as string));
  if (safeFields.length > 0 || code === "VALIDATION_FAILED")
    safe.fields = safeFields;
  if (typeof details.minChars === "number") safe.minChars = details.minChars;
  if (typeof details.sameSpeciesCount === "number")
    safe.sameSpeciesCount = details.sameSpeciesCount;
  if (typeof details.possibleSameSpecimenCount === "number") {
    safe.possibleSameSpecimenCount = details.possibleSameSpecimenCount;
  }
  if (code === "OBSERVATION_VERSION_CONFLICT") {
    if (typeof details.currentVersion === "number")
      safe.currentVersion = details.currentVersion;
    const latest = observationDraftSchema.safeParse(details.observation);
    if (latest.success) safe.observation = latest.data;
  }
  return reviewFailure(code, safe);
}

const saveRowSchema = z.object({
  outcome: z.enum(["updated", "unchanged", "denied"]),
  error_code: z.string().nullable(),
  error_details: z.unknown().nullable(),
  observation_version: z.number().int().nullable(),
  observation_status: z.string().nullable(),
});

export function interpretSaveReviewRow(value: unknown): ReviewOperationResult<{
  outcome: "updated" | "unchanged";
  version: number;
  status: string;
}> {
  const parsed = saveRowSchema.safeParse(value);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const row = parsed.data;
  if (row.outcome === "denied") return denial(row);
  return row.observation_version && row.observation_status
    ? {
        data: {
          outcome: row.outcome,
          version: row.observation_version,
          status: row.observation_status,
        },
      }
    : reviewFailure("FORBIDDEN");
}

const submitRowSchema = z.object({
  outcome: z.enum(["submitted", "existing", "denied"]),
  error_code: z.string().nullable(),
  error_details: z.unknown().nullable(),
  submission_id: z.uuid().nullable(),
  submission_number: z.number().int().nullable(),
  observation_version: z.number().int().nullable(),
});

export function interpretSubmitRow(value: unknown): ReviewOperationResult<{
  outcome: "submitted" | "existing";
  submissionId: string;
  submissionNumber: number;
  version: number;
}> {
  const parsed = submitRowSchema.safeParse(value);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const row = parsed.data;
  if (row.outcome === "denied") return denial(row);
  return row.submission_id && row.submission_number && row.observation_version
    ? {
        data: {
          outcome: row.outcome,
          submissionId: row.submission_id,
          submissionNumber: row.submission_number,
          version: row.observation_version,
        },
      }
    : reviewFailure("FORBIDDEN");
}

const decisionRowSchema = z.object({
  outcome: z.enum(["decided", "unchanged", "denied"]),
  error_code: z.string().nullable(),
  error_details: z.unknown().nullable(),
  relation: z
    .object({
      relationId: z.uuid(),
      decision: z.enum(["same_specimen", "not_same_specimen"]).nullable(),
    })
    .nullable(),
});

export function interpretDecisionRow(value: unknown): ReviewOperationResult<{
  outcome: "decided" | "unchanged";
  relationId: string;
  decision: "same_specimen" | "not_same_specimen" | null;
}> {
  const parsed = decisionRowSchema.safeParse(value);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const row = parsed.data;
  if (row.outcome === "denied") return denial(row);
  return row.relation
    ? { data: { outcome: row.outcome, ...row.relation } }
    : reviewFailure("FORBIDDEN");
}
