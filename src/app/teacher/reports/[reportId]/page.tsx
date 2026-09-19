import { notFound } from "next/navigation";
import { z } from "zod";

import { requireSignedInForPage } from "@/features/auth/server/teacher-page";
import { IssueReportScreen } from "@/features/observations/review/components/issue-report-screen";
import { getIssueReport } from "@/features/observations/review/server/revision-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Deep link of `observation_issue_reported` (class teachers only, D-049).
export default async function TeacherIssueReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  if (!z.uuid().safeParse(reportId).success) notFound();

  const { isTeacher } = await requireSignedInForPage(
    `/teacher/reports/${reportId}`,
  );
  const result = isTeacher
    ? await getIssueReport(await createSupabaseServerClient(), reportId)
    : null;
  return (
    <IssueReportScreen
      initialErrorCode={
        result?.data ? null : (result?.error?.code ?? "FORBIDDEN")
      }
      initialReport={result?.data ?? null}
      reportId={reportId}
    />
  );
}
