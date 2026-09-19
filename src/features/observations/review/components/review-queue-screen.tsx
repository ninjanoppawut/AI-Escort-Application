"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Flag,
  ImageOff,
  Inbox,
  Loader2,
  LockOpen,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatClockTime } from "@/features/sessions/components/session-freshness";
import { cn } from "@/lib/utils";

import { formatCaptureTime } from "../../capture";
import { fetchObservationJson } from "../../client/request";
import { ObservationStatusBadge } from "../../components/observation-status-badge";
import { observationStatusSchema } from "../../contracts";
import { presentReviewError, reviewErrorCodeOf } from "../client";
import {
  QUEUE_FILTERS,
  QUEUE_FILTER_LABELS,
  reviewQueueViewSchema,
  revisionQueryKeys,
  type QueueFilter,
  type ReviewQueueView,
} from "../revision-contracts";

const PAGE_SIZE = 20;

function fetchQueue(
  classId: string,
  filter: QueueFilter,
  cursor: ReviewQueueView["nextCursor"],
) {
  const query = new URLSearchParams({
    classId,
    filter,
    limit: String(PAGE_SIZE),
  });
  if (cursor) {
    query.set("cursorSubmittedAt", cursor.submittedAt);
    query.set("cursorId", cursor.observationId);
  }
  return fetchObservationJson(
    `/api/reviews?${query.toString()}`,
    reviewQueueViewSchema,
  );
}

const COUNT_KEYS: Partial<
  Record<QueueFilter, keyof ReviewQueueView["counts"]>
> = {
  pending: "pending",
  resubmitted: "resubmitted",
  same_species: "sameSpecies",
  revision_required: "revisionRequired",
  verified: "verified",
};

/**
 * Teacher review queue (design T-11, API_AND_REALTIME.md §22): submitted and
 * resubmitted work oldest first, with filter chips, counts, and cursor
 * pagination. Each card opens the review detail.
 */
