import { NextRequest } from "next/server";
import { z } from "zod";

import { processExport } from "@/features/exports/server/operations";
import { handleReviewMutation } from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ exportId: z.uuid() });

// Worker entry for a queued export: the SKIP LOCKED claim makes repeats and
// concurrent calls generate the file once.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ exportId: string }> },
) {
  return handleReviewMutation(
    request,
    context.params,
    paramsSchema,
    z.object({}).strict(),
    async (params) =>
      processExport(await createSupabaseServerClient(), params.exportId),
  );
}
