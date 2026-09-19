"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { adminErrorOf, adminGet } from "../client";
import {
  FLOW_LABELS,
  flowHealthReportSchema,
  operationsKeys,
  type FlowHealth,
  type FlowHealthReport,
} from "../operations-contracts";
import { AdminListStatus, FilterChips } from "./admin-list-states";

const WINDOW_OPTIONS = [
  { value: "1", label: "1 ชั่วโมง" },
  { value: "24", label: "24 ชั่วโมง" },
  { value: "168", label: "7 วัน" },
] as const;

type WindowOption = (typeof WINDOW_OPTIONS)[number]["value"];

const timeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

function formatAge(seconds: number) {
  if (seconds < 60) return `${seconds} วินาที`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} นาที`;
  return `${Math.floor(seconds / 3600)} ชั่วโมง`;
}

type FlowState = "ok" | "errors" | "critical" | "partial";

export function flowStateOf(flow: FlowHealth): FlowState {
  if (flow.telemetry === "unavailable") return "partial";
  if (flow.criticalCount > 0) return "critical";
  if (flow.errorCount > 0) return "errors";
  return "ok";
}

const FLOW_STATE_COPY: Record<
  FlowState,
  { label: string; className: string; Icon: typeof CircleCheck }
> = {
  ok: {
    label: "ไม่พบข้อผิดพลาด",
    className: "border-[#9CC5AE] bg-[#EAF4EE] text-[#14472F]",
    Icon: CircleCheck,
  },
  errors: {
    label: "มีคำเตือน",
    className: "border-[#E8C58A] bg-[#FFF6E5] text-[#5C3A04]",
    Icon: TriangleAlert,
  },
  critical: {
    label: "มีข้อผิดพลาด",
    className: "border-[#F2B8B5] bg-[#FDECEA] text-[#8C1D18]",
    Icon: CircleAlert,
  },
  partial: {
    label: "ไม่มีข้อมูลจากเซิร์ฟเวอร์",
    className: "border-border bg-muted text-foreground",
    Icon: CircleDashed,
  },
};

/**
 * S-admin System health (ADM-006/ADM-007): which flow and stage is failing,
 * queue age and backlog, and when the numbers were read. Request volume and
 * latency are not recorded yet, so the page says the telemetry is partial
 * instead of implying health.
 */
export function HealthScreen() {
  const [windowHours, setWindowHours] = useState<WindowOption>("24");
  const hours = Number(windowHours);
  const query = useQuery({
    queryKey: operationsKeys.health(hours),
    queryFn: () =>
      adminGet(`/api/admin/flow-health?hours=${hours}`, flowHealthReportSchema),
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips
          label="ช่วงเวลา"
          onChange={setWindowHours}
          options={WINDOW_OPTIONS}
          value={windowHours}
        />
        <Button
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          size="lg"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          โหลดใหม่
        </Button>
      </div>
      {query.data ? (
        <HealthReport report={query.data} stale={query.isError} />
      ) : (
        <AdminListStatus
          empty={false}
          emptyText=""
          error={query.isError ? adminErrorOf(query.error) : null}
          onRestart={() => void query.refetch()}
          onRetry={() => void query.refetch()}
          pending={query.isPending}
        />
      )}
    </div>
  );
}

function HealthReport({
  report,
  stale,
}: {
  report: FlowHealthReport;
  stale: boolean;
}) {
  const exportQueue = report.queues.export;
  const upload = report.queues.upload;
  return (
    <div className="grid gap-4">
      <p
        className="text-muted-foreground text-sm"
        data-health-fresh={report.freshAt}
        role="status"
      >
        ข้อมูล ณ {timeFormatter.format(new Date(report.freshAt))}
        {stale ? " · โหลดล่าสุดไม่สำเร็จ แสดงข้อมูลเดิม" : ""}
      </p>
      <p className="border-border bg-card rounded-xl border border-dashed p-3 text-sm leading-6">
        ข้อมูลบางส่วน · ระบบยังไม่เก็บจำนวนคำขอและเวลาตอบสนอง
        จึงแสดงเฉพาะข้อผิดพลาดที่บันทึกไว้ คิว และรอบสำรวจ
      </p>

      <section aria-labelledby="flows-title" className="grid gap-2">
        <h2 className="font-semibold" id="flows-title">
          ขั้นตอนการใช้งาน
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {report.flows.map((flow) => {
            const state = flowStateOf(flow);
            const copy = FLOW_STATE_COPY[state];
            return (
              <li
                className="border-border bg-card grid gap-2 rounded-xl border p-3 text-sm"
                data-flow={flow.flow}
                data-flow-state={state}
                key={flow.flow}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {FLOW_LABELS[flow.flow] ?? flow.flow}
                  </span>
                  <span
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium ${copy.className}`}
                  >
                    <copy.Icon aria-hidden="true" className="size-3.5" />
                    {copy.label}
                  </span>
                </div>
                {state === "partial" ? (
                  <p className="text-muted-foreground text-[13px]">
                    {flow.flow === "ai"
                      ? "AI ยังไม่เปิดใช้"
                      : "สถานะการเชื่อมต่อวัดได้จากเครื่องผู้ใช้เท่านั้น"}
                  </p>
                ) : (
                  <p className="text-[13px]">
                    ข้อผิดพลาด {flow.errorCount} ครั้ง
                    {flow.topErrorCodes.length > 0
                      ? ` · ${flow.topErrorCodes
                          .map(
                            (top) => `${top.stage}/${top.code} ×${top.count}`,
                          )
                          .join(", ")}`
                      : ""}
                  </p>
                )}
                {flow.errorCount > 0 ? (
                  <Link
                    className="min-h-11 content-center text-[13px] font-semibold text-[#1F5C3A] underline"
                    href={`/admin/errors?flow=${flow.flow}`}
                  >
                    ดูข้อผิดพลาดของขั้นตอนนี้
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="queues-title" className="grid gap-2">
        <h2 className="font-semibold" id="queues-title">
          คิวและงานเบื้องหลัง
        </h2>
        <ul className="grid gap-2 sm:grid-cols-3">
          <li
            className="border-border bg-card grid gap-1 rounded-xl border p-3 text-sm"
            data-queue="export"
            data-queue-state={
              exportQueue.stuckRunning > 0 ||
              exportQueue.oldestQueuedAgeSeconds > 900
                ? "degraded"
                : "ok"
            }
          >
            <span className="font-semibold">ส่งออกข้อมูล</span>
            <span>
              รอ {exportQueue.queued} · กำลังทำ {exportQueue.running}
              {exportQueue.queued > 0
                ? ` · รอนานสุด ${formatAge(exportQueue.oldestQueuedAgeSeconds)}`
                : ""}
            </span>
            <span className="text-muted-foreground text-[13px]">
              ค้างเกิน 15 นาที {exportQueue.stuckRunning} · ล้มเหลว{" "}
              {exportQueue.failedInWindow} · สำเร็จ {exportQueue.readyInWindow}
            </span>
          </li>
          <li
            className="border-border bg-card grid gap-1 rounded-xl border p-3 text-sm"
            data-queue="upload"
            data-queue-state={upload.stalePending > 0 ? "degraded" : "ok"}
          >
            <span className="font-semibold">อัปโหลดภาพ</span>
            <span>
              ยังไม่เสร็จ {upload.pending} · ค้างเกิน 30 นาที{" "}
              {upload.stalePending}
            </span>
            <span className="text-muted-foreground text-[13px]">
              อัปโหลดสำเร็จ {upload.uploadedInWindow}
            </span>
          </li>
          <li
            className="border-border bg-card grid gap-1 rounded-xl border p-3 text-sm"
            data-queue="ai"
            data-queue-state="partial"
          >
            <span className="font-semibold">AI วิเคราะห์</span>
            <span>ยังไม่เปิดใช้ · ใช้การกรอกเองแทน</span>
          </li>
        </ul>
      </section>

      <p className="text-sm" data-sessions="">
        รอบสำรวจที่เปิดอยู่ {report.sessions.open} · หยุดชั่วคราว{" "}
        {report.sessions.paused}
      </p>
    </div>
  );
}
