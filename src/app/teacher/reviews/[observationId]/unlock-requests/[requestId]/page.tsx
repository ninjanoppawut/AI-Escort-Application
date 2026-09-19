import { notFound } from "next/navigation";
import { z } from "zod";

import { requireSignedInForPage } from "@/features/auth/server/teacher-page";
import { TeacherReviewScreen } from "@/features/observations/review/components/teacher-review-screen";
import { getTeacherReview } from "@/features/observations/review/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Deep link of `revision_access_requested`: the review with the request in focus.
export default async function TeacherUnlockRequestPage({
  params,
}: {
  params: Promise<{ observationId: string; requestId: string }>;
}) {
  const { observationId, requestId } = await params;
  if (
    !z.uuid().safeParse(observationId).success ||
    !z.uuid().safeParse(requestId).success
  ) {
    notFound();
  }

  const { isTeacher } = await requireSignedInForPage(
    `/teacher/reviews/${observationId}/unlock-requests/${requestId}`,
  );
  const result = isTeacher
    ? await getTeacherReview(await createSupabaseServerClient(), observationId)
    : null;
  return (
    <TeacherReviewScreen
      highlightRequestId={requestId}
      initialErrorCode={
        result?.data ? null : (result?.error?.code ?? "FORBIDDEN")
      }
      initialReview={result?.data ?? null}
      observationId={observationId}
    />
  );
}
