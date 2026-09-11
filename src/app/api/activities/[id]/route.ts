import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import {
  activityIdParamSchema,
  saveActivityRequestSchema,
} from "@/features/activities/contracts";
import { activityApiError } from "@/features/activities/errors";
import { validationFailure } from "@/features/activities/results";
import {
  getActivityDetail,
  saveActivityDraft,
} from "@/features/activities/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = activityIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(activityApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await getActivityDetail(
    await createSupabaseServerClient(),
    params.data.id,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(activityApiError("FORBIDDEN"), requestId, 403);
  }

  const params = activityIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(activityApiError("FORBIDDEN"), requestId, 404);
  }

  const body = saveActivityRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    const failure = validationFailure(body.error);
    return jsonError(failure.error, requestId, failure.status);
  }

  const { expectedVersion, ...draft } = body.data;
  const result = await saveActivityDraft(
    await createSupabaseServerClient(),
    params.data.id,
    expectedVersion,
    draft,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
