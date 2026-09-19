import { NextRequest } from "next/server";

import { reviewApiError } from "@/features/observations/review/errors";
import { reviewQueueQuerySchema } from "@/features/observations/review/revision-contracts";
import { getReviewQueue } from "@/features/observations/review/server/revision-operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Teacher review queue for one class, oldest submission first (API §22).
export async function GET(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  const query = reviewQueueQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!query.success) {
    return jsonError(
      reviewApiError("VALIDATION_FAILED", {
        fields: [
          ...new Set(query.error.issues.map((issue) => String(issue.path[0]))),
        ],
      }),
      requestId,
      422,
    );
  }
  const result = await getReviewQueue(
    await createSupabaseServerClient(),
    query.data,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
