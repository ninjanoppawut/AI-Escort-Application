"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Flag,
  Info,
  Loader2,
  Lock,
  LockKeyhole,
  Pause,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import { formatClockTime } from "@/features/sessions/components/session-freshness";

import {
  CAPTURE_TIME_NOTICE,
  LOCATION_UNAVAILABLE_REASON_LABELS,
  formatCaptureTime,
  formatCoordinate,
} from "../capture";
import {
  OBSERVATION_ACCESS_ERRORS,
  fetchObservationJson,
  observationErrorCodeOf,
  presentObservationError,
  type ObservationClientErrorCode,
} from "../client/request";
import {
  observationDraftSchema,
  observationQueryKeys,
  type ObservationDraft,
} from "../contracts";
import { draftAfterSave } from "../draft-form";
import {
  OBSERVATION_BLOCKED_REASON_LABELS,
  OBSERVATION_ERROR_PRESENTATIONS,
  type ObservationUiErrorCode,
} from "../errors";
import { DraftNotesForm } from "./draft-notes-form";
import { LocationIndicator } from "./location-indicator";
import { ObservationStatusBadge } from "./observation-status-badge";

export const DRAFT_PRIVACY_LABEL = "ร่างส่วนตัว — ครูยังไม่เห็นจนกว่าคุณจะส่ง";

function fetchDraft(observationId: string) {
  return fetchObservationJson(
    `/api/observations/${observationId}`,
    observationDraftSchema,
  );
}

/**
 * Owner deep-link view of one observation draft (P8-04). The owner-only read
 * model decides everything shown; a foreign or missing record is FORBIDDEN and
 * is never redirected, so its existence does not leak.
 */
