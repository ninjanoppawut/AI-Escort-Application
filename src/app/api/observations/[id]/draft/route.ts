import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import {
  observationIdParamSchema,
  updateObservationDraftRequestSchema,
} from "@/features/observations/contracts";
import { observationApiError } from "@/features/observations/errors";
import { updateObservationDraft } from "@/features/observations/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(observationApiError("FORBIDDEN"), requestId, 403);
  }

  const params = observationIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(observationApiError("FORBIDDEN"), requestId, 404);
  }

  const body = updateObservationDraftRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return jsonError(
      observationApiError("VALIDATION_FAILED", {
        fields: [
          ...new Set(body.error.issues.map((issue) => issue.path.join("."))),
        ],
      }),
      requestId,
      422,
    );
  }

  const result = await updateObservationDraft(
    await createSupabaseServerClient(),
    params.data.id,
    body.data,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
