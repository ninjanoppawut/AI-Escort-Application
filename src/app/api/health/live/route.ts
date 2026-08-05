import type { NextRequest } from "next/server";

import { createRequestContext } from "@/lib/http/request-context";
import { jsonSuccess } from "@/lib/http/route-response";

export function GET(request: NextRequest) {
  const context = createRequestContext(request.headers);

  return jsonSuccess(
    {
      status: "live",
      timestamp: new Date().toISOString(),
    },
    context.requestId,
  );
}
