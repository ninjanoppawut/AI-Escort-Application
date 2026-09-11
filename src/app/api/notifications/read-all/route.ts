import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { notificationApiError } from "@/features/notifications/errors";
import { markAllNotificationsRead } from "@/features/notifications/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(notificationApiError("FORBIDDEN"), requestId, 403);
  }

  const result = await markAllNotificationsRead(
    await createSupabaseServerClient(),
  );
  if ("error" in result)
    return jsonError(result.error, requestId, result.status ?? 500);
  return jsonSuccess(result.data, requestId);
}
