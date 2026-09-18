import { NextRequest } from "next/server";

import { activityApiError } from "@/features/activities/errors";
import { sessionIdParamSchema } from "@/features/sessions/contracts";
import { getSessionParticipantView } from "@/features/sessions/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = sessionIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(activityApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await getSessionParticipantView(
    await createSupabaseServerClient(),
    params.data.id,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
