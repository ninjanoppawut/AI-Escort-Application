import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { studentReviewRequestSchema } from "@/features/observations/review/contracts";
import { reviewApiError } from "@/features/observations/review/errors";
import {
  getReviewState,
  saveStudentReview,
} from "@/features/observations/review/server/operations";
import {
  observationParamsSchema,
  reviewValidationError,
} from "@/features/observations/review/server/route-helpers";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

// Owner-only review state: manual fields, traits, readiness, and submission.
export async function GET(request: NextRequest, context: Context) {
  const { requestId } = createRequestContext(request.headers);
  const params = observationParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 404);
  }
  const result = await getReviewState(
    await createSupabaseServerClient(),
    params.data.id,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}

export async function PUT(request: NextRequest, context: Context) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 403);
  }
  const params = observationParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 404);
  }
  const body = studentReviewRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) return reviewValidationError(body.error, requestId);

  const result = await saveStudentReview(
    await createSupabaseServerClient(),
    params.data.id,
    body.data,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