export function ReviewQueueScreen({ classId }: { classId: string }) {
  const [filter, setFilter] = useState<QueueFilter>("pending");
  const queue = useInfiniteQuery({
    queryKey: revisionQueryKeys.queue(classId, filter, null),
    queryFn: ({ pageParam }) => fetchQueue(classId, filter, pageParam),
    initialPageParam: null as ReviewQueueView["nextCursor"],
    getNextPageParam: (last) => last.nextCursor,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });
  const pages = queue.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const counts = pages[0]?.counts;
  const errorCode = queue.isError ? reviewErrorCodeOf(queue.error) : null;

  return (
    <main className="bg-background min-h-dvh">
      <div className="mx-auto grid w-full max-w-4xl content-start gap-4 px-4 pt-4 pb-8 sm:px-8">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับชั้นเรียน"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href="/teacher/classes"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">คิวตรวจการสังเกต</h1>
            <p className="text-muted-foreground text-sm">
              รายการที่ส่งก่อนอยู่บนสุด
            </p>
          </div>
        </header>

        <div
          aria-label="กรองรายการ"
          className="flex flex-wrap gap-2"
          role="group"
        >
          {QUEUE_FILTERS.map((option) => {
            const countKey = COUNT_KEYS[option];
            const count = countKey && counts ? counts[countKey] : null;
            return (
              <button
                aria-pressed={filter === option}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm font-semibold",
                  filter === option
                    ? "border-[#1F5C3A] bg-[#1F5C3A] text-white"
                    : "border-border bg-card",
                )}
                key={option}
                onClick={() => setFilter(option)}
                type="button"
              >
                {QUEUE_FILTER_LABELS[option]}
                {count !== null ? ` · ${count}` : ""}
              </button>
            );
          })}
        </div>

        <p
          className="text-muted-foreground flex items-center gap-1.5 text-[13px]"
          role="status"
        >
          <RefreshCw
            aria-hidden="true"
            className={queue.isFetching ? "size-3.5 animate-spin" : "size-3.5"}
          />
          {queue.isFetching ? (
            "กำลังอัปเดต..."
          ) : pages[0] ? (
            <span suppressHydrationWarning>
              อัปเดตล่าสุด {formatClockTime(pages[0].refreshedAt)}
            </span>
          ) : null}
        </p>

        {errorCode ? (
          <section
            className="border-border bg-card rounded-xl border p-4"
            data-error-code={errorCode}
            role="alert"
          >
            <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
            <p className="mt-2 font-semibold">
              {errorCode === "NETWORK"
                ? "โหลดคิวตรวจไม่สำเร็จ"
                : presentReviewError(errorCode).title}
            </p>
            {errorCode === "NETWORK" ? (
              <Button
                className="mt-3"
                disabled={queue.isFetching}
                onClick={() => void queue.refetch()}
                variant="outline"
              >
                ลองใหม่
              </Button>
            ) : null}
          </section>
        ) : null}

        {queue.isPending ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            กำลังโหลดคิวตรวจ...
          </p>
        ) : null}

        {!queue.isPending && !errorCode && items.length === 0 ? (
          <section
            className="border-border bg-card grid place-items-center gap-2 rounded-xl border p-8 text-center"
            data-queue-empty=""
          >
            <Inbox
              aria-hidden="true"
              className="text-muted-foreground size-8"
            />
            <p className="font-semibold">ไม่มีรายการในหมวดนี้</p>
            <p className="text-muted-foreground text-sm">
              รายการใหม่จะขึ้นที่นี่เมื่อนักเรียนส่ง
            </p>
          </section>
        ) : null}

        {items.length > 0 ? (
          <ul className="grid gap-2" data-queue-list="">
            {items.map((item) => {
              const status = observationStatusSchema.safeParse(item.status);
              return (
                <li key={item.observationId}>
                  <Link
                    className="border-border bg-card hover:bg-secondary flex items-center gap-3 rounded-xl border p-3"
                    data-queue-item={item.observationId}
                    href={`/teacher/reviews/${item.observationId}`}
                  >
                    {item.thumbnailUrl ? (
                      // Signed private-bucket URLs expire; next/image would cache them.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="size-16 shrink-0 rounded-[10px] object-cover"
                        src={item.thumbnailUrl}
                      />
                    ) : (
                      <span className="bg-muted text-muted-foreground grid size-16 shrink-0 place-items-center rounded-[10px]">
                        <ImageOff aria-hidden="true" className="size-5" />
                      </span>
                    )}
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="truncate font-semibold">
                        {item.commonName}{" "}
                        <i className="font-serif font-normal" lang="la">
                          {item.scientificName}
                        </i>
                      </span>
                      <span className="text-muted-foreground truncate text-[13px]">
                        {item.studentName ?? "นักเรียน"}
                        {item.groupName ? ` · ${item.groupName}` : ""} ·{" "}
                        {item.sessionTitle} · ฉบับที่ {item.submissionNumber} ·{" "}
                        <span suppressHydrationWarning>
                          {formatCaptureTime(item.latestSubmittedAt)}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {status.success ? (
                          <ObservationStatusBadge status={status.data} />
                        ) : null}
                        {item.sameSpeciesInSession ? (
                          <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#E8C58A] bg-[#FFF6E5] px-2 text-[12px] font-medium text-[#5C3A04]">
                            <Copy aria-hidden="true" className="size-3" />
                            ชนิดซ้ำ
                          </span>
                        ) : null}
                        {item.pendingUnlockRequest ? (
                          <span className="inline-flex items-center gap-1 rounded-[6px] border px-2 text-[12px] font-medium">
                            <LockOpen aria-hidden="true" className="size-3" />
                            ขอแก้เพิ่ม
                          </span>
                        ) : null}
                        {item.openReportCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#F2B8B5] bg-[#FDECEA] px-2 text-[12px] font-medium text-[#8C1D18]">
                            <Flag aria-hidden="true" className="size-3" />
                            รายงาน {item.openReportCount}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="text-muted-foreground size-5 shrink-0"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        {queue.hasNextPage ? (
          <Button
            disabled={queue.isFetchingNextPage}
            onClick={() => void queue.fetchNextPage()}
            variant="outline"
          >
            {queue.isFetchingNextPage ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            โหลดเพิ่ม
          </Button>
        ) : null}
      </div>
    </main>
  );
}
