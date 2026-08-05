import type { Metadata } from "next";

import { UpdatePasswordForm } from "@/features/auth/components/auth-forms";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { AuthFeedback } from "@/features/auth/components/auth-feedback";
import { hasRecoveryMethod } from "@/features/auth/server/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ตั้งรหัสผ่านใหม่" };

export default async function UpdatePasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const recoveryValid = !error && hasRecoveryMethod(data?.claims);

  return (
    <AuthShell
      description="ลิงก์กู้คืนใช้ได้ครั้งเดียว เมื่อบันทึกแล้วระบบจะให้เข้าสู่ระบบใหม่"
      eyebrow="ลิงก์กู้คืนที่ปลอดภัย"
      title="ตั้งรหัสผ่านใหม่"
    >
      {recoveryValid ? (
        <UpdatePasswordForm />
      ) : (
        <div>
          <AuthFeedback
            feedback={{ kind: "error", code: "RECOVERY_LINK_INVALID" }}
          />
          <a
            className="bg-primary text-primary-foreground inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 font-semibold"
            href="/auth/forgot-password"
          >
            ขอเปลี่ยนรหัสผ่านใหม่
          </a>
        </div>
      )}
    </AuthShell>
  );
}
