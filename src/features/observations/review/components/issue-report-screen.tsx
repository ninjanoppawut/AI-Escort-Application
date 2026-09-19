"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Flag, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";

import { formatCaptureTime } from "../../capture";
import {
  fetchObservationJson,
  sendObservationJson,
} from "../../client/request";
import { presentReviewError, reviewErrorCodeOf } from "../client";
import { isReviewUiErrorCode } from "../errors";
import {
  REPORT_TYPE_LABELS,
  issueReportViewSchema,
  reportResolutionResponseSchema,
  revisionQueryKeys,
  type IssueReportView,
} from "../revision-contracts";

const STATUS_LABELS: Record<IssueReportView["status"], string> = {
  open: "ใหม่",
  reviewing: "กำลังตรวจ",
  resolved: "แก้ไขแล้ว",
  dismissed: "ปิดโดยไม่ต้องแก้",
};

/**
 * Teacher view of one issue report (deep link of `observation_issue_reported`,
 * D-049): the report, the record it names, and a one-way resolution.
 */
export function IssueReportScreen({
  reportId,
  initialReport,
  initialErrorCode,
}: {
  reportId: string;
  initialReport: IssueReportView | null;
  initialErrorCode: string | null;
}) {
  const noteId = useId();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const reportQuery = useQuery({
    queryKey: revisionQueryKeys.report(reportId),
    queryFn: () =>
      fetchObservationJson(`/api/reports/${reportId}`, issueReportViewSchema),
    ...(initialReport ? { initialData: initialReport } : {}),
    enabled: initialReport !== null,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (status: "reviewing" | "resolved" | "dismissed") =>
      sendObservationJson(
        "POST",
        `/api/reports/${reportId}/resolve`,
        { status, note },
        reportResolutionResponseSchema,
      ),
    onSettled: () =>
      void queryClient.invalidateQueries({
        queryKey: revisionQueryKeys.report(reportId),
      }),
  });
  const report = reportQuery.data;

  if (!report) {
    const code = initialErrorCode ?? "FORBIDDEN";
    const presentation = presentReviewError(
      isReviewUiErrorCode(code) ? code : "FORBIDDEN",
    );
    return (
      <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
        <section
          className="border-border bg-card mx-auto max-w-2xl rounded-xl border p-4"
          data-error-code={code}
          role="alert"
        >
          <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
          <h1 className="mt-2 font-semibold">{presentation.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            เฉพาะครูของชั้นเรียนนี้เปิดรายงานได้
          </p>
          <Link
            className="border-border bg-background mt-3 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
            href="/teacher/classes"
          >
            กลับรายการชั้นเรียน
          </Link>
        </section>
      </main>
    );
  }

  const open = report.status === "open" || report.status === "reviewing";
  const errorCode = mutation.isError ? reviewErrorCodeOf(mutation.error) : null;

  return (
    <main className="bg-background min-h-dvh">
      <div className="mx-auto grid w-full max-w-2xl content-start gap-4 px-4 pt-4 pb-8 sm:px-8">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับรายการพืช"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={`/teacher/reviews/${report.observationId}`}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Flag aria-hidden="true" className="size-5" />
            รายงานปัญหา
          </h1>
        </header>

        <section
          className="border-border bg-card grid gap-2 rounded-xl border p-4 text-sm leading-6"
          data-report-status={report.status}
        >
          <p className="font-semibold">
            {REPORT_TYPE_LABELS[report.type]} · {STATUS_LABELS[report.status]}
          </p>
          <p className="whitespace-pre-line">{report.reason}</p>
          <p className="text-muted-foreground text-[13px]">
            รายงานโดย {report.reporterName ?? "นักเรียน"} ·{" "}
            <span suppressHydrationWarning>
              {formatCaptureTime(report.createdAt)}
            </span>
          </p>
          <p className="text-muted-foreground text-[13px]">
            เจ้าของรายการไม่เห็นว่าใครรายงาน
          </p>
          {report.observation ? (
            <p>
              รายการ:{" "}
              <Link
                className="font-medium text-[#1F5C3A] underline underline-offset-2"
                href={`/teacher/reviews/${report.observationId}`}
              >
                {report.observation.commonName ?? "รายการพืช"}
              </Link>{" "}
              ของ {report.observation.studentName ?? "นักเรียน"}
            </p>
          ) : null}
          {report.resolutionNote ? (
            <p>บันทึกของครู: {report.resolutionNote}</p>
          ) : null}
        </section>

        {open ? (
          <section className="border-border bg-card grid gap-3 rounded-xl border p-4">
            <label className="text-sm font-medium" htmlFor={noteId}>
              บันทึกการจัดการ (ถ้ามี)
            </label>
            <textarea
              className="border-border bg-background min-h-20 rounded-[10px] border px-3 py-2 text-base"
              id={noteId}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
            <div className="grid gap-2 sm:grid-cols-3">
              {report.status === "open" ? (
                <Button
                  disabled={!online || mutation.isPending}
                  onClick={() => mutation.mutate("reviewing")}
                  variant="outline"
                >
                  กำลังตรวจ
                </Button>
              ) : null}
              <Button
                disabled={!online || mutation.isPending}
                onClick={() => mutation.mutate("resolved")}
              >
                {mutation.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                แก้ไขแล้ว
              </Button>
              <Button
                disabled={!online || mutation.isPending}
                onClick={() => mutation.mutate("dismissed")}
                variant="outline"
              >
                ปิดโดยไม่ต้องแก้
              </Button>
            </div>
            {errorCode ? (
              <p className="text-sm text-[#8C1D18]" role="alert">
                {errorCode === "NETWORK"
                  ? "บันทึกไม่สำเร็จ เพราะเชื่อมต่อไม่ได้ ลองอีกครั้ง"
                  : errorCode === "INVALID_STATUS_TRANSITION"
                    ? "รายงานนี้ปิดไปแล้ว โหลดข้อมูลล่าสุดแล้ว"
                    : presentReviewError(errorCode).title}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
