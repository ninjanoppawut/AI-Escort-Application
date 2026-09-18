import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import {
  mediaParamsSchema,
  updateMediaCategoryRequestSchema,
} from "@/features/observations/media/contracts";
import { mediaApiError } from "@/features/observations/media/errors";
import {
  deleteMedia,
  updateMediaCategory,
} from "@/features/observations/media/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string; mediaId: string }> };

// 200 when the image is gone; 202 when the object removal must be retried.
export async function DELETE(request: NextRequest, context: Context) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(mediaApiError("FORBIDDEN"), requestId, 403);
  }
  const params = mediaParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(mediaApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await deleteMedia(
    await createSupabaseServerClient(),
    params.data.id,
    params.data.mediaId,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(
    { ...result.data, retryable: result.data.outcome === "deleting" },
    requestId,
    result.data.outcome === "deleted" ? 200 : 202,
  );
}

export async function PATCH(request: NextRequest, context: Context) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(mediaApiError("FORBIDDEN"), requestId, 403);
  }
  const params = mediaParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(mediaApiError("FORBIDDEN"), requestId, 404);
  }
  const body = updateMediaCategoryRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return jsonError(
      mediaApiError("VALIDATION_FAILED", { fields: ["category"] }),
      requestId,
      422,
    );
  }

  const result = await updateMediaCategory(
    await createSupabaseServerClient(),
    params.data.id,
    params.data.mediaId,
    body.data.category,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(
    { outcome: result.data.outcome, category: result.data.media?.category },
    requestId,
  );
}
