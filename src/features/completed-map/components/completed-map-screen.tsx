"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Flag,
  Info,
  List,
  Map as MapIcon,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatClockTime } from "@/features/sessions/components/session-freshness";
import { cn } from "@/lib/utils";

import { formatCaptureTime } from "@/features/observations/capture";
import { fetchObservationJson } from "@/features/observations/client/request";
import { ObservationStatusBadge } from "@/features/observations/components/observation-status-badge";
import { observationStatusSchema } from "@/features/observations/contracts";
import {
  presentReviewError,
  reviewErrorCodeOf,
} from "@/features/observations/review/client";
import { isReviewUiErrorCode } from "@/features/observations/review/errors";

import {
  completedMapQueryKeys,
  completedMapViewSchema,
  type AvailableCompletedMap,
  type CompletedMapItem,
  type CompletedMapView,
} from "../contracts";
import { CompletedMapSketch } from "./completed-map-sketch";
import { MapDetailPanel } from "./map-detail-panel";

type Filter =
  "all" | "verified" | "pending" | "revision" | "unable" | "rejected" | "mine";

const FILTER_LABELS: Record<Filter, string> = {
  all: "ทั้งหมด",
  verified: "✓ รับรองแล้ว",
  pending: "↑ รอตรวจ",
  revision: "! ต้องแก้ไข",
  unable: "? ยืนยันไม่ได้",
  rejected: "ไม่รับ",
  mine: "ของฉัน",
};

const PENDING = new Set(["submitted", "resubmitted", "teacher_review"]);

function matches(filter: Filter, item: CompletedMapItem) {
  switch (filter) {
    case "all":
      return true;
    case "verified":
      return item.status === "verified";
    case "pending":
      return PENDING.has(item.status);
    case "revision":
      return item.status === "revision_required";
    case "unable":
      return item.status === "unable_to_verify";
    case "rejected":
      return item.status === "rejected";
    case "mine":
      return item.isMine;
  }
}

function StatusBadge({ status }: { status: string }) {
  const parsed = observationStatusSchema.safeParse(status);
  return parsed.success ? (
    <ObservationStatusBadge status={parsed.data} />
  ) : null;
}

/**
 * The completed activity map (MAP-003 to MAP-006, designs S-25/T-15): plant
 * markers at their capture locations with status shape, icon, and label; a
 * list view with the same records; and the plant detail beside or over the
 * map so the map context stays in view. Map tiles are not configured, so the
 * coordinate sketch and the list carry the map (D-005 adapter fallback).
 */
