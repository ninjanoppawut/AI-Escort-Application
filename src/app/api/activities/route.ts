import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import {
  activityListQuerySchema,
  createActivityRequestSchema,
} from "@/features/activities/contracts";
import { activityApiError } from "@/features/activities/errors";
import { validationFailure } from "@/features/activities/results";
import {
  createActivity,
  listClassActivities,
} from "@/features/activities/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  const query = activityListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!query.success) {
    const failure = validationFailure(query.error);
    return jsonError(failure.error, requestId, failure.status);
  }

  const result = await listClassActivities(
    await createSupabaseServerClient(),
    query.data.classId,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}

export async function POST(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(activityApiError("FORBIDDEN"), requestId, 403);
  }

  const body = createActivityRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    const failure = validationFailure(body.error);
    return jsonError(failure.error, requestId, failure.status);
  }

  const { classId, ...draft } = body.data;
  const result = await createActivity(
    await createSupabaseServerClient(),
    classId,
    draft,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId, 201);
}
