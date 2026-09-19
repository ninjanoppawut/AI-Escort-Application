"use client";

import { useMutation } from "@tanstack/react-query";
import { CircleCheck, Flag, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { sendObservationJson } from "../../client/request";
import { presentReviewError, reviewErrorCodeOf } from "../client";
import {
  REPORT_REASON_MIN_CHARS,
  REPORT_TYPES,
  REPORT_TYPE_LABELS,
  issueReportResponseSchema,
  type ReportType,
} from "../revision-contracts";

function retryAfterOf(error: unknown): number | null {
  const details =
    error && typeof error === "object" && "details" in error
      ? (error as { details: Record<string, unknown> }).details
      : {};
  return typeof details.retryAfterSeconds === "number"
    ? details.retryAfterSeconds
    : null;
}

function formatWait(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  if (hours > 0) return `${hours} ชั่วโมง ${minutes} นาที`;
  return `${Math.max(1, minutes)} นาที`;
}

/**
 * Design S-26 "รายงานปัญหาของรายการ" (D-049, D-066): a classmate reports a
 * submitted record; the owner is never told who reported. One report per
 * record per 24 hours; a repeat shows how long to wait.
 */
export function ReportIssueSheet({
  observationId,
  onClose,
}: {
  observationId: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const reasonId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [type, setType] = useState<ReportType | null>(null);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      sendObservationJson(
        "POST",
        `/api/observations/${observationId}/report`,
        { type, reason },
        issueReportResponseSchema,
      ),
  });

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const errorCode = mutation.isError ? reviewErrorCodeOf(mutation.error) : null;
  const waitSeconds =
    errorCode === "RATE_LIMITED" ? retryAfterOf(mutation.error) : null;
  const length = reason.trim().length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,33,28,.45)] sm:items-center">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-card flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-t-[20px] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(22,33,28,.14)] sm:rounded-[20px]"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !mutation.isPending) onClose();
        }}
        role="dialog"
      >
        <h2
          className="flex items-center gap-2 text-lg font-semibold"
          id={titleId}
        >
          <Flag aria-hidden="true" className="size-5" />
          รายงานปัญหาของรายการ
        </h2>
        {mutation.isSuccess ? (
          <div className="mt-3 grid gap-3" role="status">
            <p className="flex items-start gap-2 text-sm leading-6">
              <CircleCheck
                aria-hidden="true"
                className="mt-1 size-4 shrink-0 text-[#16432A]"
              />
              ส่งรายงานให้ครูแล้ว · ผู้บันทึกไม่ได้รับแจ้งว่าใครรายงาน
            </p>
            <Button onClick={onClose} size="lg">
              ปิด
            </Button>
          </div>
        ) : (
          <form
            className="mt-3 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-sm font-medium">ปัญหาที่พบ</legend>
              {REPORT_TYPES.map((option) => (
                <label
                  className="border-border flex min-h-11 items-center gap-3 rounded-[10px] border px-3 text-sm"
                  key={option}
                >
                  <input
                    checked={type === option}
                    className="size-5 accent-[#1F5C3A]"
                    name="report-type"
                    onChange={() => setType(option)}
                    type="radio"
                  />
                  {REPORT_TYPE_LABELS[option]}
                </label>
              ))}
            </fieldset>
            <label className="text-sm font-medium" htmlFor={reasonId}>
              รายละเอียด
            </label>
            <textarea
              aria-describedby={`${reasonId}-count`}
              className="border-border bg-background min-h-24 rounded-[10px] border px-3 py-2 text-base leading-6"
              id={reasonId}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
            <p
              className="text-muted-foreground flex justify-between text-[13px]"
              id={`${reasonId}-count`}
            >
              <span>ผู้บันทึกไม่ได้รับแจ้งว่าใครรายงาน</span>
              <span className="font-mono">
                {length} / {REPORT_REASON_MIN_CHARS} ขั้นต่ำ
              </span>
            </p>
            {errorCode ? (
              <p className="text-sm text-[#8C1D18]" role="alert">
                {errorCode === "RATE_LIMITED"
                  ? `รายงานรายการนี้ไปแล้ววันนี้ · รายงานได้อีกครั้งในอีก ${formatWait(waitSeconds ?? 86_400)}`
                  : errorCode === "NETWORK"
                    ? "ส่งไม่สำเร็จ เพราะเชื่อมต่อไม่ได้ ลองอีกครั้ง"
                    : presentReviewError(errorCode).title}
              </p>
            ) : null}
            <div className="grid gap-2">
              <Button
                disabled={
                  mutation.isPending ||
                  errorCode === "RATE_LIMITED" ||
                  type === null ||
                  length < REPORT_REASON_MIN_CHARS
                }
                size="lg"
                type="submit"
              >
                {mutation.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                ส่งรายงาน
              </Button>
              <button
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                )}
                disabled={mutation.isPending}
                onClick={onClose}
                ref={cancelRef}
                type="button"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
