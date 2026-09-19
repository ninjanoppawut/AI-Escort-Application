import { notFound } from "next/navigation";
import { z } from "zod";

import { requireSignedInForPage } from "@/features/auth/server/teacher-page";
import { CompletedMapScreen } from "@/features/completed-map/components/completed-map-screen";
import { getCompletedMap } from "@/features/completed-map/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The completed activity map, deep link of `session_completed` (MAP-004,
// D-027). The read model decides the viewer's role and what they may see.
export default async function CompletedMapPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();

  await requireSignedInForPage(`/sessions/${sessionId}/map`);
  const result = await getCompletedMap(
    await createSupabaseServerClient(),
    sessionId,
  );
  return (
    <CompletedMapScreen
      initialErrorCode={
        result.data ? null : (result.error?.code ?? "FORBIDDEN")
      }
      initialMap={result.data ?? null}
      sessionId={sessionId}
    />
  );
}
