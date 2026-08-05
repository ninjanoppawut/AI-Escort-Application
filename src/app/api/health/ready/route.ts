import type { NextRequest } from "next/server";

import { EnvironmentConfigurationError } from "@/lib/env/schema";
import { getServerEnvironment } from "@/lib/env/server";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";

export function GET(request: NextRequest) {
  const context = createRequestContext(request.headers);

  try {
    const environment = getServerEnvironment();

    return jsonSuccess(
      {
        status: "ready",
        environment: environment.NEXT_PUBLIC_APP_ENV,
        release: environment.RELEASE_SHA,
      },
      context.requestId,
    );
  } catch (error) {
    if (error instanceof EnvironmentConfigurationError) {
      return jsonError(
        {
          code: "CONFIGURATION_INVALID",
          message: "Required service configuration is incomplete.",
          retryable: false,
          details: { fields: error.fields },
        },
        context.requestId,
        503,
      );
    }

    throw error;
  }
}
