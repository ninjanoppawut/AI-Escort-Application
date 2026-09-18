import { NextRequest } from "next/server";

import { reviewApiError } from "@/features/observations/review/errors";
import { getOwnerRelated } from "@/features/observations/review/server/operations";
import { observationParamsSchema } from "@/features/observations/review/server/route-helpers";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The owner sees same-species counts only; other students' records never leak.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = observationParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 404);
  }
  const result = await getOwnerRelated(
    await createSupabaseServerClient(),
    params.data.id,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
