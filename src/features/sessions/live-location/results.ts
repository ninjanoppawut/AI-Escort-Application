import {
  activityFailure,
  type ActivityOperationResult,
} from "@/features/activities/results";

import {
  recordLocationSampleRowSchema,
  type RecordedLocationSample,
} from "./contracts";

const SAMPLE_DENIAL_CODES = [
  "SESSION_NOT_OPEN",
  "SESSION_PAUSED",
  "GROUP_NOT_ACTIVE",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
] as const;

type SampleDenialCode = (typeof SAMPLE_DENIAL_CODES)[number];

function isSampleDenialCode(value: unknown): value is SampleDenialCode {
  return SAMPLE_DENIAL_CODES.includes(value as SampleDenialCode);
}

const SAMPLE_FIELDS = [
  "lat",
  "lng",
  "accuracyM",
  "recordedAt",
  "clientSampleId",
] as const;

export type SampleResult = ActivityOperationResult<RecordedLocationSample> & {
  retryAfterSeconds?: number;
};

/** Interprets one record_live_location_sample row; unknown shapes deny. */
export function interpretRecordSampleRow(value: unknown): SampleResult {
  const parsed = recordLocationSampleRowSchema.safeParse(value);
  if (!parsed.success) return activityFailure("FORBIDDEN");
  const row = parsed.data;

  if (row.outcome === "recorded" || row.outcome === "duplicate") {
    return row.sample_id
      ? { data: { outcome: row.outcome, sampleId: row.sample_id } }
      : activityFailure("FORBIDDEN");
  }

  if (!isSampleDenialCode(row.error_code)) return activityFailure("FORBIDDEN");

  if (row.error_code === "RATE_LIMITED") {
    const retryAfterSeconds = Math.min(Math.max(row.retry_after_s ?? 1, 1), 60);
    return {
      ...activityFailure("RATE_LIMITED", { retryAfterSeconds }),
      retryAfterSeconds,
    };
  }

  if (row.error_code === "VALIDATION_FAILED") {
    const field =
      row.error_details &&
      typeof row.error_details === "object" &&
      "field" in row.error_details
        ? (row.error_details as { field: unknown }).field
        : null;
    return activityFailure("VALIDATION_FAILED", {
      fields: SAMPLE_FIELDS.includes(field as (typeof SAMPLE_FIELDS)[number])
        ? [field]
        : [],
    });
  }

  return activityFailure(row.error_code);
}
