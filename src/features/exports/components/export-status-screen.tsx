"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleAlert,
  Clock,
  Download,
  FileX,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

import { formatCaptureTime } from "@/features/observations/capture";
import {
  fetchObservationJson,
  sendObservationJson,
} from "@/features/observations/client/request";
import { presentReviewError } from "@/features/observations/review/client";
import { isReviewUiErrorCode } from "@/features/observations/review/errors";

import {
  EXPORT_STATUS_LABELS,
  exportQueryKeys,
  exportViewSchema,
  type ExportView,
} from "../contracts";

const STATUS_ICONS = {
  queued: Clock,
  running: Loader2,
  ready: Download,
  failed: CircleAlert,
  expired: FileX,
} as const;

/**
 * Export status (deep link of `export_ready`, module 09 states): queued,
 * running, ready with an authorized download, failed, or expired. A queued
 * export is generated once when this page opens; the notification tells the
 * teacher when a long one is ready, so nothing polls on a timer.
 */
export function ExportStatusScreen({
  exportId,
  initialExport,
  initialErrorCode,
}: {
  exportId: string;
  initialExport: ExportView | null;
  initialErrorCode: string | null;
}) {
  const queryClient = useQueryClient();
  const exportQuery = useQuery({
    queryKey: exportQueryKeys.detail(exportId),
    queryFn: () =>
      fetchObservationJson(`/api/exports/${exportId}`, exportViewSchema),
    ...(initialExport ? { initialData: initialExport } : {}),
    enabled: initialExport !== null,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const view = exportQuery.data;

  const process = useMutation({
    mutationFn: () =>
      sendObservationJson(
        "POST",
        `/api/exports/${exportId}/process`,
        {},
        exportViewSchema,
      ),
    onSuccess: (result) =>
      queryClient.setQueryData(exportQueryKeys.detail(exportId), result),
  });
  const started = useRef(false);
  useEffect(() => {
    if (view?.status !== "queued" || started.current) return;
    started.current = true;
    process.mutate();
  }, [process, view?.status]);

  if (!view) {
    const code = initialErrorCode ?? "FORBIDDEN";
    return (
      <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
        <section
          className="border-border bg-card mx-auto max-w-2xl rounded-xl border p-4"
          data-error-code={code}
          role="alert"
        >
          <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
          <h1 className="mt-2 font-semibold">
            {
              presentReviewError(isReviewUiErrorCode(code) ? code : "FORBIDDEN")
                .title
            }
          </h1>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            ไฟล์ส่งออกเปิดได้เฉพาะครูที่สร้างไฟล์และยังสอนชั้นเรียนนี้
          </p>
        </section>
      </main>
    );
  }

  const Icon = STATUS_ICONS[view.status];
  const scope = view.filters?.statuses?.includes("verified")
    ? "เฉพาะที่ครูยืนยันแล้ว"
    : "ทุกรายการที่ส่งแล้ว";

  return (
    <main className="bg-background min-h-dvh">
      <div className="mx-auto grid w-full max-w-2xl content-start gap-4 px-4 pt-4 pb-8 sm:px-8">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับแผนที่ผลลัพธ์"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={`/sessions/${view.sessionId}/map`}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">ไฟล์ส่งออก</h1>
        </header>
        <section
          className="border-border bg-card grid gap-2 rounded-xl border p-4 text-sm leading-6"
          data-export-status={view.status}
        >
          <p className="flex items-center gap-2 text-base font-semibold">
            <Icon
              aria-hidden="true"
              className={
                view.status === "running" ? "size-5 animate-spin" : "size-5"
              }
            />
            {EXPORT_STATUS_LABELS[view.status]}
          </p>
          <dl className="grid gap-1">
            <div>
              <dt className="text-muted-foreground inline">รอบสำรวจ: </dt>
              <dd className="inline">{view.sessionTitle ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground inline">ไฟล์: </dt>
              <dd className="inline">
                {view.type.toUpperCase()} · {scope} · schema{" "}
                {view.schemaVersion}
              </dd>
            </div>
            {view.rowCount !== null ? (
              <div>
                <dt className="text-muted-foreground inline">จำนวนแถว: </dt>
                <dd className="inline">{view.rowCount}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground inline">หมดอายุ: </dt>
              <dd className="inline" suppressHydrationWarning>
                {formatCaptureTime(view.expiresAt)}
              </dd>
            </div>
          </dl>
          {view.status === "ready" ? (
            <a
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#1F5C3A] px-5 font-semibold text-white"
              data-export-download=""
              href={`/api/exports/${view.id}/download`}
            >
              <Download aria-hidden="true" className="size-4" />
              ดาวน์โหลด
            </a>
          ) : null}
          {view.status === "queued" || view.status === "running" ? (
            <p className="text-muted-foreground" role="status">
              กำลังสร้างไฟล์ · ออกจากหน้านี้ได้ จะมีแจ้งเตือนเมื่อพร้อม
            </p>
          ) : null}
          {view.status === "failed" ? (
            <p role="alert">
              สร้างไฟล์ไม่สำเร็จ · กลับไปแผนที่ผลลัพธ์แล้วส่งออกใหม่
            </p>
          ) : null}
          {view.status === "expired" ? (
            <p>ไฟล์นี้หมดอายุแล้ว · ส่งออกใหม่จากแผนที่ผลลัพธ์</p>
          ) : null}
          {process.isError ? (
            <Button onClick={() => process.mutate()} variant="outline">
              ลองสร้างไฟล์อีกครั้ง
            </Button>
          ) : null}
        </section>
      </div>
    </main>
  );
}
