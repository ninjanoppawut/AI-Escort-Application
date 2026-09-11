import { redirect } from "next/navigation";

import {
  TeacherClassManager,
  type ClassRow,
  type InviteRow,
} from "@/features/classes/components/teacher-class-manager";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { listAuthorizedClasses } from "@/features/classes/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherClassesPage() {
  const identity = await getActiveIdentity();
  if (identity.error) {
    if (
      identity.error === "AUTH_REQUIRED" ||
      identity.error === "EMAIL_NOT_CONFIRMED"
    ) {
      redirect(
        `/auth/sign-in?returnTo=/teacher/classes&error=${identity.error}`,
      );
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  if (identity.identity.account_type !== "teacher") {
    return (
      <TeacherClassManager
        initialClasses={[]}
        initialError="FORBIDDEN"
        initialInvites={[]}
        schools={[]}
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: schools } = await supabase
    .from("schools")
    .select("id,name")
    .order("name", { ascending: true });

  const classResult = await listAuthorizedClasses(supabase);
  const classes = "data" in classResult ? classResult.data : [];

  const classIds = classes.map((classRow) => classRow.id);
  const { data: invites } = classIds.length
    ? await supabase
        .from("class_invites")
        .select(
          "id,class_id,code,expires_at,max_uses,used_count,status,disabled_at,created_at",
        )
        .in("class_id", classIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <TeacherClassManager
      initialClasses={(classes ?? []) as ClassRow[]}
      initialInvites={(invites ?? []) as InviteRow[]}
      schools={schools ?? []}
    />
  );
}
