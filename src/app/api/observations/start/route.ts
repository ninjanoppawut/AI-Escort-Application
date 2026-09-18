import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { startObservationRequestSchema } from "@/features/observations/contracts";
import { observationApiError } from "@/features/observations/errors";
import {
  getObservationDraft,
  startObservation,
} from "@/features/observations/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The client-generated ID is the idempotency key, so no Idempotency-Key header
// is required (API_AND_REALTIME.md §§3, 13).
export async function POST(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(observationApiError("FORBIDDEN"), requestId, 403);
  }

  const body = startObservationRequestSchema.safeParse(
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

  const supabase = await createSupabaseServerClient();
  const started = await startObservation(supabase, body.data);
  if (started.error) {
    return jsonError(started.error, requestId, started.status);
  }

  const observation = await getObservationDraft(
    supabase,
    started.data.observationId,
  );
  if (observation.error) {
    return jsonError(observation.error, requestId, observation.status);
  }

  return jsonSuccess(
    { outcome: started.data.outcome, observation: observation.data },
    requestId,
    started.data.outcome === "created" ? 201 : 200,
  );
}
