import { NextRequest } from "next/server";

import { emailRequestSchema } from "@/features/auth/contracts";
import { isRateLimitError } from "@/features/auth/errors";
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

  const parsed = emailRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return authJsonError("EMAIL_REQUIRED", requestId, 422);
  }

  const supabase = await createSupabaseServerClient();
  const returnTo = safeReturnPath(parsed.data.returnTo);
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
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

  return jsonSuccess(
    { accepted: true, message: "หากบัญชีรอยืนยัน ระบบจะส่งอีเมลฉบับใหม่" },
    requestId,
    202,
  );
}
