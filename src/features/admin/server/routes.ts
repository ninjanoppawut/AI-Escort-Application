import "server-only";

import type { z } from "zod";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  decodeAdminCursor,
  parsePageSize,
  type AdminCursor,
} from "../directory-contracts";
import { adminError, type AdminResult } from "./directory";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function respond<T>(result: AdminResult<T>, requestId: string) {
  return result.error
    ? jsonError(result.error, requestId, result.status)
    : jsonSuccess(result.data, requestId, result.status);
}

/** GET list route: cursor and page size from the query string (ADM-012). */
export async function handleAdminList<T>(
  request: Request,
  run: (
    supabase: Client,
    page: { cursor: AdminCursor | undefined; pageSize: number },
    params: URLSearchParams,
  ) => Promise<AdminResult<T>>,
) {
  const { requestId } = createRequestContext(request.headers);
  const params = new URL(request.url).searchParams;
  const cursor = decodeAdminCursor(params.get("cursor"));
  if (cursor === null) {
    const failure = adminError("INVALID_CURSOR");
    return jsonError(failure.error, requestId, failure.status);
  }
  const result = await run(
    await createSupabaseServerClient(),
    { cursor, pageSize: parsePageSize(params.get("limit")) },
    params,
  );
  return respond(result, requestId);
}

export async function handleAdminRead<T>(
  request: Request,
  run: (supabase: Client) => Promise<AdminResult<T>>,
) {
  const { requestId } = createRequestContext(request.headers);
  return respond(await run(await createSupabaseServerClient()), requestId);
}

/** POST mutation route: same-origin only, body validated before the RPC. */
export async function handleAdminMutation<TSchema extends z.ZodType, T>(
  request: Request,
  schema: TSchema,
  run: (supabase: Client, body: z.infer<TSchema>) => Promise<AdminResult<T>>,
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    const failure = adminError("ADMIN_REQUIRED");
    return jsonError(failure.error, requestId, failure.status);
  }
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    const failure = adminError("VALIDATION_FAILED");
    return jsonError(
      {
        ...failure.error,
        details: {
          fields: body.error.issues.map((issue) => issue.path.join(".")),
        },
      },
      requestId,
      failure.status,
    );
  }
  return respond(
    await run(await createSupabaseServerClient(), body.data),
    requestId,
  );
}

export function invalidIdResponse(request: Request) {
  const { requestId } = createRequestContext(request.headers);
  const failure = adminError("FORBIDDEN");
  return jsonError(failure.error, requestId, failure.status);
}
