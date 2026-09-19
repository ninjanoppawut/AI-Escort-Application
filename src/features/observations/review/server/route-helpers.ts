import "server-only";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import type { ApiError } from "@/lib/http/envelope";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";

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

type RouteResult<T> =
  | { data: T; error?: never; status?: never }
  | { data?: never; error: ApiError; status: number };

/**
 * The P12 mutation route shape: same-origin check, UUID params, a strict
 * body, one server operation, and the stable envelope. A rate-limited
 * refusal carries `Retry-After` (API_AND_REALTIME.md §24).
 */
export async function handleReviewMutation<
  TParams extends z.ZodType,
  TBody extends z.ZodType,
  TData,
>(
  request: NextRequest,
  rawParams: Promise<unknown>,
  paramsSchema: TParams,
  bodySchema: TBody,
  run: (
    params: z.infer<TParams>,
    body: z.infer<TBody>,
  ) => Promise<RouteResult<TData>>,
  successStatus: (data: TData) => number = () => 200,
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 403);
  }
  const params = paramsSchema.safeParse(await rawParams);
  if (!params.success) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 404);
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return reviewValidationError(body.error, requestId);

  const result = await run(params.data, body.data);
  if (result.error) {
    const response = jsonError(result.error, requestId, result.status);
    const retryAfter = result.error.details.retryAfterSeconds;
    if (
      result.error.code === "RATE_LIMITED" &&
      typeof retryAfter === "number"
    ) {
      response.headers.set("retry-after", String(retryAfter));
    }
    return response;
  }
  return jsonSuccess(result.data, requestId, successStatus(result.data));
}

/** A read route: UUID params and one server operation. */
export async function handleReviewRead<TParams extends z.ZodType, TData>(
  request: NextRequest,
  rawParams: Promise<unknown>,
  paramsSchema: TParams,
  run: (params: z.infer<TParams>) => Promise<RouteResult<TData>>,
) {
  const { requestId } = createRequestContext(request.headers);
  const params = paramsSchema.safeParse(await rawParams);
  if (!params.success) {
    return jsonError(reviewApiError("FORBIDDEN"), requestId, 404);
  }
  const result = await run(params.data);
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
