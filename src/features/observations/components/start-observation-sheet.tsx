"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Flag,
  Info,
  Loader2,
  MapPinOff,
  RefreshCw,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import { localStoreAvailable } from "@/lib/offline/local-store";
import { enqueueOutbox } from "@/lib/offline/outbox";

import {
  CAPTURE_TIME_NOTICE,
  LOCATION_UNAVAILABLE_REASON_LABELS,
  buildStartObservationRequest,
  captureQuality,
  flaggedSaveAllowed,
  formatCaptureTime,
  formatCoordinate,
  startObservationResponseSchema,
  type CaptureChoice,
  type CaptureFix,
} from "../capture";
import {
  invalidFieldsOf,
  observationErrorCodeOf,
  sendObservationJson,
} from "../client/request";
import { useCaptureFix, type CaptureFixState } from "../client/use-capture-fix";
import type { ObservationDraft, StartObservationRequest } from "../contracts";
import { OBSERVATION_ERROR_PRESENTATIONS } from "../errors";
import { LocationIndicator } from "./location-indicator";

/**
 * Automatic retries of one start request after a dropped connection. The same
 * clientGeneratedId and capture are resent, so a retry can only return the
 * draft the first attempt created (API §13).
 */
export const START_RETRY_POLICY = { retries: 2, baseDelayMs: 1_000 };

// Owner item 36: a denied permission blocks the start; only technical
// failures may save a flagged record without coordinates (D-020).
const DENIED_COPY = {
  title: "ไม่ได้รับสิทธิ์ตำแหน่ง",
  description:
    "ต้องเปิดสิทธิ์ตำแหน่งก่อนเริ่มบันทึก เพราะหมุดของต้นไม้ใช้ตำแหน่ง ณ ตอนเริ่มบันทึก",
  steps: [
    "Chrome (Android): แตะไอคอนหน้าช่องที่อยู่เว็บ › สิทธิ์ › ตำแหน่ง › อนุญาต",
    "Safari (iPhone): การตั้งค่า › ความเป็นส่วนตัวฯ › บริการหาตำแหน่ง › เว็บไซต์ Safari › ขณะใช้งาน",
  ],
} as const;

const UNAVAILABLE_ADVICE: Record<CaptureUnavailableReason, string> = {
  position_unavailable:
    "ขยับไปที่โล่ง ห่างจากหลังคา กำแพง หรือต้นไม้ใหญ่ ระบบยังหาตำแหน่งต่อให้",
  timeout: "ไม่ได้ตำแหน่งภายใน 20 วินาที ขยับไปที่โล่งแล้วลองใหม่",
  unsupported: "เบราว์เซอร์นี้หาตำแหน่งไม่ได้ ลองเปิดด้วย Chrome หรือ Safari",
};

type CaptureUnavailableReason = Extract<
  CaptureFixState,
  { kind: "unavailable" }
>["reason"];

interface SheetNotice {
  title: string;
  description: string;
}

