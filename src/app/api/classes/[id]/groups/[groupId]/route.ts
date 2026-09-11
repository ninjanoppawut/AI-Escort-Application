import { NextRequest } from "next/server";

import { groupApiError } from "@/features/groups/errors";
import { classGroupParamSchema } from "@/features/groups/invitations";
import { getGroupDetail } from "@/features/groups/server/invitations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; groupId: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = classGroupParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await getGroupDetail(
    await createSupabaseServerClient(),
    params.data.groupId,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  // A group ID under the wrong class URL is treated as not found.
  if (result.data.classId !== params.data.id) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 404);
  }
  return jsonSuccess(result.data, requestId);
}
