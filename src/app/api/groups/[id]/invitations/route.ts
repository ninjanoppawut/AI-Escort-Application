import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { groupApiError } from "@/features/groups/errors";
import {
  groupIdParamSchema,
  sendGroupInvitationRequestSchema,
} from "@/features/groups/invitations";
import { sendGroupInvitation } from "@/features/groups/server/invitations";
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

  const params = groupIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 404);
  }

  const body = sendGroupInvitationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 422);
  }

  const result = await sendGroupInvitation(
    await createSupabaseServerClient(),
    params.data.id,
    body.data.inviteeId,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(
    result.data,
    requestId,
    result.data.outcome === "sent" ? 201 : 200,
  );
}
