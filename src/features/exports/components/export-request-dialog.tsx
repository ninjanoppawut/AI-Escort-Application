"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { ApiEnvelope } from "@/lib/http/envelope";
import { cn } from "@/lib/utils";

import {
  ObservationApiRequestError,
  observationErrorCodeOf,
} from "@/features/observations/client/request";
import { presentReviewError } from "@/features/observations/review/client";
import { isReviewUiErrorCode } from "@/features/observations/review/errors";

import { exportRequestResponseSchema, type ExportType } from "../contracts";

type Scope = "all" | "verified";

async function postExport(body: unknown, key: string) {
  const response = await fetch("/api/exports", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  });
  const envelope = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<unknown> | null;
  if (!response.ok || !envelope || envelope.error) {
    if (!envelope?.error && response.status >= 500) {
      throw new TypeError("export request failed");
    }
    throw new ObservationApiRequestError(
      envelope?.error ?? {
        code: "FORBIDDEN",
        message: "FORBIDDEN",
        retryable: false,
        details: {},
      },
      response.status,
    );
  }
  return exportRequestResponseSchema.parse(envelope.data);
}

/**
 * Teacher export entry on the completed map (design T-15 "ส่งออก"): choose
 * CSV or GeoJSON and all submitted or verified records. The request carries
 * one Idempotency-Key per dialog, so a retry never creates a second export.
 */
export function ExportRequestDialog({
  classId,
  sessionId,
  pendingReviewCount,
  onClose,
}: {
  classId: string;
  sessionId: string;
  pendingReviewCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [type, setType] = useState<ExportType>("csv");
  const [scope, setScope] = useState<Scope>("all");
  const key = useRef<{ signature: string; value: string } | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        classId,
        sessionId,
        type,
        filters: scope === "verified" ? { statuses: ["verified"] } : {},
      };
      const signature = JSON.stringify(body);
      if (key.current?.signature !== signature) {
        key.current = { signature, value: crypto.randomUUID() };
      }
      return postExport(body, key.current.value);
    },
    onSuccess: (result) => router.push(`/teacher/exports/${result.exportId}`),
  });

  const errorCode = mutation.isError
    ? observationErrorCodeOf(mutation.error)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,33,28,.45)] sm:items-center">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-card w-full max-w-[480px] rounded-t-[20px] p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-[20px]"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !mutation.isPending) onClose();
        }}
        role="dialog"
      >
        <h2
          className="flex items-center gap-2 text-lg font-semibold"
          id={titleId}
        >
          <Download aria-hidden="true" className="size-5" />
          ส่งออกผลการสำรวจ
        </h2>
        {pendingReviewCount > 0 ? (
          <p className="mt-2 rounded-[10px] border border-[#E8C58A] bg-[#FFF6E5] p-2 text-sm text-[#5C3A04]">
            ยังมี {pendingReviewCount} รายการรอตรวจ —
            ส่งออกได้แต่ข้อมูลจะยังไม่สมบูรณ์
          </p>
        ) : null}
        <fieldset className="mt-3 grid gap-1.5">
          <legend className="mb-1 text-sm font-medium">รูปแบบไฟล์</legend>
          {(
            [
              ["csv", "CSV (ตาราง)"],
              ["geojson", "GeoJSON (แผนที่)"],
            ] as const
          ).map(([value, label]) => (
            <label
              className="border-border flex min-h-11 items-center gap-3 rounded-[10px] border px-3 text-sm"
              key={value}
            >
              <input
                checked={type === value}
                className="size-5 accent-[#1F5C3A]"
                name="export-type"
                onChange={() => setType(value)}
                type="radio"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="mt-3 grid gap-1.5">
          <legend className="mb-1 text-sm font-medium">รายการที่ส่งออก</legend>
          {(
            [
              ["all", "ทุกรายการที่ส่งแล้ว"],
              ["verified", "เฉพาะที่ครูยืนยันแล้ว"],
            ] as const
          ).map(([value, label]) => (
            <label
              className="border-border flex min-h-11 items-center gap-3 rounded-[10px] border px-3 text-sm"
              key={value}
            >
              <input
                checked={scope === value}
                className="size-5 accent-[#1F5C3A]"
                name="export-scope"
                onChange={() => setScope(value)}
                type="radio"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="text-muted-foreground mt-2 text-[13px] leading-5">
          ไฟล์มีเฉพาะรายการที่ส่งแล้ว ตำแหน่งจับภาพ ชื่อ และผลการตรวจ ·
          ไม่มีตำแหน่งสดหรือเส้นทางเดิน · ลิงก์ดาวน์โหลดหมดอายุใน 7 วัน
        </p>
        {errorCode ? (
          <p className="mt-2 text-sm text-[#8C1D18]" role="alert">
            {errorCode === "NETWORK"
              ? "ส่งคำขอไม่สำเร็จ เพราะเชื่อมต่อไม่ได้ · กดอีกครั้งได้ ระบบจะไม่สร้างซ้ำ"
              : `ส่งออกไม่สำเร็จ · ${
                  presentReviewError(
                    isReviewUiErrorCode(errorCode) ? errorCode : "FORBIDDEN",
                  ).title
                }`}
          </p>
        ) : null}
        <div className="mt-4 grid gap-2">
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            size="lg"
          >
            {mutation.isPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Download aria-hidden="true" className="size-4" />
            )}
            สร้างไฟล์ส่งออก
          </Button>
          <button
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            disabled={mutation.isPending}
            onClick={onClose}
            ref={cancelRef}
            type="button"
          >
            ยกเลิก
          </button>
        </div>
      </section>
    </div>
  );
}
