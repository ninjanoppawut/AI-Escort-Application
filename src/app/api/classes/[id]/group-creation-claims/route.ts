import { NextRequest } from "next/server";

import { classIdParamSchema } from "@/features/classes/contracts";
import { groupApiError } from "@/features/groups/errors";
import { listClassCreationClaims } from "@/features/groups/server/lifecycle";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = classIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await listClassCreationClaims(
    await createSupabaseServerClient(),
    params.data.id,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
