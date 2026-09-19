"use client";

import { useMutation } from "@tanstack/react-query";
import { Flag, History, Loader2, LockOpen, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatCaptureTime } from "../../capture";
import { sendObservationJson } from "../../client/request";
import { OBSERVATION_STATUS_LABELS } from "../../contracts";
import { presentReviewError, reviewErrorCodeOf } from "../client";
import {
  REPORT_TYPE_LABELS,
  REVIEW_DECISION_LABELS,
  REVISION_TOPIC_LABELS,
  unlockDecisionResponseSchema,
  type RevisionTopic,
  type TeacherReviewDetail,
  type UnlockRequestEntry,
} from "../revision-contracts";
import { TRAIT_LABELS } from "../review-form";

const REQUEST_STATUS_LABELS: Record<UnlockRequestEntry["status"], string> = {
  pending: "รอครูตัดสิน",
  granted: "อนุญาตแล้ว",
  denied: "ไม่อนุญาต",
  cancelled: "ปิดแล้ว (ส่งฉบับใหม่)",
};

const REPORT_STATUS_LABELS = {
  open: "ใหม่",
  reviewing: "กำลังตรวจ",
  resolved: "แก้ไขแล้ว",
  dismissed: "ปิดโดยไม่ต้องแก้",
} as const;

function topicList(keys: readonly string[]) {
  return keys
    .map((key) => REVISION_TOPIC_LABELS[key as RevisionTopic] ?? key)
    .join(" · ");
}

/**
 * Additional-topic requests ("ขอแก้เพิ่ม", D-048): a pending request is
 * granted for the requested topics the teacher keeps ticked, or denied.
 */
export function UnlockRequestsSection({
  review,
  online,
  highlightRequestId,
  onChanged,
}: {
  review: TeacherReviewDetail;
  online: boolean;
  highlightRequestId: string | null;
  onChanged: () => void;
}) {
  if (review.unlockRequests.length === 0) return null;
  return (
    <section
      aria-labelledby="unlock-requests-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
    >
      <h2
        className="flex items-center gap-2 font-semibold"
        id="unlock-requests-title"
      >
        <LockOpen aria-hidden="true" className="size-4" />
        คำขอแก้เพิ่มจากนักเรียน
      </h2>
      <ul className="grid gap-2">
        {review.unlockRequests.map((request) => (
          <UnlockRequestRow
            canDecide={
              request.status === "pending" &&
              review.status === "revision_required"
            }
            highlighted={request.id === highlightRequestId}
            key={request.id}
            observationId={review.observationId}
            onChanged={onChanged}
            online={online}
            request={request}
          />
        ))}
      </ul>
    </section>
  );
}

function UnlockRequestRow({
  observationId,
  request,
  canDecide,
  highlighted,
  online,
  onChanged,
}: {
  observationId: string;
  request: UnlockRequestEntry;
  canDecide: boolean;
  highlighted: boolean;
  online: boolean;
  onChanged: () => void;
}) {
  const id = useId();
  const rowRef = useRef<HTMLLIElement>(null);
  const [fields, setFields] = useState<string[]>(request.requestedFields);
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: (decision: "granted" | "denied") =>
      sendObservationJson(
        "POST",
        `/api/observations/${observationId}/unlock-request/${request.id}/decision`,
        {
          decision,
          fieldKeys: decision === "granted" ? fields : null,
          note,
        },
        unlockDecisionResponseSchema,
      ),
    onSettled: onChanged,
  });

  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView?.({ block: "center" });
  }, [highlighted]);

  const errorCode = mutation.isError ? reviewErrorCodeOf(mutation.error) : null;

  return (
    <li
      className={cn(
        "border-border grid gap-2 rounded-[10px] border p-3 text-sm",
        highlighted && "ring-2 ring-[#1F5C3A]",
      )}
      data-unlock-request={request.status}
      ref={rowRef}
    >
      <p className="font-medium">ขอแก้: {topicList(request.requestedFields)}</p>
      <p className="leading-6">เหตุผล: {request.reason}</p>
      <p className="text-muted-foreground text-[13px]">
        <span suppressHydrationWarning>
          {formatCaptureTime(request.createdAt)}
        </span>
        {" · "}
        {REQUEST_STATUS_LABELS[request.status]}
        {request.grantedFields
          ? ` · เปิด ${topicList(request.grantedFields)}`
          : ""}
        {request.decisionNote ? ` · ${request.decisionNote}` : ""}
      </p>
      {canDecide ? (
        <div className="grid gap-2">
          <fieldset className="grid gap-1.5">
            <legend className="text-[13px] font-medium">
              หัวข้อที่จะเปิดให้แก้
            </legend>
            {request.requestedFields.map((field) => (
              <label className="flex min-h-11 items-center gap-3" key={field}>
                <input
                  checked={fields.includes(field)}
                  className="size-5 accent-[#1F5C3A]"
                  onChange={(event) =>
                    setFields((current) =>
                      event.target.checked
                        ? [...current, field]
                        : current.filter((value) => value !== field),
                    )
                  }
                  type="checkbox"
                />
                {REVISION_TOPIC_LABELS[field]}
              </label>
            ))}
          </fieldset>
          <label className="text-[13px] font-medium" htmlFor={`${id}-note`}>
            ข้อความถึงนักเรียน (ถ้ามี)
          </label>
          <input
            className="border-border bg-background min-h-11 rounded-[10px] border px-3 text-base"
            id={`${id}-note`}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            type="text"
            value={note}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={!online || mutation.isPending || fields.length === 0}
              onClick={() => mutation.mutate("granted")}
            >
              {mutation.isPending ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <LockOpen aria-hidden="true" className="size-4" />
              )}
              อนุญาต
            </Button>
            <Button
              disabled={!online || mutation.isPending}
              onClick={() => mutation.mutate("denied")}
              variant="outline"
            >
              <X aria-hidden="true" className="size-4" />
              ไม่อนุญาต
            </Button>
          </div>
        </div>
      ) : null}
      {errorCode ? (
        <p className="text-[#8C1D18]" role="alert">
          {errorCode === "INVALID_STATUS_TRANSITION"
            ? "คำขอนี้ปิดไปแล้ว (ตัดสินแล้วหรือนักเรียนส่งฉบับใหม่) โหลดข้อมูลล่าสุดแล้ว"
            : errorCode === "NETWORK"
              ? "บันทึกไม่สำเร็จ เพราะเชื่อมต่อไม่ได้ ลองอีกครั้ง"
              : presentReviewError(errorCode).title}
        </p>
      ) : null}
    </li>
  );
}

