import { NextRequest } from "next/server";

import { reviewDecisionRequestSchema } from "@/features/observations/review/revision-contracts";
import { decideReview } from "@/features/observations/review/server/revision-operations";
import {
  handleReviewMutation,
  observationParamsSchema,
} from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// One immutable decision per submitted version (API_AND_REALTIME.md §18).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleReviewMutation(
    request,
    context.params,
    observationParamsSchema,
    reviewDecisionRequestSchema,
    async (params, body) =>
      decideReview(await createSupabaseServerClient(), params.id, body),
    (data) => (data.outcome === "decided" ? 201 : 200),
  );
}
