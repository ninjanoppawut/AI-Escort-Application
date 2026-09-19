import { notFound } from "next/navigation";
import { z } from "zod";

import { requireSignedInForPage } from "@/features/auth/server/teacher-page";
import { ExportStatusScreen } from "@/features/exports/components/export-status-screen";
import { getExport } from "@/features/exports/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Deep link of `export_ready` (/teacher/exports/{exportId}).
export default async function TeacherExportPage({
  params,
}: {
  params: Promise<{ exportId: string }>;
}) {
  const { exportId } = await params;
  if (!z.uuid().safeParse(exportId).success) notFound();

  const { isTeacher } = await requireSignedInForPage(
    `/teacher/exports/${exportId}`,
  );
  const result = isTeacher
    ? await getExport(await createSupabaseServerClient(), exportId)
    : null;
  return (
    <ExportStatusScreen
      exportId={exportId}
      initialErrorCode={
        result?.data ? null : (result?.error?.code ?? "FORBIDDEN")
      }
      initialExport={result?.data ?? null}
    />
  );
}
