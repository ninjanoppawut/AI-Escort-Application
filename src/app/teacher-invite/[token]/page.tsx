import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  TEACHER_INVITE_TOKEN,
  teacherInviteProblemOf,
} from "@/features/admin/teacher-invite/contracts";
import { TeacherInviteScreen } from "@/features/admin/teacher-invite/teacher-invite-screen";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "คำเชิญครู",
  referrer: "no-referrer",
};

// Teacher invitation link issued by a platform admin (P15-02, D-062).
export default async function TeacherInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!TEACHER_INVITE_TOKEN.test(token)) {
    return (
      <TeacherInviteScreen
        preview={null}
        problem="TEACHER_INVITE_INVALID"
        token=""
      />
    );
  }

  const returnTo = `/teacher-invite/${token}`;
  const identity = await getActiveIdentity();
  if (identity.error) {
    if (
      identity.error === "AUTH_REQUIRED" ||
      identity.error === "EMAIL_NOT_CONFIRMED"
    ) {
      const query = new URLSearchParams({ error: identity.error, returnTo });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("preview_teacher_invitation", {
    invitation_token: token,
  });
  const row = data?.[0];
  if (error || !row) {
    return (
      <TeacherInviteScreen
        preview={null}
        problem={teacherInviteProblemOf(error?.message)}
        token={token}
      />
    );
  }
  return (
    <TeacherInviteScreen
      preview={{
        schoolName: row.school_name,
        email: row.email,
        expiresAt: row.expires_at,
      }}
      problem={null}
      token={token}
    />
  );
}
