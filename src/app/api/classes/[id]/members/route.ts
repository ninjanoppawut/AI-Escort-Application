import { NextRequest } from "next/server";

import {
  classIdParamSchema,
  classMemberListQuerySchema,
} from "@/features/classes/contracts";
import { classApiError } from "@/features/classes/errors";
import { listClassMembers } from "@/features/classes/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { requestId } = createRequestContext(request.headers);
  const params = classIdParamSchema.safeParse(await context.params);
  if (!params.success) {
    return jsonError(classApiError("FORBIDDEN"), requestId, 404);
  }

  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const parsedQuery = classMemberListQuerySchema.safeParse(searchParams);
  if (!parsedQuery.success) {
    return jsonError(classApiError("FORBIDDEN"), requestId, 422);
  }

  const result = await listClassMembers(
    await createSupabaseServerClient(),
    params.data.id,
    parsedQuery.data,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId);
}
