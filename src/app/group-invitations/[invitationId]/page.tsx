import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getActiveIdentity } from "@/features/auth/server/identity";
import { GroupInvitationScreen } from "@/features/groups/components/group-invitation";
import type { GroupUiErrorCode } from "@/features/groups/errors";
import { getGroupInvitation } from "@/features/groups/server/invitations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GroupInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  if (!z.uuid().safeParse(invitationId).success) notFound();

  const identity = await getActiveIdentity();
  if (identity.error) {
    if (
      identity.error === "AUTH_REQUIRED" ||
      identity.error === "EMAIL_NOT_CONFIRMED"
    ) {
      const query = new URLSearchParams({
        error: identity.error,
        returnTo: `/group-invitations/${invitationId}`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  const result = await getGroupInvitation(
    await createSupabaseServerClient(),
    invitationId,
  );

  return (
    <GroupInvitationScreen
      initialErrorCode={
        result.error ? (result.error.code as GroupUiErrorCode) : null
      }
      initialInvitation={result.data ?? null}
      invitationId={invitationId}
    />
  );
}
