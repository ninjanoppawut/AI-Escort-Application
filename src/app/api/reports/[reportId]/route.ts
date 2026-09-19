import { NextRequest } from "next/server";
import { z } from "zod";

import { getIssueReport } from "@/features/observations/review/server/revision-operations";
import { handleReviewRead } from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ reportId: z.uuid() });

// Class-teacher view of one issue report (deep link of observation_issue_reported).
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> },
) {
  return handleReviewRead(
    request,
    context.params,
    paramsSchema,
    async (params) =>
      getIssueReport(await createSupabaseServerClient(), params.reportId),
  );
}
