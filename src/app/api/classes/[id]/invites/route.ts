import { NextRequest } from "next/server";

import {
  classIdParamSchema,
  issueClassInviteRequestSchema,
} from "@/features/classes/contracts";
import { classApiError } from "@/features/classes/errors";
import { issueClassInvite } from "@/features/classes/server/operations";
import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(classApiError("FORBIDDEN"), requestId, 403);
  }

  const params = classIdParamSchema.safeParse(await context.params);
  const body = issueClassInviteRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!params.success || !body.success) {
    return jsonError(classApiError("INVITE_INVALID"), requestId, 422);
  }

  const result = await issueClassInvite(
    await createSupabaseServerClient(),
    params.data.id,
    body.data,
    request.nextUrl.origin,
  );
  if ("error" in result)
    return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId, 201);
}
