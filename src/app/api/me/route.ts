import { NextRequest } from "next/server";

import { getActiveIdentity } from "@/features/auth/server/identity";
import { authJsonError } from "@/features/auth/server/request";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonSuccess } from "@/lib/http/route-response";

export async function GET(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  const result = await getActiveIdentity();

  if (result.error) {
    const status = result.error === "AUTH_REQUIRED" ? 401 : 403;
    return authJsonError(result.error, requestId, status);
  }

  return jsonSuccess({ profile: result.identity }, requestId);
}
