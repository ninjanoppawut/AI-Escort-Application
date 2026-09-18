import "server-only";

import { z } from "zod";

import { jsonError } from "@/lib/http/route-response";

import { reviewApiError } from "../errors";

export const observationParamsSchema = z.object({ id: z.uuid() });

export function reviewValidationError(error: z.ZodError, requestId: string) {
  return jsonError(
    reviewApiError("VALIDATION_FAILED", {
      fields: [
        ...new Set(error.issues.map((issue) => String(issue.path[0] ?? ""))),
      ],
    }),
    requestId,
    422,
  );
}
