import { NextRequest } from "next/server";

import { activityApiError } from "@/features/activities/errors";
import { validationFailure } from "@/features/activities/results";
import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { sessionIdParamSchema } from "@/features/sessions/contracts";
import { recordLocationSampleRequestSchema } from "@/features/sessions/live-location/contracts";
import { recordLiveLocationSample } from "@/features/sessions/live-location/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(activityApiError("FORBIDDEN"), requestId, 403);
  }

  const params = sessionIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(activityApiError("FORBIDDEN"), requestId, 404);
  }

  const body = recordLocationSampleRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    const failure = validationFailure(body.error);
    return jsonError(failure.error, requestId, failure.status);
  }

  const result = await recordLiveLocationSample(
    await createSupabaseServerClient(),
    params.data.id,
    body.data,
  );
  if (result.error) {
    const response = jsonError(result.error, requestId, result.status);
    if (result.retryAfterSeconds) {
      response.headers.set("retry-after", String(result.retryAfterSeconds));
    }
    return response;
  }
  return jsonSuccess(result.data, requestId);
}
