import {
  OBSERVATION_NETWORK_PRESENTATION,
  ObservationApiRequestError,
  fetchObservationJson,
} from "../client/request";
import {
  SUBMIT_BLOCKERS,
  reviewStateSchema,
  type SubmitBlocker,
} from "./contracts";
import {
  isReviewUiErrorCode,
  reviewErrorPresentation,
  type ReviewUiErrorCode,
} from "./errors";

/** A stable review error code, or NETWORK when the request never completed. */
export type ReviewClientErrorCode = ReviewUiErrorCode | "NETWORK";

export function reviewErrorCodeOf(error: unknown): ReviewClientErrorCode {
  if (error instanceof ObservationApiRequestError) {
    return isReviewUiErrorCode(error.apiError.code)
      ? error.apiError.code
      : "FORBIDDEN";
  }
  return "NETWORK";
}

export function presentReviewError(code: ReviewClientErrorCode) {
  return code === "NETWORK"
    ? OBSERVATION_NETWORK_PRESENTATION
    : reviewErrorPresentation(code);
}

function detailsOf(error: unknown): Record<string, unknown> {
  return error instanceof ObservationApiRequestError ? error.details : {};
}

/** Blockers a refused submit listed, in the server's order. */
export function submitBlockersOf(error: unknown): SubmitBlocker[] {
  const blockers = detailsOf(error).blockers;
  return Array.isArray(blockers)
    ? blockers.filter((blocker): blocker is SubmitBlocker =>
        (SUBMIT_BLOCKERS as readonly unknown[]).includes(blocker),
      )
    : [];
}

export function reviewInvalidFieldsOf(error: unknown): string[] {
  const fields = detailsOf(error).fields;
  return Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === "string")
    : [];
}

export function fetchReviewState(observationId: string) {
  return fetchObservationJson(
    `/api/observations/${observationId}/student-review`,
    reviewStateSchema,
  );
}
