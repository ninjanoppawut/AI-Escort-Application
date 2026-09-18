import { NextRequest } from "next/server";

import { observationApiError } from "@/features/observations/errors";
import { listSessionObservations } from "@/features/observations/server/operations";
import { sessionIdParamSchema } from "@/features/sessions/contracts";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The caller's own observations in a session, with whether a new one may start.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = sessionIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(observationApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await listSessionObservations(
    await createSupabaseServerClient(),
    params.data.id,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
