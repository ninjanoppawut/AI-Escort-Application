import type { Metadata } from "next";

import { SignUpForm } from "@/features/auth/components/auth-forms";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { safeReturnPath } from "@/features/auth/redirect";

export const metadata: Metadata = { title: "สมัครสมาชิก" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const returnTo = Array.isArray(query.returnTo)
    ? query.returnTo[0]
    : query.returnTo;

  return (
    <AuthShell
      description="สร้างบัญชีนักเรียนด้วยอีเมลจริง แล้วเปิดลิงก์ที่ส่งไปเพื่อยืนยันบัญชี"
      eyebrow="บัญชีใหม่"
      title="สมัครสมาชิก"
    >
      <SignUpForm returnTo={safeReturnPath(returnTo)} />
    </AuthShell>
  );
}
