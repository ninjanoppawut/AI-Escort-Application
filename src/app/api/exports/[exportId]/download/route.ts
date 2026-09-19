import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { exportDownloadUrl } from "@/features/exports/server/operations";
import { reviewApiError } from "@/features/observations/review/errors";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ exportId: z.uuid() });

// Reauthorizes the requester's current teacher scope on every download and
// redirects to a one-minute signed URL; no link is ever stored (API §24).
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ exportId: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 404);
  }
  const result = await exportDownloadUrl(
    await createSupabaseServerClient(),
    params.data.exportId,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  const response = NextResponse.redirect(result.data, 303);
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-request-id", requestId);
  return response;
}
