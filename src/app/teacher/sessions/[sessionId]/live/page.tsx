import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import {
  ACTIVITY_ERROR_PRESENTATIONS,
  isActivityUiErrorCode,
} from "@/features/activities/errors";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { getSessionLive } from "@/features/sessions/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// `location_session_warning` deep link (UI_CONTRACTS.md §4). Teacher screens
// live under their class, so an authorized teacher continues there; the read
// model reauthorizes and a refusal is shown without revealing the session.
export default async function TeacherSessionLiveRedirectPage({
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
        returnTo: `/teacher/sessions/${sessionId}/live`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  const result =
    identity.identity.account_type === "teacher"
      ? await getSessionLive(await createSupabaseServerClient(), sessionId)
      : null;
  if (result?.data) {
    redirect(
      `/teacher/classes/${result.data.session.classId}/sessions/${sessionId}/live`,
    );
  }

  const code = result?.error?.code;
  const presentation =
    ACTIVITY_ERROR_PRESENTATIONS[
      isActivityUiErrorCode(code) ? code : "FORBIDDEN"
    ];
  return (
    <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
      <div className="mx-auto grid max-w-3xl gap-4">
        <section
          className="border-border bg-card rounded-xl border p-4"
          role="alert"
        >
          <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
          <h1 className="mt-2 font-semibold">{presentation.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {presentation.description}
          </p>
          <Link
            className="border-border bg-background mt-3 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
            href="/teacher/classes"
          >
            กลับรายการชั้นเรียน
          </Link>
        </section>
      </div>
    </main>
  );
}
