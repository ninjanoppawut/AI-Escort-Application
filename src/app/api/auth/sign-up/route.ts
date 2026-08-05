import { NextRequest } from "next/server";

import { signUpRequestSchema } from "@/features/auth/contracts";
import { isRateLimitError, mapPasswordError } from "@/features/auth/errors";
import { authCallbackUrl, safeReturnPath } from "@/features/auth/redirect";
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
    return authJsonError("EMAIL_REQUIRED", requestId, 422);
  }

  const parsed = signUpRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const emailInvalid = parsed.error.issues.some(
      (issue) => issue.path[0] === "email",
    );
    return authJsonError(
      emailInvalid ? "EMAIL_REQUIRED" : "PASSWORD_POLICY_FAILED",
      requestId,
      422,
    );
  }

  const supabase = await createSupabaseServerClient();
  const returnTo = safeReturnPath(parsed.data.returnTo);
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: authCallbackUrl(
        request.nextUrl.origin,
        returnTo,
        "signup",
      ),
    },
  });

  if (error && isRateLimitError(error)) {
    return authJsonError("RATE_LIMITED", requestId, 429);
  }
  if (error?.code === "weak_password") {
    return authJsonError(mapPasswordError(error), requestId, 422);
  }

  // Supabase intentionally obscures whether an email is already registered.
  // Preserve that behavior for every non-rate-limited signup response.
  return jsonSuccess({ confirmationRequired: true, returnTo }, requestId, 202);
}