export function CompletedMapScreen({
  sessionId,
  initialMap,
  initialErrorCode,
}: {
  sessionId: string;
  initialMap: CompletedMapView | null;
  initialErrorCode: string | null;
}) {
  const mapQuery = useQuery({
    queryKey: completedMapQueryKeys.map(sessionId),
    queryFn: () =>
      fetchObservationJson(
        `/api/sessions/${sessionId}/map`,
        completedMapViewSchema,
      ),
    ...(initialMap ? { initialData: initialMap } : {}),
    enabled: initialMap !== null,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });
  const map = mapQuery.data;

  if (!map) {
    const code = initialErrorCode ?? "FORBIDDEN";
    const presentation = presentReviewError(
      isReviewUiErrorCode(code) ? code : "FORBIDDEN",
    );
    return (
      <main className="bg-background min-h-dvh px-4 pt-5">
        <section
          className="border-border bg-card mx-auto max-w-[480px] rounded-xl border p-4"
          data-error-code={code}
          role="alert"
        >
          <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
          <h1 className="mt-2 font-semibold">{presentation.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            แผนที่ผลลัพธ์เปิดได้เฉพาะครูของชั้นเรียนและนักเรียนที่ร่วมรอบสำรวจนี้
          </p>
          <Link
            className="border-border bg-background mt-3 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
            href="/app"
          >
            กลับหน้าหลัก
          </Link>
        </section>
      </main>
    );
  }

  if (!map.available) {
    return (
      <main className="bg-background min-h-dvh px-4 pt-5">
        <section
          className="border-border bg-card mx-auto grid max-w-[480px] gap-2 rounded-xl border p-4"
          data-map-available="false"
          role="status"
        >
          <h1 className="font-semibold">แผนที่ผลลัพธ์ยังไม่เปิด</h1>
          <p className="text-muted-foreground text-sm leading-6">
            แผนที่ของ “{map.session.title}” เปิดเมื่อครูจบรอบสำรวจ
          </p>
          <Link
            className="border-border bg-background inline-flex min-h-11 w-fit items-center rounded-full border px-5 text-sm font-semibold"
            href="/app"
          >
            กลับหน้าหลัก
          </Link>
        </section>
      </main>
    );
  }

  return (
    <AvailableMap
      isFetching={mapQuery.isFetching}
      isError={mapQuery.isError}
      map={map}
      onRetry={() => void mapQuery.refetch()}
      retryErrorCode={
        mapQuery.isError ? reviewErrorCodeOf(mapQuery.error) : null
      }
    />
  );
}

function AvailableMap({
  map,
  isFetching,
  isError,
  retryErrorCode,
  onRetry,
}: {
  map: AvailableCompletedMap;
  isFetching: boolean;
  isError: boolean;
  retryErrorCode: string | null;
  onRetry: () => void;
}) {
  const teacher = map.viewerRole === "teacher";
  const [view, setView] = useState<"map" | "list">("map");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filters: Filter[] = teacher
    ? ["all", "verified", "pending", "revision", "unable", "rejected"]
    : ["all", "verified", "pending", "revision", "mine"];
  const visible = map.items.filter((item) => matches(filter, item));
  const located = map.items.filter(
    (item) => item.lat !== null && item.lng !== null,
  );
  const unlocated = visible.filter(
    (item) => item.lat === null || item.lng === null,
  );
  const backHref = teacher
    ? `/teacher/classes/${map.classId}/sessions`
    : "/app";

  return (
    <main className="bg-background min-h-dvh">
      <div
        className={cn(
          "mx-auto grid w-full grid-cols-[minmax(0,1fr)] content-start gap-4 px-4 pt-4 pb-8",
          teacher ? "max-w-6xl sm:px-8" : "max-w-[480px] lg:max-w-6xl",
        )}
      >
        <header className="flex items-center gap-3">
          <Link
            aria-label="ย้อนกลับ"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={backHref}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold">
              {teacher ? "ผลการสำรวจ" : "พรรณไม้ที่สำรวจได้"}
            </h1>
            <p className="text-muted-foreground truncate text-sm">
              {map.activity?.title ?? map.session.title} ·{" "}
              {map.session.completedAt ? (
                <span suppressHydrationWarning>
                  จบเมื่อ {formatCaptureTime(map.session.completedAt)}
                </span>
              ) : (
                "ยังไม่จบรอบ"
              )}{" "}
              · {map.total} การสังเกต
            </p>
          </div>
        </header>

        <p className="text-muted-foreground flex items-start gap-2 text-[13px] leading-5">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {teacher
            ? "หมุดอยู่ที่ตำแหน่งจับภาพ · ไม่แสดงตำแหน่งสดหรือเส้นทางเดินย้อนหลัง"
            : "ภาพและชื่อผู้บันทึกเห็นได้เฉพาะครูและผู้ร่วมรอบสำรวจนี้ · หมุดอยู่ที่ตำแหน่งจับภาพ · ไม่แสดงเส้นทางเดินย้อนหลัง"}
        </p>

        {teacher && (map.pendingReviewCount ?? 0) > 0 ? (
          <Link
            className="flex items-start gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            data-pending-review=""
            href={`/teacher/classes/${map.classId}/reviews`}
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            ยังมี {map.pendingReviewCount} รายการรอตรวจ · ไปคิวตรวจ
          </Link>
        ) : null}

        {map.truncated ? (
          <p className="text-sm" role="status">
            แสดง {map.items.length} จาก {map.total} รายการแรก
          </p>
        ) : null}

        <p
          className="text-muted-foreground flex items-center gap-1.5 text-[13px]"
          role="status"
        >
          <RefreshCw
            aria-hidden="true"
            className={isFetching ? "size-3.5 animate-spin" : "size-3.5"}
          />
          {isFetching ? (
            "กำลังอัปเดต..."
          ) : (
            <span suppressHydrationWarning>
              อัปเดตล่าสุด {formatClockTime(map.refreshedAt)}
            </span>
          )}
        </p>
        {isError ? (
          <section
            className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
            data-error-code={retryErrorCode ?? "NETWORK"}
            role="alert"
          >
            <span>อัปเดตไม่สำเร็จ · กำลังแสดงข้อมูลล่าสุดที่โหลดได้</span>
            <Button onClick={onRetry} variant="outline">
              ลองใหม่
            </Button>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div aria-label="มุมมอง" className="flex gap-1" role="group">
            <button
              aria-pressed={view === "map"}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold",
                view === "map"
                  ? "border-[#1F5C3A] bg-[#1F5C3A] text-white"
                  : "border-border bg-card",
              )}
              onClick={() => setView("map")}
              type="button"
            >
              <MapIcon aria-hidden="true" className="size-4" />
              แผนที่
            </button>
            <button
              aria-pressed={view === "list"}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold",
                view === "list"
                  ? "border-[#1F5C3A] bg-[#1F5C3A] text-white"
                  : "border-border bg-card",
              )}
              onClick={() => setView("list")}
              type="button"
            >
              <List aria-hidden="true" className="size-4" />
              รายการ
            </button>
          </div>
        </div>

        <div
          aria-label="กรองสถานะ"
          className="flex flex-wrap gap-2"
          role="group"
        >
          {filters.map((option) => {
            const count = map.items.filter((item) =>
              matches(option, item),
            ).length;
            return (
              <button
                aria-pressed={filter === option}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm font-semibold",
                  filter === option
                    ? "border-[#1F5C3A] bg-[#E6F2EA] text-[#16432A]"
                    : "border-border bg-card",
                )}
                key={option}
                onClick={() => setFilter(option)}
                type="button"
              >
                {FILTER_LABELS[option]} {count}
              </button>
            );
          })}
        </div>

        {map.items.length === 0 ? (
          <section
            className="border-border bg-card rounded-xl border p-6 text-center"
            data-map-empty=""
          >
            <p className="font-semibold">ยังไม่มีการสังเกตในรอบนี้</p>
            <p className="text-muted-foreground mt-1 text-sm">
              รายการที่ส่งให้ครูแล้วจะขึ้นบนแผนที่นี้
            </p>
          </section>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <div className="grid gap-3">
              {view === "map" ? (
                <CompletedMapSketch
                  boundary={map.boundary}
                  items={located}
                  onSelect={setSelectedId}
                  selectedId={selectedId}
                  visibleIds={
                    new Set(visible.map((item) => item.observationId))
                  }
                />
              ) : null}
              {view === "list" || unlocated.length > 0 ? (
                <section
                  aria-label={view === "list" ? "รายการพืช" : "ไม่มีพิกัด"}
                >
                  {view === "map" ? (
                    <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Flag aria-hidden="true" className="size-4" />
                      ไม่มีพิกัด ({unlocated.length}) · แสดงเป็นรายการ
                    </h2>
                  ) : null}
                  <ul className="grid gap-2" data-map-list={view}>
                    {(view === "list" ? visible : unlocated).map((item) => (
                      <li key={item.observationId}>
                        <button
                          aria-pressed={selectedId === item.observationId}
                          className={cn(
                            "border-border bg-card flex w-full items-center gap-3 rounded-xl border p-3 text-left",
                            selectedId === item.observationId &&
                              "ring-2 ring-[#1F5C3A]",
                          )}
                          data-map-list-item={item.observationId}
                          onClick={() => setSelectedId(item.observationId)}
                          type="button"
                        >
                          {item.thumbnailUrl ? (
                            // Signed private-bucket URLs expire; next/image would cache them.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt=""
                              className="size-14 shrink-0 rounded-[10px] object-cover"
                              src={item.thumbnailUrl}
                            />
                          ) : (
                            <span className="bg-muted size-14 shrink-0 rounded-[10px]" />
                          )}
                          <span className="grid min-w-0 flex-1 gap-1">
                            <span className="truncate font-semibold">
                              {item.commonName}{" "}
                              <i className="font-serif font-normal" lang="la">
                                {item.scientificName}
                              </i>
                            </span>
                            <span className="text-muted-foreground truncate text-[13px]">
                              {item.isMine ? "ของฉัน · " : ""}
                              บันทึกโดย {item.recorderName ?? "นักเรียน"}
                              {item.groupName ? ` · ${item.groupName}` : ""}
                              {item.lat === null ? " · ⚑ ไม่มีพิกัด" : ""}
                            </span>
                            <StatusBadge status={item.status} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
            {selectedId ? (
              <MapDetailPanel
                key={selectedId}
                observationId={selectedId}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <p className="text-muted-foreground hidden text-sm lg:block">
                แตะหมุดหรือรายการเพื่อดูรายละเอียดพืช
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
