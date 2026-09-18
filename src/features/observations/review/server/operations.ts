import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import {
  OBSERVATION_IMAGES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "../../media/contracts";
import {
  ownerRelatedSchema,
  reviewStateSchema,
  teacherReviewRecordSchema,
  type ReviewState,
  type StudentReviewRequest,
  type SubmitObservationRequest,
  type TeacherReviewView,
} from "../contracts";
import { mapPostgresReviewError } from "../errors";
import {
  interpretDecisionRow,
  interpretSaveReviewRow,
  interpretSubmitRow,
  reviewFailure,
  type ReviewOperationResult,
} from "../results";

type Client = SupabaseClient<Database>;
type Json =
  Database["public"]["Functions"]["save_student_review"]["Args"]["review_traits"];

export async function getReviewState(
  supabase: Client,
  observationId: string,
): Promise<ReviewOperationResult<ReviewState>> {
  const { data, error } = await supabase.rpc("get_observation_review_state", {
    target_observation_id: observationId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = reviewStateSchema.safeParse(data);
  return parsed.success ? { data: parsed.data } : reviewFailure("FORBIDDEN");
}

export async function saveStudentReview(
  supabase: Client,
  observationId: string,
  input: StudentReviewRequest,
) {
  const { data, error } = await supabase.rpc("save_student_review", {
    target_observation_id: observationId,
    expected_version: input.expectedVersion,
    review_identity_source: input.identitySource,
    review_common_name: input.commonName,
    review_scientific_name: input.scientificName,
    review_evidence_note: input.evidenceNote,
    review_reference_note: input.referenceNote,
    review_traits: input.traits as unknown as Json,
  } as Database["public"]["Functions"]["save_student_review"]["Args"]);
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpretSaveReviewRow(data?.[0]);
}

export async function submitObservation(
  supabase: Client,
  observationId: string,
  input: SubmitObservationRequest,
) {
  const { data, error } = await supabase.rpc("submit_observation", {
    target_observation_id: observationId,
    target_client_submission_id: input.clientSubmissionId,
    expected_version: input.expectedVersion,
    acknowledge_same_species: input.acknowledgeSameSpecies,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpretSubmitRow(data?.[0]);
}

export async function getOwnerRelated(
  supabase: Client,
  observationId: string,
): Promise<ReviewOperationResult<z.infer<typeof ownerRelatedSchema>>> {
  const { data, error } = await supabase.rpc("get_observation_related", {
    target_observation_id: observationId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = ownerRelatedSchema.safeParse(data);
  return parsed.success ? { data: parsed.data } : reviewFailure("FORBIDDEN");
}

/** Teacher read model with submitted images signed by the teacher's session. */
export async function getTeacherReview(
  supabase: Client,
  observationId: string,
): Promise<ReviewOperationResult<TeacherReviewView>> {
  const { data, error } = await supabase.rpc("get_teacher_observation_review", {
    target_observation_id: observationId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = teacherReviewRecordSchema.safeParse(data);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const record = parsed.data;

  const paths = [
    ...new Set(
      record.submissions.flatMap((submission) =>
        submission.media.map((media) => media.storagePath),
      ),
    ),
  ];
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage
      .from(OBSERVATION_IMAGES_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const entry of urls ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) {
        signed.set(entry.path, entry.signedUrl);
      }
    }
  }

  return {
    data: {
      ...record,
      submissions: record.submissions.map((submission) => ({
        ...submission,
        media: submission.media.map(({ storagePath, ...media }) => ({
          ...media,
          signedUrl: signed.get(storagePath) ?? null,
        })),
      })),
    },
  };
}

export async function decideRelation(
  supabase: Client,
  relationId: string,
  decision: "same_specimen" | "not_same_specimen",
  expectedDecision: "same_specimen" | "not_same_specimen" | null,
) {
  const { data, error } = await supabase.rpc("decide_observation_relation", {
    target_relation_id: relationId,
    relation_decision: decision,
    expected_decision: expectedDecision,
  } as Database["public"]["Functions"]["decide_observation_relation"]["Args"]);
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  return interpretDecisionRow(data?.[0]);
}
