import { NextRequest } from "next/server";

import { createClassRequestSchema } from "@/features/classes/contracts";
import { classApiError } from "@/features/classes/errors";
import {
  createClass,
  listAuthorizedClasses,
} from "@/features/classes/server/operations";
import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  const result = await listAuthorizedClasses(
    await createSupabaseServerClient(),
  );
  if ("error" in result)
    return jsonError(result.error, requestId, result.status);
  return jsonSuccess({ items: result.data }, requestId);
}

export async function POST(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(classApiError("FORBIDDEN"), requestId, 403);
  }

  const parsed = createClassRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonError(classApiError("FORBIDDEN"), requestId, 422);
  }

  const result = await createClass(
    await createSupabaseServerClient(),
    parsed.data,
  );
  if ("error" in result)
    return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId, 201);
}
