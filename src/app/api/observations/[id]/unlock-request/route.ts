import { NextRequest } from "next/server";

import { unlockRequestSchema } from "@/features/observations/review/revision-contracts";
import { requestUnlock } from "@/features/observations/review/server/revision-operations";
import {
  handleReviewMutation,
  observationParamsSchema,
} from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// One pending request for more revision topics (D-048).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleReviewMutation(
    request,
    context.params,
    observationParamsSchema,
    unlockRequestSchema,
    async (params, body) =>
      requestUnlock(await createSupabaseServerClient(), params.id, body),
    (data) => (data.outcome === "requested" ? 201 : 200),
  );
}
