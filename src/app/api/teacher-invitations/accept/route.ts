import {
  acceptTeacherInviteSchema,
  teacherInviteProblemOf,
} from "@/features/admin/teacher-invite/contracts";
import { hasSafeRequestOrigin } from "@/features/auth/server/request";
import type { ApiErrorCode } from "@/lib/http/error-code";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonError, jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  TEACHER_INVITE_INVALID: "คำเชิญครูไม่ถูกต้อง",
  TEACHER_INVITE_EXPIRED: "คำเชิญครูหมดอายุ",
  AUTH_REQUIRED: "กรุณาเข้าสู่ระบบ",
  EMAIL_NOT_CONFIRMED: "กรุณายืนยันอีเมล",
};

// Consumes a teacher invitation for the signed-in, verified account whose
// email it was issued to (consume_teacher_invitation).
export async function POST(request: Request) {
  const { requestId } = createRequestContext(request.headers);
  const refused = (code: ApiErrorCode, status: number) =>
    jsonError(
      {
        code,
        message: MESSAGES[code] ?? "คำเชิญครูไม่ถูกต้อง",
        retryable: false,
        details: {},
      },
      requestId,
      status,
    );

  if (!hasSafeRequestOrigin(request)) {
    return refused("TEACHER_INVITE_INVALID", 403);
  }
  const body = acceptTeacherInviteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) return refused("TEACHER_INVITE_INVALID", 400);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consume_teacher_invitation", {
    invitation_token: body.data.token,
  });
  const row = data?.[0];
  if (error || !row) {
    if (error?.message === "AUTH_REQUIRED")
      return refused("AUTH_REQUIRED", 401);
    if (error?.message === "EMAIL_NOT_CONFIRMED") {
      return refused("EMAIL_NOT_CONFIRMED", 403);
    }
    const code = teacherInviteProblemOf(error?.message);
    return refused(code, code === "TEACHER_INVITE_EXPIRED" ? 410 : 409);
  }
  return jsonSuccess(
    { schoolId: row.school_id, accountType: "teacher" as const },
    requestId,
  );
}
