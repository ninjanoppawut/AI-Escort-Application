import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getActiveIdentity } from "@/features/auth/server/identity";
import { TeacherReviewScreen } from "@/features/observations/review/components/teacher-review-screen";
import { getTeacherReview } from "@/features/observations/review/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Teacher view of one submitted observation, and the deep link of the
// `observation_submitted` and `same_species_warning` notifications. Drafts,
// other classes, and students all get the same refusal.
export default async function TeacherReviewPage({
  params,
}: {
  params: Promise<{ observationId: string }>;
}) {
  const { observationId } = await params;
  if (!z.uuid().safeParse(observationId).success) notFound();

  const identity = await getActiveIdentity();
  if (identity.error) {
    if (
      identity.error === "AUTH_REQUIRED" ||
      identity.error === "EMAIL_NOT_CONFIRMED"
    ) {
      const query = new URLSearchParams({
        error: identity.error,
        returnTo: `/teacher/reviews/${observationId}`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  if (identity.identity.account_type !== "teacher") {
    return (
      <TeacherReviewScreen
        initialErrorCode="FORBIDDEN"
        initialReview={null}
        observationId={observationId}
      />
    );
  }

  const result = await getTeacherReview(
    await createSupabaseServerClient(),
    observationId,
  );
  return (
    <TeacherReviewScreen
      initialErrorCode={result.error ? result.error.code : null}
      initialReview={result.data ?? null}
      observationId={observationId}
    />
  );
}
