import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getActiveIdentity } from "@/features/auth/server/identity";
import { ObservationDraftScreen } from "@/features/observations/components/observation-draft-screen";
import {
  isObservationUiErrorCode,
  type ObservationUiErrorCode,
} from "@/features/observations/errors";
import { getObservationDraft } from "@/features/observations/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Owner deep link for one observation draft (P8-04). Only the owning student
// reads a draft; teachers, classmates, and unknown IDs all get the same
// FORBIDDEN state rendered here, never a redirect that would reveal existence.
export default async function ObservationDraftPage({
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
        returnTo: `/observations/${observationId}`,
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  const viewerRole = identity.identity.account_type;
  if (viewerRole === "teacher") {
    return (
      <ObservationDraftScreen
        initialDraft={null}
        initialErrorCode="FORBIDDEN"
        observationId={observationId}
        viewerRole="teacher"
      />
    );
  }

  const result = await getObservationDraft(
    await createSupabaseServerClient(),
    observationId,
  );
  const code = result.error?.code;
  const initialErrorCode: ObservationUiErrorCode | null = result.error
    ? isObservationUiErrorCode(code)
      ? code
      : "FORBIDDEN"
    : null;

  return (
    <ObservationDraftScreen
      initialDraft={result.data ?? null}
      initialErrorCode={initialErrorCode}
      observationId={observationId}
      viewerRole="student"
    />
  );
}
