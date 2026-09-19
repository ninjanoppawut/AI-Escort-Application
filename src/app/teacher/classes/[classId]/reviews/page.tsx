import { notFound } from "next/navigation";
import { z } from "zod";

import { requireSignedInForPage } from "@/features/auth/server/teacher-page";
import { ReviewQueueScreen } from "@/features/observations/review/components/review-queue-screen";
import { TeacherAccessDenied } from "@/features/observations/review/components/teacher-access-denied";

export const dynamic = "force-dynamic";

// Teacher review queue for one class (design T-11); the API reauthorizes.
export default async function TeacherReviewQueuePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  if (!z.uuid().safeParse(classId).success) notFound();

  const { isTeacher } = await requireSignedInForPage(
    `/teacher/classes/${classId}/reviews`,
  );
  if (!isTeacher) {
    return (
      <TeacherAccessDenied detail="คิวตรวจงานเปิดได้เฉพาะครูของชั้นเรียนนี้" />
    );
  }
  return <ReviewQueueScreen classId={classId} />;
}
