import { NextRequest } from "next/server";

import { activityApiError } from "@/features/activities/errors";
import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { sessionIdParamSchema } from "@/features/sessions/contracts";
import { completeSession } from "@/features/sessions/server/operations";
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

  const result = await completeSession(
    await createSupabaseServerClient(),
    params.data.id,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
