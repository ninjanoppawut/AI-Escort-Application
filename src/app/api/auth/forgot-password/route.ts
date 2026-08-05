import { NextRequest } from "next/server";

import { emailRequestSchema } from "@/features/auth/contracts";
import { isRateLimitError } from "@/features/auth/errors";
import { authCallbackUrl } from "@/features/auth/redirect";
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
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: authCallbackUrl(request.nextUrl.origin, "/app", "recovery"),
    },
  );

  if (error && isRateLimitError(error)) {
    return authJsonError("RATE_LIMITED", requestId, 429);
  }

  return jsonSuccess(
    {
      accepted: true,
      message: "หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่",
    },
    requestId,
    202,
  );
}
