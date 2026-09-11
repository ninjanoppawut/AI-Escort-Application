import { NextRequest } from "next/server";

import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import { createStudentGroupRequestSchema } from "@/features/groups/contracts";
import { groupApiError } from "@/features/groups/errors";
import { createStudentGroup } from "@/features/groups/server/operations";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);
  if (!hasSafeRequestOrigin(request)) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 403);
  }

  const parsed = createStudentGroupRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonError(groupApiError("FORBIDDEN"), requestId, 422);
  }

  const result = await createStudentGroup(
    await createSupabaseServerClient(),
    parsed.data,
  );
  if (result.error) return jsonError(result.error, requestId, result.status);
  return jsonSuccess(result.data, requestId, 201);
}
