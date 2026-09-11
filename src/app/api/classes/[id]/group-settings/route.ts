import { NextRequest } from "next/server";

import {
  classIdParamSchema,
  updateClassSettingsRequestSchema,
} from "@/features/classes/contracts";
import { classApiError } from "@/features/classes/errors";
import { updateClassGroupSettings } from "@/features/classes/server/operations";
import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(classApiError("FORBIDDEN"), requestId, 403);
  }

  const params = classIdParamSchema.safeParse(await context.params);
  const body = updateClassSettingsRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!params.success || !body.success) {
    return jsonError(classApiError("FORBIDDEN"), requestId, 422);
  }

  const result = await updateClassGroupSettings(
    await createSupabaseServerClient(),
    params.data.id,
    body.data,
  );
  if ("error" in result)
    return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
