import { NextRequest } from "next/server";

import { updatePasswordRequestSchema } from "@/features/auth/contracts";
import { mapPasswordError } from "@/features/auth/errors";
import { hasRecoveryMethod } from "@/features/auth/server/identity";
import {
  authJsonError,
  hasSafeRequestOrigin,
} from "@/features/auth/server/request";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);

  if (!hasSafeRequestOrigin(request)) {
    return authJsonError("FORBIDDEN", requestId, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return authJsonError("PASSWORD_POLICY_FAILED", requestId, 422);
  }

  const parsed = updatePasswordRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return authJsonError("PASSWORD_POLICY_FAILED", requestId, 422);
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !hasRecoveryMethod(claimsData?.claims)) {
    return authJsonError("RECOVERY_LINK_INVALID", requestId, 403);
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    const code = mapPasswordError(error, true);
    return authJsonError(code, requestId, code === "RATE_LIMITED" ? 429 : 422);
  }

  await supabase.auth.signOut({ scope: "local" });
  return jsonSuccess({ updated: true, signedOut: true }, requestId);
}
