import type { Metadata } from "next";

import { SignInForm } from "@/features/auth/components/auth-forms";
import { AuthShell } from "@/features/auth/components/auth-shell";
import {
  AUTH_UI_ERROR_CODES,
  type AuthUiErrorCode,
} from "@/features/auth/errors";
import { safeReturnPath } from "@/features/auth/redirect";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const error = first(query.error);
  const initialError = AUTH_UI_ERROR_CODES.includes(error as AuthUiErrorCode)
    ? (error as AuthUiErrorCode)
    : undefined;

  return (
    <AuthShell
      description="ใช้อีเมลที่ยืนยันแล้วเพื่อเปิดชั้นเรียนและงานสำรวจของคุณ"
      eyebrow="ยินดีต้อนรับกลับ"
      title="เข้าสู่ระบบ"
    >
      <SignInForm
        initialError={initialError}
        returnTo={safeReturnPath(first(query.returnTo))}
      />
    </AuthShell>
  );
}
