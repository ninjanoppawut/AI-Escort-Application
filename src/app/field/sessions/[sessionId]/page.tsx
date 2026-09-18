import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import type { ActivityUiErrorCode } from "@/features/activities/errors";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { StudentSessionShell } from "@/features/sessions/components/student-session-shell";
import { getSessionParticipantView } from "@/features/sessions/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// `session_group_active` deep link (UI_CONTRACTS.md §4). Field mode is a state
// of the participant session shell, so an authorized participant continues at
// the canonical activity session URL; a refused read renders its denial here.
export default async function FieldSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();

  const identity = await getActiveIdentity();
  if (identity.error) {
    if (
      identity.error === "AUTH_REQUIRED" ||
      identity.error === "EMAIL_NOT_CONFIRMED"
    ) {
      const query = new URLSearchParams({
        error: identity.error,
        returnTo: `/field/sessions/${sessionId}`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  if (identity.identity.account_type === "teacher") {
    redirect(`/teacher/sessions/${sessionId}/live`);
  }

  const result = await getSessionParticipantView(
    await createSupabaseServerClient(),
    sessionId,
  );
  if (result.data) {
    redirect(`/activities/${result.data.activity.id}/sessions/${sessionId}`);
  }

  return (
    <StudentSessionShell
      initialErrorCode={
        result.error ? (result.error.code as ActivityUiErrorCode) : null
      }
      initialView={null}
      sessionId={sessionId}
      userId={identity.identity.id}
    />
  );
}
