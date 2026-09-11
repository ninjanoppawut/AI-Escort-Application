import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ActivityEditor } from "@/features/activities/components/activity-editor";
import type { ActivityUiErrorCode } from "@/features/activities/errors";
import { getActivityDetail } from "@/features/activities/server/operations";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherActivityEditorPage({
  params,
}: {
  params: Promise<{ classId: string; activityId: string }>;
}) {
  const { classId, activityId } = await params;
  if (
    !z.uuid().safeParse(classId).success ||
    !z.uuid().safeParse(activityId).success
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
        returnTo: `/teacher/classes/${classId}/activities/${activityId}`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  if (identity.identity.account_type !== "teacher") {
    return (
      <ActivityEditor
        activityId={activityId}
        classId={classId}
        initialDetail={null}
        initialErrorCode="FORBIDDEN"
      />
    );
  }

  const result = await getActivityDetail(
    await createSupabaseServerClient(),
    activityId,
  );
  if (result.data && result.data.activity.classId !== classId) notFound();
  const detail = result.data?.viewerRole === "teacher" ? result.data : null;

  return (
    <ActivityEditor
      activityId={activityId}
      classId={classId}
      initialDetail={detail}
      initialErrorCode={
        result.error
          ? (result.error.code as ActivityUiErrorCode)
          : detail
            ? null
            : "FORBIDDEN"
      }
    />
  );
}
