import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { classIdParamSchema } from "@/features/classes/contracts";
import { groupApiError } from "@/features/groups/errors";
import { moveStudentBetweenGroups } from "@/features/groups/server/teacher";
import { moveStudentRequestSchema } from "@/features/groups/teacher";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 403);
  }

  const params = classIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 404);
  }

  const body = moveStudentRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 422);
  }

  const result = await moveStudentBetweenGroups(
    await createSupabaseServerClient(),
    params.data.id,
    body.data,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
