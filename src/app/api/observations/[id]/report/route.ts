import { NextRequest } from "next/server";

import { issueReportRequestSchema } from "@/features/observations/review/revision-contracts";
import { reportIssue } from "@/features/observations/review/server/revision-operations";
import {
  handleReviewMutation,
  observationParamsSchema,
} from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Anonymous-to-owner issue report, once per record per 24 hours (D-049, D-066).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleReviewMutation(
    request,
    context.params,
    observationParamsSchema,
    issueReportRequestSchema,
    async (params, body) =>
      reportIssue(await createSupabaseServerClient(), params.id, body),
    () => 201,
  );
}
