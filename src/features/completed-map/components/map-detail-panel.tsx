"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Copy,
  Flag,
  ImageOff,
  Link2,
  Loader2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import {
  formatCaptureTime,
  formatCoordinate,
} from "@/features/observations/capture";
import { fetchObservationJson } from "@/features/observations/client/request";
import { ObservationStatusBadge } from "@/features/observations/components/observation-status-badge";
import { observationStatusSchema } from "@/features/observations/contracts";
import { MEDIA_CATEGORY_LABELS } from "@/features/observations/media/contracts";
import {
  presentReviewError,
  reviewErrorCodeOf,
} from "@/features/observations/review/client";
import { ReportIssueSheet } from "@/features/observations/review/components/report-issue-sheet";
import { TRAIT_MODE_LABELS } from "@/features/observations/review/review-form";

import { completedMapQueryKeys, mapDetailViewSchema } from "../contracts";

function traitCounts(traits: unknown[]) {
  const counts = { value: 0, unsure: 0, notVisible: 0 };
  for (const trait of traits) {
    if (!trait || typeof trait !== "object") continue;
    const status = (trait as { status?: unknown }).status;
    if (status === "unsure") counts.unsure += 1;
    else if (status === "not_visible") counts.notVisible += 1;
    else counts.value += 1;
  }
  return counts;
}

/**
 * Plant detail on the completed map (MAP-005, designs S-26/T-16): teacher-
 * verified name first, then the student's values; the recorder, capture
 * location, and permitted images. It opens as a bottom sheet over the lower
 * part of the map on phones and beside the map on wide screens, so the map
 * context stays. Peers may report a record; its owner never learns who did.
 */
