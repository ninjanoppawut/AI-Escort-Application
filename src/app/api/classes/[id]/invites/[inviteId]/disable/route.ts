import { NextRequest } from "next/server";

import {
  classIdParamSchema,
  inviteIdParamSchema,
} from "@/features/classes/contracts";
import { classApiError } from "@/features/classes/errors";
import {
  disableClassInvite,
  verifyClassInviteRoute,
} from "@/features/classes/server/operations";
import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; inviteId: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(classApiError("FORBIDDEN"), requestId, 403);
  }

  const params = await context.params;
  if (
    !classIdParamSchema.safeParse({ id: params.id }).success ||
    !inviteIdParamSchema.safeParse({ inviteId: params.inviteId }).success
  ) {
    return jsonError(classApiError("INVITE_INVALID"), requestId, 422);
  }

  const supabase = await createSupabaseServerClient();
  const routeCheck = await verifyClassInviteRoute(
    supabase,
    params.id,
    params.inviteId,
  );
  if ("error" in routeCheck) {
    return jsonError(routeCheck.error, requestId, routeCheck.status ?? 403);
  }

  const result = await disableClassInvite(supabase, params.inviteId);
  if ("error" in result)
    return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
