import { NextRequest } from "next/server";
import { z } from "zod";

import { reviewApiError } from "@/features/observations/review/errors";
import { getTeacherReview } from "@/features/observations/review/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ observationId: z.uuid() });

// Teacher-only view of a submitted observation; drafts are always refused.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ observationId: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 404);
  }
  const result = await getTeacherReview(
    await createSupabaseServerClient(),
    params.data.observationId,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
