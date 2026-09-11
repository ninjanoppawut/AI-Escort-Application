import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { groupApiError } from "@/features/groups/errors";
import { groupMemberParamSchema } from "@/features/groups/leadership";
import { removeGroupMember } from "@/features/groups/server/leadership";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; studentId: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 403);
  }

  const params = groupMemberParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await removeGroupMember(
    await createSupabaseServerClient(),
    params.data.id,
    params.data.studentId,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
