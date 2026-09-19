import { NextRequest } from "next/server";

import { getMapDetail } from "@/features/completed-map/server/operations";
import {
  handleReviewRead,
  observationParamsSchema,
} from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Plant detail on the completed map (MAP-005): permitted images, recorder,
// verifying teacher, and evidence; feedback only for the owner and teacher.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleReviewRead(
    request,
    context.params,
    observationParamsSchema,
    async (params) =>
      getMapDetail(await createSupabaseServerClient(), params.id),
  );
}
