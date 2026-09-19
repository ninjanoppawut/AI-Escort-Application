import { NextRequest } from "next/server";

import { submitObservationRequestSchema } from "@/features/observations/review/contracts";
import { resubmit } from "@/features/observations/review/server/revision-operations";
import {
  handleReviewMutation,
  observationParamsSchema,
} from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// A new immutable version of the same observation; the client submission ID
// is the idempotency key (D-016, API_AND_REALTIME.md §3).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleReviewMutation(
    request,
    context.params,
    observationParamsSchema,
    submitObservationRequestSchema,
    async (params, body) =>
      resubmit(await createSupabaseServerClient(), params.id, body),
    (data) => (data.outcome === "resubmitted" ? 201 : 200),
  );
}
