import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { groupApiError } from "@/features/groups/errors";
import {
  claimResetRequestSchema,
  classStudentParamSchema,
} from "@/features/groups/lifecycle";
import { resetGroupCreationClaim } from "@/features/groups/server/lifecycle";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; studentId: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 403);
  }

  const params = classStudentParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 404);
  }

  const body = claimResetRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 422);
  }

  const result = await resetGroupCreationClaim(
    await createSupabaseServerClient(),
    params.data.id,
    params.data.studentId,
    body.data.reason,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
