import type { Metadata } from "next";

import { ResendConfirmationForm } from "@/features/auth/components/auth-forms";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { safeReturnPath } from "@/features/auth/redirect";

export const metadata: Metadata = { title: "ส่งอีเมลยืนยันอีกครั้ง" };

export default async function ResendConfirmationPage({
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
      description="กรอกอีเมลเดิม ระบบจะตอบแบบเดียวกันเสมอเพื่อปกป้องข้อมูลบัญชี"
      eyebrow="ยืนยันอีเมล"
      title="ขออีเมลฉบับใหม่"
    >
      <ResendConfirmationForm returnTo={safeReturnPath(returnTo)} />
    </AuthShell>
  );
}