export function StartObservationSheet({
  sessionId,
  onClose,
  onStarted,
  onDenied,
  onQueued,
}: {
  sessionId: string;
  onClose: () => void;
  onStarted: (observation: ObservationDraft) => void;
  /** Offline: the start was kept on the device to send on reconnect. */
  onQueued?: () => void;
  /** A server denial: the caller closes the sheet, refetches, and explains. */
  onDenied: (error: unknown) => void;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const online = useOnlineStatus();
  // One idempotency key per capture attempt, reused by every retry of it.
  const [clientGeneratedId, setClientGeneratedId] = useState(() =>
    crypto.randomUUID(),
  );
  // The request bound to clientGeneratedId once sent; it never changes.
  const [pending, setPending] = useState<StartObservationRequest | null>(null);
  const [notice, setNotice] = useState<SheetNotice | null>(null);
  const [acknowledgedErrorId, setAcknowledgedErrorId] = useState<string | null>(
    null,
  );
  const [waitingForBetter, setWaitingForBetter] = useState(false);
  const capture = useCaptureFix(pending === null);

  const startMutation = useMutation({
    mutationFn: (body: StartObservationRequest) =>
      sendObservationJson(
        "POST",
        "/api/observations/start",
        body,
        startObservationResponseSchema,
      ),
    retry: (failureCount, error) =>
      observationErrorCodeOf(error) === "NETWORK" &&
      failureCount < START_RETRY_POLICY.retries,
    retryDelay: (attempt) => START_RETRY_POLICY.baseDelayMs * 2 ** attempt,
    onSuccess: (result) => onStarted(result.observation),
    onError: (error) => {
      const code = observationErrorCodeOf(error);
      // A dropped connection keeps the same capture for a manual resend.
      if (code === "NETWORK") return;
      if (code === "IDEMPOTENCY_KEY_REUSE" || code === "VALIDATION_FAILED") {
        // Nothing was created: mint a new key and capture again.
        setClientGeneratedId(crypto.randomUUID());
        setPending(null);
        setWaitingForBetter(false);
        setAcknowledgedErrorId(null);
        setNotice(
          code === "IDEMPOTENCY_KEY_REUSE"
            ? OBSERVATION_ERROR_PRESENTATIONS.IDEMPOTENCY_KEY_REUSE
            : invalidFieldsOf(error).includes("capturedAt")
              ? {
                  title: "เวลาของตำแหน่งไม่ตรงกับเวลาของระบบ",
                  description:
                    "ตรวจว่าเครื่องตั้งเวลาอัตโนมัติ ระบบกำลังหาตำแหน่งใหม่ให้",
                }
              : {
                  title:
                    OBSERVATION_ERROR_PRESENTATIONS.VALIDATION_FAILED.title,
                  description: "ระบบกำลังหาตำแหน่งใหม่ให้ แล้วลองอีกครั้ง",
                },
        );
        capture.restart();
        return;
      }
      onDenied(error);
    },
  });

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function send(choice: CaptureChoice) {
    const body = buildStartObservationRequest(
      clientGeneratedId,
      sessionId,
      choice,
    );
    if (!body) {
      setNotice({
        title: "ตำแหน่งนี้ใช้ไม่ได้",
        description: "ระบบกำลังหาตำแหน่งใหม่ให้",
      });
      capture.retry();
      return;
    }
    setNotice(null);
    if (!online) {
      // P14-01: keep the start (with its capture) on the device; it is sent
      // once, with the same client generated ID, when the device reconnects.
      void enqueueOutbox({
        id: body.clientGeneratedId,
        kind: "start_observation",
        scope: sessionId,
        url: "/api/observations/start",
        body: body as unknown as Record<string, unknown>,
        label: "การสังเกตใหม่",
      }).then((queued) => {
        if (queued) {
          onQueued?.();
          return;
        }
        setNotice({
          title: "ออฟไลน์อยู่",
          description: "เครื่องนี้เก็บร่างไว้ไม่ได้ กดได้เมื่อกลับมาออนไลน์",
        });
      });
      return;
    }
    setPending(body);
    startMutation.mutate(body);
  }

  function retryCapture() {
    setNotice(null);
    setWaitingForBetter(false);
    setAcknowledgedErrorId(null);
    capture.retry();
  }

  const state = capture.state;
  const outcome =
    state.kind === "denied"
      ? "denied"
      : state.kind === "unavailable"
        ? state.reason
        : null;
  const canFlag = flaggedSaveAllowed({
    outcome,
    retries: capture.retries,
    sawTimeout: capture.sawTimeout,
  });
  const waitingAfterError =
    state.kind === "unavailable" && acknowledgedErrorId === state.errorId;

  let body: ReactNode;
  if (pending) {
    body = (
      <PendingStart
        failureCount={startMutation.failureCount}
        failed={startMutation.isError}
        online={online}
        onResend={() => startMutation.mutate(pending)}
        pending={pending}
        succeeded={startMutation.isSuccess}
      />
    );
  } else if (state.kind === "fix") {
    body = (
      <FixStep
        fix={state.fix}
        online={online}
        onUse={() => send({ kind: "fix", fix: state.fix })}
        onWait={() => setWaitingForBetter(true)}
        waiting={waitingForBetter}
      />
    );
  } else if (state.kind === "denied") {
    body = <DeniedStep onRetry={retryCapture} />;
  } else if (state.kind === "unavailable" && !waitingAfterError) {
    body = (
      <UnavailableStep
        canFlag={canFlag}
        online={online}
        onFlag={() =>
          send({
            kind: "flagged",
            reason: state.reason,
            capturedAt: new Date().toISOString(),
          })
        }
        onRetry={retryCapture}
        onWait={
          state.reason === "unsupported"
            ? null
            : () => setAcknowledgedErrorId(state.errorId)
        }
        reason={state.reason}
      />
    );
  } else {
    body = (
      <LocatingStep
        canFlag={canFlag}
        elapsedS={capture.elapsedS}
        online={online}
        onFlag={
          state.kind === "unavailable"
            ? () =>
                send({
                  kind: "flagged",
                  reason: state.reason,
                  capturedAt: new Date().toISOString(),
                })
            : null
        }
        onRetry={waitingAfterError ? retryCapture : null}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,33,28,.45)]"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-card flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-t-[20px] px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(22,33,28,.14)]"
        role="dialog"
      >
        <div
          aria-hidden="true"
          className="bg-border mx-auto mb-2 h-1 w-10 rounded-full"
        />
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              className="text-xl font-semibold outline-none"
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
            >
              เพิ่มการสังเกต
            </h2>
            <p className="text-muted-foreground text-[13px]">
              ขั้นที่ 1 · ตำแหน่งของต้นไม้
            </p>
          </div>
          <button
            aria-label="ปิด"
            className="border-border bg-background grid size-11 shrink-0 place-items-center rounded-full border"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        {notice ? (
          <div
            className="border-border bg-background mt-3 rounded-xl border p-3 text-sm leading-6"
            role="alert"
          >
            <p className="font-semibold">{notice.title}</p>
            <p className="text-muted-foreground">{notice.description}</p>
          </div>
        ) : null}

        {!online && !pending ? (
          <p
            className="mt-3 flex items-start gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm leading-6 text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="mt-1 size-4 shrink-0" />
            ออฟไลน์อยู่ · หาตำแหน่งได้ แต่สร้างร่างได้เมื่อกลับมาออนไลน์
          </p>
        ) : null}

        <div className="mt-3 grid gap-3">{body}</div>
      </section>
    </div>
  );
}

