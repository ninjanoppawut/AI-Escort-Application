import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getActiveIdentity } from "@/features/auth/server/identity";
import { GroupDetailScreen } from "@/features/groups/components/group-detail";
import type { GroupUiErrorCode } from "@/features/groups/errors";
import { getGroupDetail } from "@/features/groups/server/invitations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ classId: string; groupId: string }>;
}) {
  const { classId, groupId } = await params;
  if (
    !z.uuid().safeParse(classId).success ||
    !z.uuid().safeParse(groupId).success
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
        returnTo: `/classes/${classId}/groups/${groupId}`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  const result = await getGroupDetail(
    await createSupabaseServerClient(),
    groupId,
  );
  if (result.data && result.data.classId !== classId) notFound();

  return (
    <GroupDetailScreen
      classId={classId}
      groupId={groupId}
      initialDetail={result.data ?? null}
      initialErrorCode={
        result.error ? (result.error.code as GroupUiErrorCode) : null
      }
    />
  );
}
