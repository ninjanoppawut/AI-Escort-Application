"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import { sessionQueryKeys } from "@/features/sessions/contracts";
import { accuracyLabel } from "@/features/sessions/live-view";

import { formatCaptureTime } from "../capture";
import {
  OBSERVATION_ACCESS_ERRORS,
  fetchObservationJson,
  observationErrorCodeOf,
  presentObservationError,
} from "../client/request";
import {
  observationQueryKeys,
  sessionObservationsSchema,
  type ObservationDraft,
  type SessionObservations,
} from "../contracts";
import {
  OBSERVATION_BLOCKED_REASON_LABELS,
  OBSERVATION_ERROR_PRESENTATIONS,
  isObservationUiErrorCode,
} from "../errors";
import { ObservationStatusBadge } from "./observation-status-badge";
import { StartObservationSheet } from "./start-observation-sheet";

const COMPLETED_REASON_DESCRIPTION =
  "ร่างที่บันทึกไว้ยังเปิดดูได้ แต่เริ่มบันทึกใหม่ไม่ได้แล้ว";

/** Why the server refuses a new start, as a title and a way forward. */
export function startBlockedMessage(
  list: Pick<
    SessionObservations,
    "canStart" | "startBlockedCode" | "startBlockedReason"
  >,
) {
  if (list.canStart) return null;
  const code = isObservationUiErrorCode(list.startBlockedCode)
    ? list.startBlockedCode
    : "FORBIDDEN";
  const presentation = OBSERVATION_ERROR_PRESENTATIONS[code];
  const reason = list.startBlockedReason;
  const reasonLabel = reason
    ? OBSERVATION_BLOCKED_REASON_LABELS[reason]
    : undefined;
  return {
    code,
    title: reasonLabel ?? presentation.title,
    description:
      reason === "group_completed" || reason === "session_completed"
        ? COMPLETED_REASON_DESCRIPTION
        : presentation.description,
  };
}

function fetchSessionObservations(sessionId: string) {
  return fetchObservationJson(
    `/api/sessions/${sessionId}/observations`,
    sessionObservationsSchema,
  );
}

/**
 * The student's own observations in a session and the start action. The
 * server's canStart decides whether a start is offered; the shell's refreshed
 * participant view, focus, reconnect, and every mutation refetch it.
 */
