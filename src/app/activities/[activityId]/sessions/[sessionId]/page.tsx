import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import type { ActivityUiErrorCode } from "@/features/activities/errors";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { StudentSessionShell } from "@/features/sessions/components/student-session-shell";
import { getSessionParticipantView } from "@/features/sessions/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Participant session shell: the `session_group_next` notification deep link
// (UI_CONTRACTS.md §4). Waiting, ready, field mode, paused, and completed
// states all render here from the participant read model.
export default async function StudentSessionPage({
  params,
}: {
  params: Promise<{ activityId: string; sessionId: string }>;
}) {
  const { activityId, sessionId } = await params;
  if (
    !z.uuid().safeParse(activityId).success ||
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
        returnTo: `/activities/${activityId}/sessions/${sessionId}`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  // Teachers control the session from the live screen, which reauthorizes.
  if (identity.identity.account_type === "teacher") {
    redirect(`/teacher/sessions/${sessionId}/live`);
  }

  const result = await getSessionParticipantView(
    await createSupabaseServerClient(),
    sessionId,
  );
  if (result.data && result.data.activity.id !== activityId) notFound();

  return (
    <StudentSessionShell
      initialErrorCode={
        result.error ? (result.error.code as ActivityUiErrorCode) : null
      }
      initialView={result.data ?? null}
      sessionId={sessionId}
      userId={identity.identity.id}
    />
  );
}
