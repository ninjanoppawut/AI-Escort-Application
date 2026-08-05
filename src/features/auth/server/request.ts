import "server-only";

import { z } from "zod";

import type { ApiError } from "@/lib/http/envelope";
import { jsonError } from "@/lib/http/route-response";

import { AUTH_ERROR_PRESENTATIONS, type AuthUiErrorCode } from "../errors";

export const DEFAULT_RETRY_AFTER_SECONDS = 60;

export function hasSafeRequestOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.infer<TSchema> | null> {
  try {
    return schema.parse(await request.json());
  } catch {
    return null;
  }
}

export function authApiError(code: AuthUiErrorCode): ApiError {
  return {
    code,
    message: AUTH_ERROR_PRESENTATIONS[code].title,
    retryable: code === "RATE_LIMITED",
    details:
      code === "RATE_LIMITED"
        ? { retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS }
        : {},
  };
}

export function authJsonError(
  code: AuthUiErrorCode,
  requestId: string,
  status: number,
) {
  const response = jsonError(authApiError(code), requestId, status);
  if (code === "RATE_LIMITED") {
    response.headers.set("retry-after", String(DEFAULT_RETRY_AFTER_SECONDS));
  }
  return response;
}
