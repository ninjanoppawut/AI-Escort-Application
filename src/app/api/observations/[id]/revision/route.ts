import { NextRequest } from "next/server";

import { saveRevisionRequestSchema } from "@/features/observations/review/revision-contracts";
import {
  getRevisionState,
  saveRevision,
} from "@/features/observations/review/server/revision-operations";
import {
  handleReviewMutation,
  handleReviewRead,
  observationParamsSchema,
} from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

// Owner-only revision view: the latest review, open topics, and requests.
export async function GET(request: NextRequest, context: Context) {
  return handleReviewRead(
    request,
    context.params,
    observationParamsSchema,
    async (params) =>
      getRevisionState(await createSupabaseServerClient(), params.id),
  );
}

// Saves revision edits; only open topics may change (D-048, D-065).
export async function PUT(request: NextRequest, context: Context) {
  return handleReviewMutation(
    request,
    context.params,
    observationParamsSchema,
    saveRevisionRequestSchema,
    async (params, body) =>
      saveRevision(await createSupabaseServerClient(), params.id, body),
  );
}