export function ObservationDraftScreen({
  observationId,
  initialDraft,
  initialErrorCode,
  viewerRole,
}: {
  observationId: string;
  initialDraft: ObservationDraft | null;
  initialErrorCode: ObservationUiErrorCode | null;
  viewerRole: "student" | "teacher";
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const initiallyDenied =
    initialErrorCode !== null &&
    OBSERVATION_ACCESS_ERRORS.includes(initialErrorCode);
  const draftQuery = useQuery({
    queryKey: observationQueryKeys.detail(observationId),
    queryFn: () => fetchDraft(observationId),
    ...(initialDraft ? { initialData: initialDraft } : {}),
    enabled: !initiallyDenied,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const draft = draftQuery.data;
  const errorCode: ObservationClientErrorCode | null = draftQuery.error
    ? observationErrorCodeOf(draftQuery.error)
    : !draft
      ? initialErrorCode
      : null;

  if (!draft || (errorCode && OBSERVATION_ACCESS_ERRORS.includes(errorCode))) {
    return (
      <main className="bg-background min-h-dvh px-4 pt-5">
        <div className="mx-auto grid max-w-[480px] gap-4">
          {errorCode ? (
            <DraftErrorPanel
              code={errorCode}
              observationId={observationId}
              onRetry={() => void draftQuery.refetch()}
              retrying={draftQuery.isFetching}
              viewerRole={viewerRole}
            />
          ) : (
            <DraftSkeleton />
          )}
        </div>
      </main>
    );
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: observationQueryKeys.detail(observationId),
    });
    void queryClient.invalidateQueries({
      queryKey: observationQueryKeys.session(draft.session.id),
    });
  };

  const paused =
    draft.permissions.canEdit &&
    (draft.session.status === "paused" || draft.groupStatus === "paused");
  const shellHref = `/activities/${draft.activity.id}/sessions/${draft.session.id}`;

  return (
    <main className="bg-background min-h-dvh">
      <div className="mx-auto grid w-full max-w-[480px] content-start gap-4 px-4 pt-4 pb-6">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับรอบสำรวจ"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={shellHref}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {draft.activity.title} · {draft.session.title}
            </p>
            <h1 className="text-xl font-bold break-words">
              {draft.draft.commonName ?? "การสังเกตใหม่"}
            </h1>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <ObservationStatusBadge status={draft.status} />
          {draft.status === "draft" ? (
            <span
              className="border-border bg-card inline-flex min-h-7 items-center gap-1.5 rounded-[6px] border px-2.5 text-[13px] leading-5 font-medium"
              data-privacy="owner_only"
            >
              <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
              {DRAFT_PRIVACY_LABEL}
            </span>
          ) : null}
        </div>

        <p
          className="text-muted-foreground flex items-center gap-1.5 text-[13px]"
          role="status"
        >
          <RefreshCw
            aria-hidden="true"
            className={
              draftQuery.isFetching ? "size-3.5 animate-spin" : "size-3.5"
            }
          />
          {draftQuery.isFetching ? (
            "กำลังอัปเดต..."
          ) : draft.refreshedAt ? (
            <span suppressHydrationWarning>
              อัปเดตล่าสุด {formatClockTime(draft.refreshedAt)}
            </span>
          ) : (
            "ข้อมูลจากการบันทึกล่าสุด"
          )}
        </p>

        {!online ? (
          <section
            className="flex items-start gap-3 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">ออฟไลน์อยู่</p>
              <p className="mt-0.5 leading-6">
                ข้อความที่พิมพ์ยังอยู่ในหน้านี้ บันทึกได้เมื่อกลับมาออนไลน์
              </p>
            </div>
          </section>
        ) : null}

        {draftQuery.isError ? (
          <section
            className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
            role="alert"
          >
            <span className="min-w-0 flex-1 leading-6">
              อัปเดตไม่สำเร็จ · กำลังแสดงข้อมูลล่าสุดที่โหลดได้
            </span>
            <Button
              disabled={draftQuery.isFetching}
              onClick={() => void draftQuery.refetch()}
              variant="outline"
            >
              ลองใหม่
            </Button>
          </section>
        ) : null}

        {paused ? (
          <section
            className="flex items-start gap-3 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <Pause aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {OBSERVATION_ERROR_PRESENTATIONS.SESSION_PAUSED.title}
              </p>
              <p className="mt-0.5 leading-6">
                ร่างนี้ยังแก้ไขและบันทึกได้ แต่ส่งให้ครูไม่ได้จนกว่าครูจะเปิดต่อ
              </p>
            </div>
          </section>
        ) : null}

        {!draft.permissions.canEdit ? (
          <section
            className="border-border bg-card flex items-start gap-3 rounded-xl border p-3 text-sm"
            data-read-only-reason={draft.permissions.blockedReason ?? "unknown"}
            role="status"
          >
            <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {(draft.permissions.blockedReason &&
                  OBSERVATION_BLOCKED_REASON_LABELS[
                    draft.permissions.blockedReason
                  ]) ||
                  "ร่างนี้แก้ไขไม่ได้แล้ว"}
              </p>
              <p className="text-muted-foreground mt-0.5 leading-6">
                ร่างยังเก็บไว้และเปิดดูได้ แต่แก้ไขไม่ได้แล้ว
              </p>
            </div>
          </section>
        ) : null}

        <CaptureCard capture={draft.capture} />

        <DraftNotesForm
          observation={draft}
          onConflict={(latest) => {
            queryClient.setQueryData<ObservationDraft>(
              observationQueryKeys.detail(observationId),
              (previous) =>
                previous?.refreshedAt
                  ? { ...latest, refreshedAt: previous.refreshedAt }
                  : latest,
            );
            invalidate();
          }}
          onSaved={(result, values) => {
            queryClient.setQueryData<ObservationDraft>(
              observationQueryKeys.detail(observationId),
              (previous) =>
                previous
                  ? draftAfterSave(previous, values, result.version)
                  : previous,
            );
            invalidate();
          }}
          onStatusChanged={invalidate}
          online={online}
        />

        <Link
          className="border-border bg-card inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold"
          href={shellHref}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          กลับรอบสำรวจ
        </Link>
      </div>
    </main>
  );
}

function CaptureCard({ capture }: { capture: ObservationDraft["capture"] }) {
  const time = formatCaptureTime(capture.capturedAt);
  if (capture.locationStatus !== "captured") {
    const acceptedByTeacher =
      capture.locationStatus === "teacher_accepted_missing";
    return (
      <section
        aria-labelledby="capture-card-title"
        className="rounded-xl border border-dashed border-[#6B4204] bg-[#FFF6E5] p-4 text-[#5C3A04]"
        data-location-status={capture.locationStatus}
      >
        <h2
          className="flex items-start gap-2 font-semibold"
          id="capture-card-title"
        >
          <Flag aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {acceptedByTeacher
            ? "⚑ ไม่มีพิกัด — ครูรับทราบแล้ว"
            : "⚑ ไม่มีพิกัด — ครูจะจัดการเมื่อส่งงาน"}
        </h2>
        {capture.unavailableReason ? (
          <p className="mt-1 text-sm leading-6">
            สาเหตุ:{" "}
            {LOCATION_UNAVAILABLE_REASON_LABELS[capture.unavailableReason]}
          </p>
        ) : null}
        <p className="mt-1 text-sm">
          เริ่มบันทึก{" "}
          <span className="font-mono" suppressHydrationWarning>
            {time}
          </span>
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="capture-card-title"
      className="border-border bg-card grid gap-2 rounded-xl border p-4"
      data-location-status="captured"
    >
      <h2 className="font-semibold" id="capture-card-title">
        ตำแหน่งที่ปักหมุด
      </h2>
      {capture.accuracyM !== null ? (
        <LocationIndicator
          className="w-fit"
          context="record"
          state={{ kind: "fix", accuracyM: capture.accuracyM }}
        />
      ) : null}
      {capture.lat !== null && capture.lng !== null ? (
        <p className="font-mono text-[15px]">
          {formatCoordinate(capture.lat)}, {formatCoordinate(capture.lng)}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        เริ่มบันทึก{" "}
        <span className="font-mono" suppressHydrationWarning>
          {time}
        </span>
      </p>
      <p className="text-muted-foreground flex items-start gap-2 text-[13px] leading-5">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {CAPTURE_TIME_NOTICE} · พิกัดนี้เห็นเฉพาะคุณจนกว่าจะส่ง
      </p>
    </section>
  );
}

function DraftSkeleton() {
  return (
    <div className="grid gap-4" role="status">
      <p className="flex items-center gap-2 text-sm">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        กำลังโหลดร่างการสังเกต...
      </p>
      <div className="bg-muted h-7 w-40 animate-pulse rounded-full" />
      <div className="bg-muted h-32 animate-pulse rounded-xl" />
      <div className="bg-muted h-64 animate-pulse rounded-xl" />
    </div>
  );
}

function DraftErrorPanel({
  code,
  observationId,
  viewerRole,
  onRetry,
  retrying,
}: {
  code: ObservationClientErrorCode;
  observationId: string;
  viewerRole: "student" | "teacher";
  onRetry: () => void;
  retrying: boolean;
}) {
  const presentation =
    code === "NETWORK"
      ? {
          title: "โหลดร่างการสังเกตไม่สำเร็จ",
          description: "ตรวจสอบสัญญาณแล้วลองอีกครั้ง",
        }
      : presentObservationError(code);
  const signIn = code === "AUTH_REQUIRED" || code === "EMAIL_NOT_CONFIRMED";
  const canRetry = !OBSERVATION_ACCESS_ERRORS.includes(code);
  const home = viewerRole === "teacher" ? "/teacher/classes" : "/app";
  return (
    <section
      className="border-border bg-card rounded-xl border p-4"
      data-error-code={code}
      role="alert"
    >
      <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
      <h1 className="mt-2 font-semibold">{presentation.title}</h1>
      <p className="text-muted-foreground mt-1 text-sm leading-6">
        {presentation.description}
      </p>
      {code === "FORBIDDEN" && viewerRole === "teacher" ? (
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          ร่างการสังเกตเป็นข้อมูลส่วนตัวของนักเรียน
          ครูจะเห็นเมื่อนักเรียนส่งงานแล้ว
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {canRetry ? (
          <Button disabled={retrying} onClick={onRetry} variant="outline">
            {retrying ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            ลองใหม่
          </Button>
        ) : null}
        <Link
          className="border-border bg-background inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
          href={
            signIn
              ? `/auth/sign-in?${new URLSearchParams({ error: code, returnTo: `/observations/${observationId}` }).toString()}`
              : home
          }
        >
          {signIn
            ? "ไปหน้าเข้าสู่ระบบ"
            : viewerRole === "teacher"
              ? "กลับรายการชั้นเรียน"
              : "กลับหน้าหลัก"}
        </Link>
      </div>
    </section>
  );
}
