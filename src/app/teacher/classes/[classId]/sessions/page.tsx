import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import type { ActivityUiErrorCode } from "@/features/activities/errors";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { TeacherSessionList } from "@/features/sessions/components/session-list";
import { listClassSessions } from "@/features/sessions/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherClassSessionsPage({
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
        returnTo: `/teacher/classes/${classId}/sessions`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  if (identity.identity.account_type !== "teacher") {
    return (
      <TeacherSessionList
        classId={classId}
        initialErrorCode="FORBIDDEN"
        initialSessions={null}
      />
    );
  }

  const result = await listClassSessions(
    await createSupabaseServerClient(),
    classId,
  );
  const sessions = result.data?.viewerRole === "teacher" ? result.data : null;

  return (
    <TeacherSessionList
      classId={classId}
      initialErrorCode={
        result.error
          ? (result.error.code as ActivityUiErrorCode)
          : sessions
            ? null
            : "FORBIDDEN"
      }
      initialSessions={sessions}
    />
  );
}
