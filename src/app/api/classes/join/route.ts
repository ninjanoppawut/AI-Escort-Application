import { NextRequest } from "next/server";

import { joinClassRequestSchema } from "@/features/classes/contracts";
import { classApiError } from "@/features/classes/errors";
import { joinClassWithInvite } from "@/features/classes/server/operations";
import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(classApiError("FORBIDDEN"), requestId, 403);
  }

  const parsed = joinClassRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonError(classApiError("INVITE_INVALID"), requestId, 422);
  }

  const result = await joinClassWithInvite(
    await createSupabaseServerClient(),
    parsed.data,
  );
  if ("error" in result)
    return jsonError(result.error, requestId, result.status);
  return jsonSuccess(
    result.data,
    requestId,
    result.data.already_joined ? 200 : 201,
  );
}
