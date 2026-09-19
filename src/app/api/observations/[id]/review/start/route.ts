import { NextRequest } from "next/server";
import { z } from "zod";

import { beginReview } from "@/features/observations/review/server/revision-operations";
import {
  handleReviewMutation,
  observationParamsSchema,
} from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Moves a submitted or resubmitted record to teacher_review (D-067).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleReviewMutation(
    request,
    context.params,
    observationParamsSchema,
    z.object({}).strict(),
    async (params) =>
      beginReview(await createSupabaseServerClient(), params.id),
  );
}
