import { notFound } from "next/navigation";
import { z } from "zod";

import { requireSignedInForPage } from "@/features/auth/server/teacher-page";
import { RevisionScreen } from "@/features/observations/review/components/revision-screen";
import { getRevisionState } from "@/features/observations/review/server/revision-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Deep link of `observation_revision_requested` and `revision_access_granted`:
// the owner's targeted revision of a submitted observation.
export default async function ObservationRevisionPage({
  params,
}: {
  params: Promise<{ observationId: string }>;
}) {
  const { observationId } = await params;
  if (!z.uuid().safeParse(observationId).success) notFound();

  const { isTeacher } = await requireSignedInForPage(
    `/observations/${observationId}/revision`,
  );
  const result = isTeacher
    ? null
    : await getRevisionState(await createSupabaseServerClient(), observationId);
  return (
    <RevisionScreen
      initialErrorCode={
        result?.data ? null : (result?.error?.code ?? "FORBIDDEN")
      }
      initialState={result?.data ?? null}
      observationId={observationId}
    />
  );
}
