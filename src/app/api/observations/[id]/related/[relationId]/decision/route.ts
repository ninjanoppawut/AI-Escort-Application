import { NextRequest } from "next/server";
import { z } from "zod";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { relationDecisionRequestSchema } from "@/features/observations/review/contracts";
import { reviewApiError } from "@/features/observations/review/errors";
import { decideRelation } from "@/features/observations/review/server/operations";
import { reviewValidationError } from "@/features/observations/review/server/route-helpers";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.uuid(), relationId: z.uuid() });

// Teacher decision on a possible same specimen; nothing is merged or changed.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; relationId: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 403);
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 404);
  }
  const body = relationDecisionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) return reviewValidationError(body.error, requestId);

  const result = await decideRelation(
    await createSupabaseServerClient(),
    params.data.relationId,
    body.data.decision,
    body.data.expectedDecision,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
