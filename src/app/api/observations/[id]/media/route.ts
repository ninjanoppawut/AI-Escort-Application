import { NextRequest } from "next/server";
import { z } from "zod";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { registerMediaRequestSchema } from "@/features/observations/media/contracts";
import { mediaApiError } from "@/features/observations/media/errors";
import {
  listMedia,
  registerMedia,
} from "@/features/observations/media/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.uuid() });

// Owner-only list with short-lived signed URLs for uploaded images; storage
// paths never reach the browser from this route.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(mediaApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await listMedia(
    await createSupabaseServerClient(),
    params.data.id,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}

// Reserves an image slot; the client-generated media ID is the idempotency key.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(mediaApiError("FORBIDDEN"), requestId, 403);
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(mediaApiError("FORBIDDEN"), requestId, 404);
  }

  const body = registerMediaRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return jsonError(
      mediaApiError("VALIDATION_FAILED", {
        fields: [
          ...new Set(body.error.issues.map((issue) => issue.path.join("."))),
        ],
      }),
      requestId,
      422,
    );
  }

  const result = await registerMedia(
    await createSupabaseServerClient(),
    params.data.id,
    body.data,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(
    result.data,
    requestId,
    result.data.outcome === "created" ? 201 : 200,
  );
}
