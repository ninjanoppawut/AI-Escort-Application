import { NextRequest } from "next/server";

import { notificationListQuerySchema } from "@/features/notifications/contracts";
import { listNotifications } from "@/features/notifications/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  const parsed = notificationListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return jsonError(
      {
        code: "INVALID_CURSOR",
        message: "Invalid notification query",
        retryable: false,
        details: {},
      },
      requestId,
      422,
    );
  }

  const result = await listNotifications(
    await createSupabaseServerClient(),
    parsed.data,
  );
  if ("error" in result)
    return jsonError(result.error, requestId, result.status ?? 500);
  return jsonSuccess(result.data, requestId);
}