export function MapDetailPanel({
  observationId,
  onClose,
}: {
  observationId: string;
  onClose: () => void;
}) {
  const [reporting, setReporting] = useState(false);
  const detailQuery = useQuery({
    queryKey: completedMapQueryKeys.detail(observationId),
    queryFn: () =>
      fetchObservationJson(
        `/api/observations/${observationId}/map-detail`,
        mapDetailViewSchema,
      ),
    retry: false,
  });
  const detail = detailQuery.data;
  const status = detail
    ? observationStatusSchema.safeParse(detail.status)
    : null;
  const counts = detail ? traitCounts(detail.student.traits) : null;

  return (
    <aside
      aria-label="รายละเอียดพืช"
      className="bg-card border-border fixed inset-x-0 bottom-0 z-40 max-h-[60dvh] overflow-y-auto rounded-t-[20px] border-t p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(22,33,28,.14)] lg:sticky lg:top-4 lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:rounded-xl lg:border lg:shadow-none"
      data-map-detail={observationId}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {detail ? (
            <>
              <h2 className="text-lg font-semibold break-words">
                {detail.verified?.commonName ?? detail.student.commonName}
              </h2>
              <p className="font-serif text-sm italic" lang="la">
                {detail.verified?.scientificName ??
                  detail.student.scientificName}
              </p>
            </>
          ) : (
            <h2 className="text-lg font-semibold">รายละเอียดพืช</h2>
          )}
        </div>
        <button
          aria-label="ปิดรายละเอียด"
          className="border-border grid size-11 shrink-0 place-items-center rounded-full border"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      {detailQuery.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          กำลังโหลดรายละเอียด...
        </p>
      ) : null}
      {detailQuery.isError ? (
        <div className="mt-3 grid gap-2 text-sm" role="alert">
          <p>
            {reviewErrorCodeOf(detailQuery.error) === "NETWORK"
              ? "โหลดรายละเอียดไม่สำเร็จ"
              : presentReviewError(reviewErrorCodeOf(detailQuery.error)).title}
          </p>
          <Button onClick={() => void detailQuery.refetch()} variant="outline">
            ลองใหม่
          </Button>
        </div>
      ) : null}

      {detail ? (
        <div className="mt-3 grid gap-3 text-sm leading-6">
          {status?.success ? (
            <ObservationStatusBadge status={status.data} />
          ) : null}

          {detail.media.length > 0 ? (
            <ul
              aria-label={`ภาพหลักฐาน ${detail.media.length} ภาพ`}
              className="flex snap-x gap-2 overflow-x-auto"
            >
              {detail.media.map((media) => (
                <li className="w-40 shrink-0 snap-start" key={media.mediaId}>
                  {media.signedUrl ? (
                    // Signed private-bucket URLs expire; next/image would cache them.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={`ภาพที่ ${media.position} · ${MEDIA_CATEGORY_LABELS[media.category]}`}
                      className="aspect-[3/4] w-full rounded-[10px] object-cover"
                      loading="lazy"
                      src={media.signedUrl}
                    />
                  ) : (
                    <div className="bg-muted text-muted-foreground grid aspect-[3/4] place-items-center rounded-[10px] p-2 text-center text-[13px]">
                      <ImageOff aria-hidden="true" className="size-5" />
                      ภาพนี้ดูไม่ได้
                    </div>
                  )}
                  <p className="text-[13px]">
                    {MEDIA_CATEGORY_LABELS[media.category]}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          {detail.verified ? (
            <p className="flex items-start gap-2 rounded-[10px] bg-[#EEF7F1] p-2 text-[#16432A]">
              <BadgeCheck aria-hidden="true" className="mt-1 size-4 shrink-0" />
              <span>
                ชื่อที่ครูรับรองแล้ว
                {detail.verified.teacherName
                  ? ` · รับรองโดย ${detail.verified.teacherName}`
                  : ""}
                {detail.verified.verifiedAt ? (
                  <span suppressHydrationWarning>
                    {" "}
                    · {formatCaptureTime(detail.verified.verifiedAt)}
                  </span>
                ) : null}
              </span>
            </p>
          ) : null}

          <dl className="grid gap-2">
            <div>
              <dt className="text-muted-foreground text-[13px]">
                นักเรียนบันทึก
              </dt>
              <dd>
                {detail.student.commonName} ·{" "}
                <i className="font-serif" lang="la">
                  {detail.student.scientificName}
                </i>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[13px]">บันทึกโดย</dt>
              <dd>
                {detail.recorder.name ?? "นักเรียน"}
                {detail.recorder.groupName
                  ? ` · ${detail.recorder.groupName}`
                  : ""}
                {" · "}
                <span suppressHydrationWarning>
                  {formatCaptureTime(detail.capture.capturedAt)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[13px]">ตำแหน่ง</dt>
              <dd className="font-mono">
                {detail.capture.lat !== null && detail.capture.lng !== null
                  ? `${formatCoordinate(detail.capture.lat)}, ${formatCoordinate(detail.capture.lng)}${
                      detail.capture.accuracyM !== null
                        ? ` · ±${Math.round(detail.capture.accuracyM)} ม.`
                        : ""
                    }`
                  : "⚑ ไม่มีพิกัด"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[13px]">
                เหตุผลประกอบ
              </dt>
              <dd className="whitespace-pre-line">
                {detail.student.evidenceNote}
              </dd>
            </div>
            {counts ? (
              <div>
                <dt className="text-muted-foreground text-[13px]">
                  นักเรียนตรวจลักษณะ
                </dt>
                <dd className="flex flex-wrap gap-x-3">
                  <span>
                    {TRAIT_MODE_LABELS.value} {counts.value}
                  </span>
                  <span>
                    {TRAIT_MODE_LABELS.unsure} {counts.unsure}
                  </span>
                  <span>
                    {TRAIT_MODE_LABELS.not_visible} {counts.notVisible}
                  </span>
                </dd>
              </div>
            ) : null}
            {detail.feedback ? (
              <div>
                <dt className="text-muted-foreground text-[13px]">
                  ความเห็นครู
                </dt>
                <dd className="whitespace-pre-line">“{detail.feedback}”</dd>
              </div>
            ) : null}
          </dl>

          {detail.relations.sameSpeciesInSession ||
          (detail.relations.possibleSameSpecimenCount ?? 0) > 0 ? (
            <p className="flex flex-wrap gap-2">
              {detail.relations.sameSpeciesInSession ? (
                <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#E8C58A] bg-[#FFF6E5] px-2 text-[13px] text-[#5C3A04]">
                  <Copy aria-hidden="true" className="size-3.5" />
                  ชนิดซ้ำในรอบนี้ {detail.relations.sameSpeciesCount}
                </span>
              ) : null}
              {(detail.relations.possibleSameSpecimenCount ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#C9B8EC] bg-[#F3EEFC] px-2 text-[13px] text-[#3E2379]">
                  <Link2 aria-hidden="true" className="size-3.5" />
                  อาจเป็นต้นเดียวกัน{" "}
                  {detail.relations.possibleSameSpecimenCount}
                </span>
              ) : null}
            </p>
          ) : null}

          <div className="grid gap-2">
            {detail.viewer.role === "teacher" ? (
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1F5C3A] px-5 font-semibold text-white"
                href={`/teacher/reviews/${detail.observationId}`}
              >
                เปิดหน้าตรวจ
              </Link>
            ) : null}
            {detail.viewer.isOwner ? (
              <Link
                className="border-border inline-flex min-h-11 items-center justify-center rounded-full border px-5 font-semibold"
                href={`/observations/${detail.observationId}`}
              >
                ดูรายการของฉัน
              </Link>
            ) : null}
            {detail.viewer.canReport ? (
              <Button onClick={() => setReporting(true)} variant="outline">
                <Flag aria-hidden="true" className="size-4" />
                รายงานปัญหา
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {reporting ? (
        <ReportIssueSheet
          observationId={observationId}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </aside>
  );
}
