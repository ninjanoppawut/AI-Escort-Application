import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import {
  OBSERVATION_IMAGES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "../../media/contracts";
import { mapPostgresReviewError } from "../errors";
import {
  reviewDenial,
  reviewFailure,
  type ReviewOperationResult,
} from "../results";
import {
  issueReportViewSchema,
  reviewQueueRecordSchema,
  revisionStateSchema,
  type IssueReportView,
  type ReviewDecisionRequest,
  type ReviewQueueView,
  type RevisionState,
  type SaveRevisionRequest,
} from "../revision-contracts";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

const rowSchema = z
  .object({
    outcome: z.string(),
    error_code: z.string().nullable(),
    error_details: z.unknown().nullable(),
  })
  .passthrough();

/** Interprets one RPC result row: a documented denial or the picked data. */
function interpret<T>(
  value: unknown,
  outcomes: readonly string[],
  pick: (row: Record<string, unknown>) => T | null,
): ReviewOperationResult<T> {
  const parsed = rowSchema.safeParse(value);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const row = parsed.data;
  if (row.outcome === "denied") return reviewDenial(row);
  if (!outcomes.includes(row.outcome)) return reviewFailure("FORBIDDEN");
  const data = pick(row);
  return data === null ? reviewFailure("FORBIDDEN") : { data };
}

function uuidOf(value: unknown) {
  return z.uuid().safeParse(value).success ? (value as string) : null;
}

function intOf(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function stringOf(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function signPaths(supabase: Client, paths: string[]) {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return signed;
  const { data } = await supabase.storage
    .from(OBSERVATION_IMAGES_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) {
      signed.set(entry.path, entry.signedUrl);
    }
  }
  return signed;
}

// Teacher -------------------------------------------------------------------------

export async function beginReview(supabase: Client, observationId: string) {
  const { data, error } = await supabase.rpc("begin_observation_review", {
    target_observation_id: observationId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpret(data?.[0], ["started", "unchanged"], (row) => {
    const version = intOf(row.observation_version);
    const status = stringOf(row.observation_status);
    return version && status
      ? {
          outcome: row.outcome as "started" | "unchanged",
          status,
          version,
        }
      : null;
  });
}

export async function decideReview(
  supabase: Client,
  observationId: string,
  input: ReviewDecisionRequest,
) {
  const { data, error } = await supabase.rpc("review_observation", {
    target_observation_id: observationId,
    expected_submission_id: input.submissionId,
    review_decision: input.decision,
    review_verified_common_name: input.verifiedCommonName,
    review_verified_scientific_name: input.verifiedScientificName,
    review_corrected_traits: input.correctedTraits,
    review_feedback: input.feedback,
    review_topic_keys: input.topicKeys,
  } as Functions["review_observation"]["Args"]);
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpret(data?.[0], ["decided", "existing"], (row) => {
    const reviewId = uuidOf(row.review_id);
    const version = intOf(row.observation_version);
    const status = stringOf(row.observation_status);
    return reviewId && version && status
      ? {
          outcome: row.outcome as "decided" | "existing",
          reviewId,
          status,
          version,
        }
      : null;
  });
}

export async function getReviewQueue(
  supabase: Client,
  query: {
    classId: string;
    sessionId?: string | undefined;
    filter: string;
    limit: number;
    cursorSubmittedAt?: string | undefined;
    cursorId?: string | undefined;
  },
): Promise<ReviewOperationResult<ReviewQueueView>> {
  const { data, error } = await supabase.rpc("get_teacher_review_queue", {
    target_class_id: query.classId,
    target_session_id: query.sessionId ?? null,
    queue_filter: query.filter,
    page_limit: query.limit,
    cursor_submitted_at: query.cursorSubmittedAt ?? null,
    cursor_observation_id: query.cursorId ?? null,
  } as Functions["get_teacher_review_queue"]["Args"]);
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = reviewQueueRecordSchema.safeParse(data);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const record = parsed.data;
  const signed = await signPaths(
    supabase,
    record.items.flatMap((item) =>
      item.thumbnailPath ? [item.thumbnailPath] : [],
    ),
  );
  return {
    data: {
      ...record,
      items: record.items.map(({ thumbnailPath, ...item }) => ({
        ...item,
        thumbnailUrl: thumbnailPath
          ? (signed.get(thumbnailPath) ?? null)
          : null,
      })),
    },
  };
}

export async function decideUnlockRequest(
  supabase: Client,
  requestId: string,
  input: {
    decision: "granted" | "denied";
    fieldKeys: string[] | null;
    note: string | null;
  },
) {
  const { data, error } = await supabase.rpc("decide_revision_unlock_request", {
    target_request_id: requestId,
    request_decision: input.decision,
    granted_field_keys: input.fieldKeys,
    decision_note: input.note,
  } as Functions["decide_revision_unlock_request"]["Args"]);
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpret(data?.[0], ["decided", "unchanged"], (row) => {
    const status = stringOf(row.request_status);
    return status
      ? { outcome: row.outcome as "decided" | "unchanged", status }
      : null;
  });
}

export async function getIssueReport(
  supabase: Client,
  reportId: string,
): Promise<ReviewOperationResult<IssueReportView>> {
  const { data, error } = await supabase.rpc("get_teacher_issue_report", {
    target_report_id: reportId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = issueReportViewSchema.safeParse(data);
  return parsed.success ? { data: parsed.data } : reviewFailure("FORBIDDEN");
}

export async function resolveIssueReport(
  supabase: Client,
  reportId: string,
  input: { status: string; note: string | null },
) {
  const { data, error } = await supabase.rpc(
    "resolve_observation_issue_report",
    {
      target_report_id: reportId,
      next_status: input.status,
      note: input.note,
    } as Functions["resolve_observation_issue_report"]["Args"],
  );
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpret(data?.[0], ["updated", "unchanged"], (row) => {
    const status = stringOf(row.report_status);
    return status
      ? { outcome: row.outcome as "updated" | "unchanged", status }
      : null;
  });
}

// Student ---------------------------------------------------------------------------

export async function getRevisionState(
  supabase: Client,
  observationId: string,
): Promise<ReviewOperationResult<RevisionState>> {
  const { data, error } = await supabase.rpc("get_observation_revision_state", {
    target_observation_id: observationId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = revisionStateSchema.safeParse(data);
  return parsed.success ? { data: parsed.data } : reviewFailure("FORBIDDEN");
}

export async function saveRevision(
  supabase: Client,
  observationId: string,
  input: SaveRevisionRequest,
) {
  const { data, error } = await supabase.rpc("save_observation_revision", {
    target_observation_id: observationId,
    expected_version: input.expectedVersion,
    revision_common_name: input.commonName,
    revision_scientific_name: input.scientificName,
    revision_evidence_note: input.evidenceNote,
    revision_reference_note: input.referenceNote,
    revision_traits: input.traits,
  } as Functions["save_observation_revision"]["Args"]);
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpret(data?.[0], ["updated", "unchanged"], (row) => {
    const version = intOf(row.observation_version);
    const status = stringOf(row.observation_status);
    return version && status
      ? {
          outcome: row.outcome as "updated" | "unchanged",
          version,
          status,
        }
      : null;
  });
}

export async function resubmit(
  supabase: Client,
  observationId: string,
  input: {
    clientSubmissionId: string;
    expectedVersion: number;
    acknowledgeSameSpecies: boolean;
  },
) {
  const { data, error } = await supabase.rpc("resubmit_observation", {
    target_observation_id: observationId,
    target_client_submission_id: input.clientSubmissionId,
    expected_version: input.expectedVersion,
    acknowledge_same_species: input.acknowledgeSameSpecies,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpret(data?.[0], ["resubmitted", "existing"], (row) => {
    const submissionId = uuidOf(row.submission_id);
    const submissionNumber = intOf(row.submission_number);
    const version = intOf(row.observation_version);
    return submissionId && submissionNumber && version
      ? {
          outcome: row.outcome as "resubmitted" | "existing",
          submissionId,
          submissionNumber,
          version,
        }
      : null;
  });
}

export async function requestUnlock(
  supabase: Client,
  observationId: string,
  input: { fieldKeys: string[]; reason: string },
) {
  const { data, error } = await supabase.rpc(
    "request_additional_revision_fields",
    {
      target_observation_id: observationId,
      requested_field_keys: input.fieldKeys,
      request_reason: input.reason,
    },
  );
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpret(data?.[0], ["requested", "existing"], (row) => {
    const requestId = uuidOf(row.request_id);
    return requestId
      ? { outcome: row.outcome as "requested" | "existing", requestId }
      : null;
  });
}

export async function reportIssue(
  supabase: Client,
  observationId: string,
  input: { type: string; reason: string },
) {
  const { data, error } = await supabase.rpc("report_observation_issue", {
    target_observation_id: observationId,
    target_report_type: input.type,
    report_reason: input.reason,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpret(data?.[0], ["reported"], (row) => {
    const reportId = uuidOf(row.report_id);
    return reportId ? { outcome: "reported" as const, reportId } : null;
  });
}
