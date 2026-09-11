import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getActiveIdentity } from "@/features/auth/server/identity";
import { GroupBoardScreen } from "@/features/groups/components/group-board";
import type { GroupUiErrorCode } from "@/features/groups/errors";
import { getClassGroupBoard } from "@/features/groups/server/board";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClassGroupsPage({
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
        returnTo: `/classes/${classId}/groups`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  const result = await getClassGroupBoard(
    await createSupabaseServerClient(),
    classId,
  );

  return (
    <GroupBoardScreen
      classId={classId}
      initialBoard={result.data ?? null}
      initialErrorCode={
        result.error ? (result.error.code as GroupUiErrorCode) : null
      }
    />
  );
}
