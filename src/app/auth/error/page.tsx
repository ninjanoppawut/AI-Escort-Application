import type { Metadata } from "next";
import Link from "next/link";

import { AuthFeedback } from "@/features/auth/components/auth-feedback";
import { AuthShell } from "@/features/auth/components/auth-shell";
import {
  AUTH_UI_ERROR_CODES,
  type AuthUiErrorCode,
} from "@/features/auth/errors";

export const metadata: Metadata = { title: "ไม่สามารถยืนยันบัญชี" };

function destination(code: AuthUiErrorCode) {
  if (code === "AUTH_CALLBACK_INVALID" || code === "EMAIL_NOT_CONFIRMED") {
    return "/auth/resend-confirmation";
  }
  if (code === "RECOVERY_LINK_INVALID") return "/auth/forgot-password";
  return "/auth/sign-in";
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const rawCode = Array.isArray(query.code) ? query.code[0] : query.code;
  const code = AUTH_UI_ERROR_CODES.includes(rawCode as AuthUiErrorCode)
    ? (rawCode as AuthUiErrorCode)
    : "AUTH_CALLBACK_INVALID";

  return (
    <AuthShell
      description="ระบบไม่ใช้รายละเอียดจากลิงก์ที่ไม่ผ่านการตรวจสอบ และจะไม่เปิดเผยข้อมูลบัญชี"
      eyebrow="ตรวจสอบลิงก์"
      title="ดำเนินการต่อไม่ได้"
    >
      <AuthFeedback feedback={{ kind: "error", code }} />
      <Link
        className="bg-primary text-primary-foreground inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 font-semibold"
        href={destination(code)}
      >
        ดำเนินการอย่างปลอดภัย
      </Link>
    </AuthShell>
  );
}