function CaptureNotice() {
  return (
    <p className="text-muted-foreground flex items-start gap-2 text-[13px] leading-5">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {CAPTURE_TIME_NOTICE}
    </p>
  );
}

function FixSummary({ fix }: { fix: CaptureFix }) {
  return (
    <div className="border-border bg-background rounded-xl border p-3">
      <p className="text-muted-foreground text-[13px]">ตำแหน่งที่จะปักหมุด</p>
      <p className="font-mono text-[15px]">
        {formatCoordinate(fix.lat)}, {formatCoordinate(fix.lng)}
      </p>
      <p className="text-muted-foreground mt-1 text-[13px]">
        เวลา{" "}
        <span className="font-mono" suppressHydrationWarning>
          {formatCaptureTime(fix.capturedAt)}
        </span>
      </p>
    </div>
  );
}

function OfflineReason({ online }: { online: boolean }) {
  if (online) return null;
  if (localStoreAvailable()) {
    return (
      <p className="text-center text-[13px] leading-5" role="status">
        ออฟไลน์อยู่ · เก็บไว้ในเครื่องนี้ก่อน แล้วส่งเองเมื่อกลับมาออนไลน์
        (ภายใน 15 นาที)
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-center text-[13px]">
      ออฟไลน์อยู่ · กดได้เมื่อกลับมาออนไลน์
    </p>
  );
}

function FixStep({
  fix,
  online,
  waiting,
  onUse,
  onWait,
}: {
  fix: CaptureFix;
  online: boolean;
  waiting: boolean;
  onUse: () => void;
  onWait: () => void;
}) {
  const poor = captureQuality(fix.accuracyM) === "poor";
  return (
    <>
      <LocationIndicator
        context="capture"
        state={{ kind: "fix", accuracyM: fix.accuracyM }}
      />
      <FixSummary fix={fix} />
      {poor && waiting ? (
        <p className="flex items-center gap-2 text-sm leading-6" role="status">
          <Loader2
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin"
          />
          กำลังรอสัญญาณที่แม่นขึ้น · ใช้ตำแหน่งนี้ได้ทุกเมื่อ
        </p>
      ) : null}
      <CaptureNotice />
      <div className="grid gap-2">
        <Button
          disabled={!online && !localStoreAvailable()}
          onClick={onUse}
          size="lg"
        >
          {online ? "ใช้ตำแหน่งนี้" : "ใช้ตำแหน่งนี้ · เก็บไว้ในเครื่อง"}
        </Button>
        <OfflineReason online={online} />
        {poor && !waiting ? (
          <Button onClick={onWait} size="lg" variant="outline">
            รอสัญญาณดีขึ้น
          </Button>
        ) : null}
      </div>
    </>
  );
}

function LocatingStep({
  elapsedS,
  canFlag,
  online,
  onRetry,
  onFlag,
}: {
  elapsedS: number;
  canFlag: boolean;
  online: boolean;
  onRetry: (() => void) | null;
  onFlag: (() => void) | null;
}) {
  return (
    <>
      <LocationIndicator
        context="capture"
        state={{ kind: "locating", elapsedS }}
      />
      <p className="text-sm leading-6">
        {onRetry
          ? "กำลังรอสัญญาณต่อ ถ้าได้ตำแหน่งจะแสดงทันที"
          : "ครั้งแรกอาจใช้เวลาสักครู่ ถ้าเบราว์เซอร์ถาม ให้กดอนุญาต"}
      </p>
      <CaptureNotice />
      {onRetry ? (
        <div className="grid gap-2">
          <Button onClick={onRetry} size="lg" variant="outline">
            <RefreshCw aria-hidden="true" className="size-4" />
            ลองหาตำแหน่งใหม่
          </Button>
          {canFlag && onFlag ? (
            <FlaggedSave online={online} onFlag={onFlag} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function DeniedStep({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      className="rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-[#5C3A04]"
      data-capture-state="denied"
      role="alert"
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <MapPinOff aria-hidden="true" className="size-5 shrink-0" />
        {DENIED_COPY.title}
      </h3>
      <p className="mt-1 text-sm leading-6">{DENIED_COPY.description}</p>
      <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm leading-6">
        {DENIED_COPY.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Button
        className="mt-3 w-full"
        onClick={onRetry}
        size="lg"
        variant="outline"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        ลองอีกครั้ง
      </Button>
    </section>
  );
}

function UnavailableStep({
  reason,
  canFlag,
  online,
  onWait,
  onRetry,
  onFlag,
}: {
  reason: CaptureUnavailableReason;
  canFlag: boolean;
  online: boolean;
  onWait: (() => void) | null;
  onRetry: () => void;
  onFlag: () => void;
}) {
  const presentation = OBSERVATION_ERROR_PRESENTATIONS.LOCATION_UNAVAILABLE;
  return (
    <section
      className="rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-[#5C3A04]"
      data-capture-state="unavailable"
      data-reason={reason}
      role="alert"
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
        {presentation.title}
      </h3>
      <p className="mt-1 text-sm leading-6">
        {LOCATION_UNAVAILABLE_REASON_LABELS[reason]} ·{" "}
        {UNAVAILABLE_ADVICE[reason]}
      </p>
      <p className="mt-1 text-sm leading-6">
        {canFlag
          ? presentation.description
          : "รอสัญญาณสักครู่ หรือลองหาตำแหน่งใหม่"}
      </p>
      <div className="mt-3 grid gap-2">
        {onWait ? (
          <Button onClick={onWait} size="lg" variant="outline">
            รอสัญญาณต่อ
          </Button>
        ) : null}
        <Button onClick={onRetry} size="lg" variant="outline">
          <RefreshCw aria-hidden="true" className="size-4" />
          ลองหาตำแหน่งใหม่
        </Button>
        {canFlag ? <FlaggedSave online={online} onFlag={onFlag} /> : null}
      </div>
    </section>
  );
}

function FlaggedSave({
  online,
  onFlag,
}: {
  online: boolean;
  onFlag: () => void;
}) {
  return (
    <div className="grid gap-1">
      <Button
        disabled={!online && !localStoreAvailable()}
        onClick={onFlag}
        size="lg"
      >
        <Flag aria-hidden="true" className="size-4" />
        บันทึกแบบมีธง
      </Button>
      <p className="text-center text-[13px] leading-5">
        ร่างจะไม่มีพิกัด ⚑ ครูจะจัดการเมื่อส่งงาน
      </p>
      <OfflineReason online={online} />
    </div>
  );
}

function PendingStart({
  pending,
  failureCount,
  failed,
  succeeded,
  online,
  onResend,
}: {
  pending: StartObservationRequest;
  failureCount: number;
  failed: boolean;
  succeeded: boolean;
  online: boolean;
  onResend: () => void;
}) {
  const capture = pending.capture;
  const summary =
    capture.locationStatus === "captured" ? (
      <LocationIndicator
        context="record"
        state={{ kind: "fix", accuracyM: capture.accuracyM }}
      />
    ) : (
      <LocationIndicator context="record" state={{ kind: "missing" }} />
    );

  if (failed) {
    return (
      <>
        {summary}
        <section
          className="border-border bg-background rounded-xl border p-3"
          role="alert"
        >
          <p className="flex items-center gap-2 font-semibold">
            <WifiOff aria-hidden="true" className="size-5 shrink-0" />
            สร้างร่างไม่สำเร็จ เพราะเชื่อมต่อไม่ได้
          </p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            ตำแหน่งที่จับไว้ยังอยู่ กดส่งอีกครั้งเมื่อสัญญาณกลับมา
            ระบบจะไม่สร้างร่างซ้ำ
          </p>
        </section>
        <Button disabled={!online} onClick={onResend} size="lg">
          <RefreshCw aria-hidden="true" className="size-4" />
          ส่งอีกครั้ง
        </Button>
        <OfflineReason online={online} />
      </>
    );
  }

  return (
    <>
      {summary}
      <p
        className="flex items-center gap-2 text-[15px] font-medium"
        role="status"
      >
        <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
        {succeeded
          ? "สร้างร่างแล้ว กำลังเปิด..."
          : failureCount > 0
            ? `สัญญาณไม่ดี กำลังลองส่งใหม่อัตโนมัติ (ครั้งที่ ${failureCount + 1})`
            : "กำลังสร้างร่าง..."}
      </p>
    </>
  );
}