/** Design T-16: every review and status step, newest first; nothing is overwritten. */
export function ReviewHistory({ review }: { review: TeacherReviewDetail }) {
  if (review.reviews.length === 0 && review.history.length === 0) return null;
  return (
    <section
      aria-labelledby="review-history-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
    >
      <h2
        className="flex items-center gap-2 font-semibold"
        id="review-history-title"
      >
        <History aria-hidden="true" className="size-4" />
        ประวัติการตรวจ
      </h2>
      {review.reviews.length > 0 ? (
        <ol className="grid gap-2" data-review-history="">
          {review.reviews.map((entry) => (
            <li
              className="border-border rounded-[10px] border p-3 text-sm leading-6"
              data-review-decision={entry.decision}
              key={entry.id}
            >
              <p className="font-medium">
                ฉบับที่ {entry.submissionNumber} ·{" "}
                {REVIEW_DECISION_LABELS[entry.decision]}
                <span className="text-muted-foreground font-normal">
                  {" · "}
                  {entry.reviewerName ?? "ครู"} ·{" "}
                  <span suppressHydrationWarning>
                    {formatCaptureTime(entry.reviewedAt)}
                  </span>
                </span>
              </p>
              {entry.verifiedCommonName ? (
                <p>
                  ครูยืนยัน: {entry.verifiedCommonName} ·{" "}
                  <i className="font-serif" lang="la">
                    {entry.verifiedScientificName}
                  </i>
                </p>
              ) : null}
              {Object.entries(entry.correctedTraits).map(([key, value]) => (
                <p key={key}>
                  แก้ลักษณะ {TRAIT_LABELS[key] ?? key}: “{value}”
                </p>
              ))}
              {entry.topics.length > 0 ? (
                <p>
                  หัวข้อที่เปิดให้แก้:{" "}
                  {topicList(entry.topics.map((topic) => topic.fieldKey))}
                </p>
              ) : null}
              {entry.feedback ? (
                <p className="whitespace-pre-line">“{entry.feedback}”</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
          สถานะทั้งหมด ({review.history.length})
        </summary>
        <ol className="text-muted-foreground mt-1 grid gap-1 text-[13px]">
          {review.history.map((entry, index) => (
            <li key={`${entry.changedAt}-${index}`}>
              <span className="font-mono" suppressHydrationWarning>
                {formatCaptureTime(entry.changedAt)}
              </span>{" "}
              {entry.fromStatus
                ? `${OBSERVATION_STATUS_LABELS[entry.fromStatus as keyof typeof OBSERVATION_STATUS_LABELS] ?? entry.fromStatus} → `
                : ""}
              {OBSERVATION_STATUS_LABELS[
                entry.toStatus as keyof typeof OBSERVATION_STATUS_LABELS
              ] ?? entry.toStatus}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

/** Issue reports on this record (D-049); the teacher alone sees the reporter. */
export function ReportsList({ review }: { review: TeacherReviewDetail }) {
  if (review.reports.length === 0) return null;
  return (
    <section
      aria-labelledby="reports-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
    >
      <h2 className="flex items-center gap-2 font-semibold" id="reports-title">
        <Flag aria-hidden="true" className="size-4" />
        รายงานปัญหา ({review.reports.length})
      </h2>
      <ul className="grid gap-2">
        {review.reports.map((report) => (
          <li
            className="border-border rounded-[10px] border p-3 text-sm leading-6"
            data-report-status={report.status}
            key={report.id}
          >
            <p className="font-medium">
              {REPORT_TYPE_LABELS[report.type]} ·{" "}
              {REPORT_STATUS_LABELS[report.status]}
            </p>
            <p>{report.reason}</p>
            <p className="text-muted-foreground text-[13px]">
              รายงานโดย {report.reporterName ?? "นักเรียน"} ·{" "}
              <span suppressHydrationWarning>
                {formatCaptureTime(report.createdAt)}
              </span>{" "}
              ·{" "}
              <Link
                className="font-medium text-[#1F5C3A] underline underline-offset-2"
                href={`/teacher/reports/${report.id}`}
              >
                จัดการรายงาน
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
