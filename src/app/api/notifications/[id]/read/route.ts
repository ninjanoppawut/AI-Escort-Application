import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { notificationIdParamSchema } from "@/features/notifications/contracts";
import { notificationApiError } from "@/features/notifications/errors";
import { markNotificationRead } from "@/features/notifications/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(notificationApiError("FORBIDDEN"), requestId, 403);
  }

  const parsed = notificationIdParamSchema.safeParse(await context.params);
  if (!parsed.success) {
    return jsonError(notificationApiError("FORBIDDEN"), requestId, 404);
  }

  const result = await markNotificationRead(
    await createSupabaseServerClient(),
    parsed.data.id,
  );
  if ("error" in result)
    return jsonError(result.error, requestId, result.status ?? 500);
  return jsonSuccess(result.data, requestId);
}
