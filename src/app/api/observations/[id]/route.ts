import { NextRequest } from "next/server";

import { observationIdParamSchema } from "@/features/observations/contracts";
import { observationApiError } from "@/features/observations/errors";
import { getObservationDraft } from "@/features/observations/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Owner-only draft read; a foreign or missing observation is FORBIDDEN so its
// existence never leaks.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = observationIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(observationApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await getObservationDraft(
    await createSupabaseServerClient(),
    params.data.id,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
