import { NextRequest } from "next/server";
import { z } from "zod";

import { unlockDecisionRequestSchema } from "@/features/observations/review/revision-contracts";
import { decideUnlockRequest } from "@/features/observations/review/server/revision-operations";
import { handleReviewMutation } from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ id: z.uuid(), requestId: z.uuid() });

// Teacher grant or denial of an additional-topic request; a grant opens only
// requested topics it names (API_AND_REALTIME.md §24).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; requestId: string }> },
) {
  return handleReviewMutation(
    request,
    context.params,
    paramsSchema,
    unlockDecisionRequestSchema,
    async (params, body) =>
      decideUnlockRequest(
        await createSupabaseServerClient(),
        params.requestId,
        body,
      ),
  );
}
