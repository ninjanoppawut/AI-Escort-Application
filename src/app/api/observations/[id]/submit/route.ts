import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { submitObservationRequestSchema } from "@/features/observations/review/contracts";
import { reviewApiError } from "@/features/observations/review/errors";
import { submitObservation } from "@/features/observations/review/server/operations";
import {
  observationParamsSchema,
  reviewValidationError,
} from "@/features/observations/review/server/route-helpers";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The client submission ID is the idempotency key (API_AND_REALTIME.md §3).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 403);
  }
  const params = observationParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 404);
  }
  const body = submitObservationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) return reviewValidationError(body.error, requestId);

  const result = await submitObservation(
    await createSupabaseServerClient(),
    params.data.id,
    body.data,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(
    result.data,
    requestId,
    result.data.outcome === "submitted" ? 201 : 200,
  );
}
