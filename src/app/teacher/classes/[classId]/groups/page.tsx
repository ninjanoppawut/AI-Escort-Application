import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getActiveIdentity } from "@/features/auth/server/identity";
import { TeacherGroupManager } from "@/features/groups/components/teacher-group-manager";
import type { GroupUiErrorCode } from "@/features/groups/errors";
import { getClassGroupBoard } from "@/features/groups/server/board";
import { listClassCreationClaims } from "@/features/groups/server/lifecycle";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherClassGroupsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  if (!z.uuid().safeParse(classId).success) notFound();

  const identity = await getActiveIdentity();
  if (identity.error) {
    if (
      identity.error === "AUTH_REQUIRED" ||
      identity.error === "EMAIL_NOT_CONFIRMED"
    ) {
      const query = new URLSearchParams({
        error: identity.error,
        returnTo: `/teacher/classes/${classId}/groups`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  if (identity.identity.account_type !== "teacher") {
    return (
      <TeacherGroupManager
        classId={classId}
        initialBoard={null}
        initialClaims={null}
        initialErrorCode="FORBIDDEN"
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  const [board, claims] = await Promise.all([
    getClassGroupBoard(supabase, classId),
    listClassCreationClaims(supabase, classId),
  ]);
  const teacherBoard =
    board.data?.viewer.role === "teacher" ? board.data : null;

  return (
    <TeacherGroupManager
      classId={classId}
      initialBoard={teacherBoard}
      initialClaims={claims.data ?? null}
      initialErrorCode={
        board.error
          ? (board.error.code as GroupUiErrorCode)
          : teacherBoard
            ? null
            : "FORBIDDEN"
      }
    />
  );
}
