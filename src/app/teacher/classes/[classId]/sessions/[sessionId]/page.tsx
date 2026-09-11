import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import type { ActivityUiErrorCode } from "@/features/activities/errors";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { SessionSetup } from "@/features/sessions/components/session-setup";
import { getSessionSetup } from "@/features/sessions/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherSessionSetupPage({
  params,
}: {
  params: Promise<{ classId: string; sessionId: string }>;
}) {
  const { classId, sessionId } = await params;
  if (
    !z.uuid().safeParse(classId).success ||
    !z.uuid().safeParse(sessionId).success
  ) {
    notFound();
  }

  const identity = await getActiveIdentity();
  if (identity.error) {
    if (
      identity.error === "AUTH_REQUIRED" ||
      identity.error === "EMAIL_NOT_CONFIRMED"
    ) {
      const query = new URLSearchParams({
        error: identity.error,
        returnTo: `/teacher/classes/${classId}/sessions/${sessionId}`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  if (identity.identity.account_type !== "teacher") {
    return (
      <SessionSetup
        classId={classId}
        initialErrorCode="FORBIDDEN"
        initialSetup={null}
        sessionId={sessionId}
      />
    );
  }

  const result = await getSessionSetup(
    await createSupabaseServerClient(),
    sessionId,
  );
  if (result.data && result.data.session.classId !== classId) notFound();

  return (
    <SessionSetup
      classId={classId}
      initialErrorCode={
        result.error ? (result.error.code as ActivityUiErrorCode) : null
      }
      initialSetup={result.data ?? null}
      sessionId={sessionId}
    />
  );
}
