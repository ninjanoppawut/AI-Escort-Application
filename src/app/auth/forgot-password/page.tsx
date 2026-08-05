import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/features/auth/components/auth-forms";
import { AuthShell } from "@/features/auth/components/auth-shell";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      description="เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลที่ใช้สมัคร โดยไม่เปิดเผยว่าอีเมลใดมีบัญชี"
      eyebrow="กู้คืนบัญชี"
      title="ลืมรหัสผ่าน"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
