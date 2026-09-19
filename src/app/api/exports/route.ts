import { NextRequest } from "next/server";
import { z } from "zod";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { exportRequestSchema } from "@/features/exports/contracts";
import { requestExport } from "@/features/exports/server/operations";
import { reviewApiError } from "@/features/observations/review/errors";
import { reviewValidationError } from "@/features/observations/review/server/route-helpers";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Export request (API_AND_REALTIME.md §24): Idempotency-Key is required;
// small exports return 201 ready, larger ones 202 queued.
export async function POST(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 403);
  }
  const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
  if (!key.success) {
    return jsonError(
      {
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "ต้องมี Idempotency-Key",
        retryable: false,
        details: {},
      },
      requestId,
      422,
    );
  }
  const body = exportRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) return reviewValidationError(body.error, requestId);

  const result = await requestExport(
    await createSupabaseServerClient(),
    body.data,
    key.data,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(
    result.data,
    requestId,
    result.data.status === "ready" ? 201 : 202,
  );
}
