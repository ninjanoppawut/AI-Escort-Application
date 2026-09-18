import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import {
  completeMediaRequestSchema,
  mediaParamsSchema,
} from "@/features/observations/media/contracts";
import { mediaApiError } from "@/features/observations/media/errors";
import { completeMedia } from "@/features/observations/media/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Confirms an upload after verifying the stored object's owner, size, and type.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(mediaApiError("FORBIDDEN"), requestId, 403);
  }
  const params = mediaParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(mediaApiError("FORBIDDEN"), requestId, 404);
  }
  const body = completeMediaRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return jsonError(
      mediaApiError("VALIDATION_FAILED", { fields: ["attemptCount"] }),
      requestId,
      422,
    );
  }

  const result = await completeMedia(
    await createSupabaseServerClient(),
    params.data.id,
    params.data.mediaId,
    body.data.attemptCount,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(
    {
      outcome: result.data.outcome,
      mediaId: result.data.media?.id,
      status: result.data.media?.status,
    },
    requestId,
  );
}
