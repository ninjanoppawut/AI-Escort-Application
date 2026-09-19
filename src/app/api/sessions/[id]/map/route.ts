import { NextRequest } from "next/server";

import { getCompletedMap } from "@/features/completed-map/server/operations";
import {
  handleReviewRead,
  observationParamsSchema,
} from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Completed-map read model: capture-location markers only, never live
// locations or tracks (MAP-004, MAP-009; API_AND_REALTIME.md §19).
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleReviewRead(
    request,
    context.params,
    observationParamsSchema,
    async (params) =>
      getCompletedMap(await createSupabaseServerClient(), params.id),
  );
}
