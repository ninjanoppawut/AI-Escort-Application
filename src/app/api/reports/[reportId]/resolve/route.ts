import { NextRequest } from "next/server";
import { z } from "zod";

import { reportResolutionRequestSchema } from "@/features/observations/review/revision-contracts";
import { resolveIssueReport } from "@/features/observations/review/server/revision-operations";
import { handleReviewMutation } from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ reportId: z.uuid() });

// Class teacher moves a report to reviewing, resolved, or dismissed, once.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> },
) {
  return handleReviewMutation(
    request,
    context.params,
    paramsSchema,
    reportResolutionRequestSchema,
    async (params, body) =>
      resolveIssueReport(
        await createSupabaseServerClient(),
        params.reportId,
        body,
      ),
  );
}