export function SessionObservationsPanel({
  sessionId,
  activityId,
  viewRefreshedAt,
}: {
  sessionId: string;
  activityId: string;
  /** refreshedAt of the shell's participant view; a change refetches. */
  viewRefreshedAt: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const online = useOnlineStatus();
  const reasonId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  // A start can finish after the student closed the sheet; only an open
  // sheet navigates to the new draft.
  const sheetOpenRef = useRef(false);
  const [startError, setStartError] = useState<{
    error: unknown;
    at: number;
  } | null>(null);
  const listQuery = useQuery({
    queryKey: observationQueryKeys.session(sessionId),
    queryFn: () => fetchSessionObservations(sessionId),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const lastViewRefresh = useRef(viewRefreshedAt);
  useEffect(() => {
    if (lastViewRefresh.current === viewRefreshedAt) return;
    lastViewRefresh.current = viewRefreshedAt;
    void queryClient.invalidateQueries({
      queryKey: observationQueryKeys.session(sessionId),
    });
  }, [queryClient, sessionId, viewRefreshedAt]);

  function refreshAfterMutation() {
    void queryClient.invalidateQueries({
      queryKey: observationQueryKeys.session(sessionId),
    });
  }

  const list = listQuery.data;
  const loadErrorCode = listQuery.error
    ? observationErrorCodeOf(listQuery.error)
    : null;
  const blocked = list ? startBlockedMessage(list) : null;
  // Once a list fetched after a refused start shows its own blocked reason,
  // that reason explains the state and the refusal is dropped, so it cannot
  // reappear after the teacher resumes. Until then the refusal stays visible.
  if (
    startError &&
    list?.canStart === false &&
    listQuery.dataUpdatedAt > startError.at
  ) {
    setStartError(null);
  }
  const startErrorCode = startError
    ? observationErrorCodeOf(startError.error)
    : null;

  if (!list) {
    return (
      <section
        aria-labelledby="my-observations-heading"
        className="border-border bg-card rounded-xl border p-4"
      >
        <h2 className="font-semibold" id="my-observations-heading">
          การสังเกตของฉัน
        </h2>
        {loadErrorCode ? (
          <PanelLoadError
            activityId={activityId}
            code={loadErrorCode}
            onRetry={() => void listQuery.refetch()}
            retrying={listQuery.isFetching}
            sessionId={sessionId}
          />
        ) : (
          <div className="mt-3 grid gap-2" role="status">
            <span className="sr-only">กำลังโหลดการสังเกต...</span>
            <div className="bg-muted h-14 animate-pulse rounded-[10px]" />
            <div className="bg-muted h-16 animate-pulse rounded-xl" />
          </div>
        )}
      </section>
    );
  }

  if (loadErrorCode && OBSERVATION_ACCESS_ERRORS.includes(loadErrorCode)) {
    return (
      <section
        aria-labelledby="my-observations-heading"
        className="border-border bg-card rounded-xl border p-4"
      >
        <h2 className="font-semibold" id="my-observations-heading">
          การสังเกตของฉัน
        </h2>
        <PanelLoadError
          activityId={activityId}
          code={loadErrorCode}
          onRetry={() => void listQuery.refetch()}
          retrying={listQuery.isFetching}
          sessionId={sessionId}
        />
      </section>
    );
  }

  // The server re-checks every start, so a background refetch never disables it.
  const startDisabled = !list.canStart || !online;
  const startReason = !list.canStart
    ? blocked
    : !online
      ? {
          title: "ออฟไลน์",
          description: "เริ่มบันทึกใหม่ได้เมื่อกลับมาออนไลน์",
        }
      : null;

  return (
    <section
      aria-labelledby="my-observations-heading"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      data-can-start={list.canStart}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold" id="my-observations-heading">
          การสังเกตของฉัน ({list.items.length})
        </h2>
        {listQuery.isFetching ? (
          <span
            className="text-muted-foreground inline-flex items-center gap-1 text-[13px]"
            role="status"
          >
            <RefreshCw aria-hidden="true" className="size-3.5 animate-spin" />
            กำลังอัปเดต...
          </span>
        ) : null}
      </div>

      {startErrorCode ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-[#F1B8B4] bg-[#FDECEB] p-3 text-sm leading-6 text-[#8C1D18]"
          role="alert"
        >
          <ShieldAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
          <div>
            <p className="font-semibold">
              เริ่มบันทึกไม่ได้ ·{" "}
              {presentObservationError(startErrorCode).title}
            </p>
            <p>{presentObservationError(startErrorCode).description}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <Button
          aria-describedby={startReason ? reasonId : undefined}
          className="w-full"
          disabled={startDisabled}
          onClick={() => {
            setStartError(null);
            sheetOpenRef.current = true;
            setSheetOpen(true);
          }}
          size="lg"
        >
          <Plus aria-hidden="true" className="size-5" />
          เพิ่มการสังเกต
        </Button>
        {startReason ? (
          <div
            className="flex items-start gap-2 text-sm leading-6"
            data-start-blocked={list.startBlockedCode ?? "offline"}
            id={reasonId}
          >
            {!list.canStart ? (
              <Lock aria-hidden="true" className="mt-1 size-4 shrink-0" />
            ) : (
              <WifiOff aria-hidden="true" className="mt-1 size-4 shrink-0" />
            )}
            <p>
              <span className="font-semibold">{startReason.title}</span>
              <span className="text-muted-foreground">
                {" "}
                · {startReason.description}
              </span>
            </p>
          </div>
        ) : null}
      </div>

      {loadErrorCode ? (
        <div
          className="border-border flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
          role="alert"
        >
          <span className="min-w-0 flex-1 leading-6">
            อัปเดตรายการไม่สำเร็จ · กำลังแสดงรายการล่าสุดที่โหลดได้
          </span>
          <Button
            disabled={listQuery.isFetching}
            onClick={() => void listQuery.refetch()}
            variant="outline"
          >
            ลองใหม่
          </Button>
        </div>
      ) : null}

      {list.items.length ? (
        <ul aria-label="การสังเกตของฉันในรอบนี้" className="grid gap-2">
          {list.items.map((observation) => (
            <ObservationListItem
              key={observation.id}
              observation={observation}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm leading-6">
          ยังไม่มีการสังเกตในรอบนี้
          {list.canStart
            ? " · กด “เพิ่มการสังเกต” เมื่อเจอต้นไม้ที่จะบันทึก"
            : ""}
        </p>
      )}
      {list.hasMore ? (
        <p className="text-muted-foreground text-[13px]">
          แสดง 100 รายการล่าสุด
        </p>
      ) : null}

      {sheetOpen ? (
        <StartObservationSheet
          onClose={() => {
            sheetOpenRef.current = false;
            setSheetOpen(false);
            // A start may have committed before the sheet closed.
            refreshAfterMutation();
          }}
          onDenied={(error) => {
            sheetOpenRef.current = false;
            setSheetOpen(false);
            setStartError({ error, at: Date.now() });
            refreshAfterMutation();
            void queryClient.invalidateQueries({
              queryKey: sessionQueryKeys.participant(sessionId),
            });
          }}
          onStarted={(observation) => {
            queryClient.setQueryData(
              observationQueryKeys.detail(observation.id),
              observation,
            );
            refreshAfterMutation();
            if (sheetOpenRef.current) {
              router.push(`/observations/${observation.id}`);
            }
          }}
          sessionId={sessionId}
        />
      ) : null}
    </section>
  );
}

function ObservationListItem({
  observation,
}: {
  observation: ObservationDraft;
}) {
  const { capture, draft } = observation;
  return (
    <li>
      <Link
        className="border-border bg-background flex min-h-14 items-center gap-3 rounded-xl border p-3"
        href={`/observations/${observation.id}`}
      >
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <ObservationStatusBadge status={observation.status} />
          </span>
          <span className="font-medium break-words">
            {draft.commonName ?? "ยังไม่ได้ตั้งชื่อ"}
          </span>
          {draft.scientificName ? (
            <span className="font-serif text-[15px] break-words italic">
              {draft.scientificName}
            </span>
          ) : null}
          <span className="text-muted-foreground flex flex-wrap gap-x-2 text-[13px]">
            <span className="font-mono" suppressHydrationWarning>
              {formatCaptureTime(capture.capturedAt)}
            </span>
            {capture.locationStatus === "captured" &&
            capture.accuracyM !== null ? (
              <span className="font-mono">
                {accuracyLabel(capture.accuracyM)}
              </span>
            ) : (
              <span>⚑ ไม่มีพิกัด</span>
            )}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
      </Link>
    </li>
  );
}

function PanelLoadError({
  code,
  sessionId,
  activityId,
  onRetry,
  retrying,
}: {
  code: ReturnType<typeof observationErrorCodeOf>;
  sessionId: string;
  activityId: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const presentation =
    code === "NETWORK"
      ? {
          title: "โหลดการสังเกตไม่สำเร็จ",
          description: "ตรวจสอบสัญญาณแล้วลองอีกครั้ง",
        }
      : presentObservationError(code);
  const signIn = code === "AUTH_REQUIRED" || code === "EMAIL_NOT_CONFIRMED";
  return (
    <div className="mt-2 text-sm leading-6" role="alert">
      <p className="font-semibold">{presentation.title}</p>
      <p className="text-muted-foreground">{presentation.description}</p>
      {signIn ? (
        <Link
          className="border-border bg-background mt-2 inline-flex min-h-11 items-center rounded-full border px-5 font-semibold"
          href={`/auth/sign-in?${new URLSearchParams({ error: code, returnTo: `/activities/${activityId}/sessions/${sessionId}` }).toString()}`}
        >
          ไปหน้าเข้าสู่ระบบ
        </Link>
      ) : OBSERVATION_ACCESS_ERRORS.includes(code) ? null : (
        <Button
          className="mt-2"
          disabled={retrying}
          onClick={onRetry}
          variant="outline"
        >
          {retrying ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-4" />
          )}
          ลองใหม่
        </Button>
      )}
    </div>
  );
}
