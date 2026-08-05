import { NextRequest } from "next/server";

import { signInRequestSchema } from "@/features/auth/contracts";
import { mapSignInError } from "@/features/auth/errors";
import { safeReturnPath } from "@/features/auth/redirect";
import { getActiveIdentity } from "@/features/auth/server/identity";
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
    return authJsonError("INVALID_CREDENTIALS", requestId, 401);
  }

  const parsed = signInRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return authJsonError("INVALID_CREDENTIALS", requestId, 401);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    const code = mapSignInError(error);
    const status =
      code === "RATE_LIMITED" ? 429 : code === "ACCOUNT_DISABLED" ? 403 : 401;
    return authJsonError(code, requestId, status);
  }

  const identityResult = await getActiveIdentity();
  if (identityResult.error) {
    await supabase.auth.signOut({ scope: "local" });
    const status = identityResult.error === "AUTH_REQUIRED" ? 401 : 403;
    return authJsonError(identityResult.error, requestId, status);
  }

  return jsonSuccess(
    {
      destination: safeReturnPath(parsed.data.returnTo),
      accountType: identityResult.identity.account_type,
    },
    requestId,
  );
}
