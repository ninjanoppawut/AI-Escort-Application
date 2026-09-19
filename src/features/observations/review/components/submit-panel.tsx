"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  Loader2,
  Send,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { localStoreAvailable } from "@/lib/offline/local-store";
import { enqueueOutbox, useOutbox } from "@/lib/offline/outbox";
import { cn } from "@/lib/utils";

import { sendObservationJson } from "../../client/request";
import { QueuedActions } from "../../components/queued-actions";
import { OBSERVATION_BLOCKED_REASON_LABELS } from "../../errors";
import {
  fetchOwnerRelated,
  presentReviewError,
  reviewErrorCodeOf,
  sameSpeciesCountOf,
  submitBlockersOf,
  type ReviewClientErrorCode,
} from "../client";
import {
  SUBMIT_BLOCKERS,
  SUBMIT_BLOCKER_LABELS,
  reviewQueryKeys,
  type ReviewState,
  type SubmitBlocker,
} from "../contracts";
import { isReviewUiErrorCode, reviewErrorPresentation } from "../errors";
import {
  TRAIT_MODE_LABELS,
  reviewFormValuesOf,
  submitResponseSchema,
  traitSummaryOf,
  type ReviewNames,
  type SubmitResponse,
} from "../review-form";

function newSubmissionId() {
  return crypto.randomUUID();
}

/**
 * Review-before-submit (S-20, REV-002/REV-004): what is still missing, the
 * same-species acknowledgement, and the submit itself. The client submission
 * ID is kept for one saved version, so a retry after a lost response is the
 * same request and can never create a second submission.
 */
export function SubmitPanel({
  observationId,
  names,
  state,
  online,
  formDirty,
  onSubmitted,
  onChanged,
}: {
  observationId: string;
  names: ReviewNames;
  state: ReviewState;
  online: boolean;
  /** Unsaved manual-entry edits would not be part of the submission. */
  formDirty: boolean;
  onSubmitted: (result: SubmitResponse) => void;
  onChanged: () => void;
}) {
  const panelId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const submission = useRef<{ version: number; id: string } | null>(null);
  // A same-species match the server reported on a refused submit (REV-004).
  const [deniedMatch, setDeniedMatch] = useState<{
    version: number;
    count: number;
  } | null>(null);

  // Live owner counts for the saved draft; counts only, never other records.
  const relatedQuery = useQuery({
    queryKey: reviewQueryKeys.related(observationId, state.version),
    queryFn: () => fetchOwnerRelated(observationId),
    enabled: state.identitySource !== null,
    retry: false,
  });

  function submissionIdFor(version: number) {
    if (submission.current?.version !== version) {
      submission.current = { version, id: newSubmissionId() };
    }
    return submission.current.id;
  }

  // P14-02: offline, the submit waits on this device and is sent once, with
  // the same client submission ID, on reconnect. The server still decides.
  const canQueue = localStoreAvailable();
  const outbox = useOutbox(observationId, onChanged, online);
  const queued = outbox.actions.length > 0;

  function queueSubmit(version: number, acknowledge: boolean) {
    const id = submissionIdFor(version);
    void enqueueOutbox({
      id,
      kind: "submit_observation",
      scope: observationId,
      url: `/api/observations/${observationId}/submit`,
      body: {
        clientSubmissionId: id,
        expectedVersion: version,
        acknowledgeSameSpecies: acknowledge,
      },
      label: "ส่งการสังเกตให้ครู",
    }).then(() => setConfirming(false));
  }

  const submitMutation = useMutation({
    mutationFn: (input: { version: number; acknowledge: boolean }) =>
      sendObservationJson(
        "POST",
        `/api/observations/${observationId}/submit`,
        {
          clientSubmissionId: submissionIdFor(input.version),
          expectedVersion: input.version,
          acknowledgeSameSpecies: input.acknowledge,
        },
        submitResponseSchema,
      ),
    onSuccess: (result) => {
      setConfirming(false);
      submission.current = null;
      onSubmitted(result);
    },
    onError: (error) => {
      setConfirming(false);
      const code = reviewErrorCodeOf(error);
      if (code === "IDEMPOTENCY_KEY_REUSE") submission.current = null;
      if (code === "SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED") {
        setAcknowledged(false);
        setDeniedMatch({
          version: state.version,
          count: sameSpeciesCountOf(error) ?? 0,
        });
        void relatedQuery.refetch();
      }
      if (code !== "NETWORK") onChanged();
    },
  });

  const errorCode: ReviewClientErrorCode | null = submitMutation.isError
    ? reviewErrorCodeOf(submitMutation.error)
    : null;
  const refusedBlockers = submitMutation.isError
    ? submitBlockersOf(submitMutation.error)
    : [];
  const blockers: SubmitBlocker[] = SUBMIT_BLOCKERS.filter((blocker) =>
    state.readiness.blockers.includes(blocker),
  );
  const related = relatedQuery.data;
  const denied = deniedMatch?.version === state.version ? deniedMatch : null;
  const sameSpeciesCount = Math.max(
    related?.sameSpeciesCount ?? 0,
    denied?.count ?? 0,
    state.sameSpecies.count,
  );
  const sameSpecies =
    Boolean(related?.sameSpeciesInSession) ||
    denied !== null ||
    state.sameSpecies.inSession;
  const possibleSameSpecimen = related?.possibleSameSpecimenCount ?? 0;
  const blockedCode = state.permissions.submitBlockedCode;
  const blockedReason = state.permissions.submitBlockedReason;
  const canSubmitNow =
    state.permissions.canSubmit &&
    blockers.length === 0 &&
    (online || canQueue) &&
    !queued &&
    !formDirty &&
    (!sameSpecies || acknowledged) &&
    !submitMutation.isPending;

  const saved = reviewFormValuesOf(names, state);
  const summary = traitSummaryOf(saved.traits);

  // canSubmit is also false while content blockers remain; only a denial
  // code (paused, completed, not open) outranks the student's own next step.
  let gate: string | null = null;
  if (blockedCode) {
    gate =
      (blockedReason && OBSERVATION_BLOCKED_REASON_LABELS[blockedReason]) ||
      (isReviewUiErrorCode(blockedCode)
        ? reviewErrorPresentation(blockedCode).description
        : "ส่งให้ครูไม่ได้ในตอนนี้");
  } else if (formDirty) {
    gate = "บันทึกข้อมูลพืชก่อน แล้วค่อยส่ง · ครูจะเห็นเฉพาะที่บันทึกแล้ว";
  } else if (queued) {
    gate = "การส่งนี้รออยู่ในเครื่อง · จะส่งเองเมื่อกลับมาออนไลน์";
  } else if (!online && !canQueue) {
    gate = "ออฟไลน์อยู่ · ส่งได้เมื่อกลับมาออนไลน์";
  } else if (blockers.length > 0) {
    gate = `ยังส่งไม่ได้ — มี ${blockers.length} ข้อที่ต้องทำก่อน`;
  } else if (sameSpecies && !acknowledged) {
    gate = "รับทราบคำเตือนพืชชนิดเดียวกันก่อนส่ง";
  } else if (!state.permissions.canSubmit) {
    gate = "ส่งให้ครูไม่ได้ในตอนนี้";
  }

  return (
    <section
      aria-labelledby={`${panelId}-title`}
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      data-submit-ready={canSubmitNow ? "true" : "false"}
    >
      <div>
        <h2 className="font-semibold" id={`${panelId}-title`}>
          สรุปก่อนส่ง
        </h2>
        <p className="text-muted-foreground mt-1 text-[13px] leading-5">
          ส่งแล้วแก้ไม่ได้ จนกว่าครูจะขอให้แก้ไข
        </p>
      </div>

      {blockers.length > 0 ? (
        <ul aria-label="สิ่งที่ต้องทำก่อนส่ง" className="grid gap-1.5">
          {blockers.map((blocker) => (
            <li
              className="flex items-start gap-2 rounded-[10px] border border-[#F2B8B5] bg-[#FDECEA] px-3 py-2 text-sm leading-6 text-[#8C1D18]"
              data-blocker={blocker}
              key={blocker}
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-1 size-4 shrink-0"
              />
              {SUBMIT_BLOCKER_LABELS[blocker]}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium text-[#16432A]">
          <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
          ข้อมูลที่บันทึกไว้ครบ พร้อมส่ง
        </p>
      )}

      <dl className="grid gap-2 text-sm leading-6">
        <div>
          <dt className="text-muted-foreground text-[13px]">ชื่อ</dt>
          <dd className="break-words">
            {saved.commonName || "—"}
            {saved.scientificName ? (
              <>
                {" · "}
                <i className="font-serif" lang="la">
                  {saved.scientificName}
                </i>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">
            สรุปการตรวจลักษณะ
          </dt>
          <dd className="flex flex-wrap gap-x-3" data-trait-summary="">
            <span>
              {TRAIT_MODE_LABELS.value} {summary.value}
            </span>
            <span>
              {TRAIT_MODE_LABELS.unsure} {summary.unsure}
            </span>
            <span>
              {TRAIT_MODE_LABELS.not_visible} {summary.notVisible}
            </span>
          </dd>
        </div>
      </dl>

      {sameSpecies ? (
        <div
          className="grid gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
          data-same-species="warning"
          role="status"
        >
          <p className="flex items-start gap-2 font-semibold">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            พืชชนิดนี้ถูกบันทึกในรอบนี้แล้ว{" "}
            {sameSpeciesCount > 0 ? `${sameSpeciesCount} รายการ` : ""}
          </p>
          {possibleSameSpecimen > 0 ? (
            <p className="leading-6" data-possible-same-specimen="">
              อาจเป็นต้นเดียวกัน {possibleSameSpecimen} รายการ ·
              ครูจะเป็นคนตรวจยืนยัน
            </p>
          ) : null}
          <p className="leading-6">
            ยังส่งได้ ครูจะเห็นป้าย “ชนิดเดียวกัน”
            และเป็นคนตัดสินว่าเป็นต้นเดียวกันหรือไม่ ไม่มีรายการใดถูกรวมหรือลบ
          </p>
          <label className="flex min-h-11 items-center gap-3 font-medium">
            <input
              checked={acknowledged}
              className="size-5 accent-[#1F5C3A]"
              onChange={(event) => setAcknowledged(event.target.checked)}
              type="checkbox"
            />
            รับทราบ และยืนยันว่าบันทึกจากต้นที่เห็นจริง
          </label>
        </div>
      ) : null}

      {errorCode ? (
        <SubmitError blockers={refusedBlockers} code={errorCode} />
      ) : null}

      <QueuedActions online={online} onSent={onChanged} scope={observationId} />

      {gate ? (
        <p
          className="text-muted-foreground flex items-start gap-2 text-sm leading-6"
          data-submit-gate=""
          role="status"
        >
          <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {gate}
        </p>
      ) : null}

      <Button
        disabled={!canSubmitNow}
        onClick={() => setConfirming(true)}
        size="lg"
      >
        {submitMutation.isPending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Send aria-hidden="true" className="size-4" />
        )}
        {submitMutation.isPending
          ? "กำลังส่ง..."
          : online
            ? "ส่งการสังเกต"
            : "ส่งการสังเกต · เก็บไว้ในเครื่อง"}
      </Button>

      {confirming ? (
        <ConfirmSubmitDialog
          commonName={saved.commonName}
          evidenceNote={saved.evidenceNote}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            const input = {
              version: state.version,
              acknowledge: sameSpecies && acknowledged,
            };
            if (!online) queueSubmit(input.version, input.acknowledge);
            else submitMutation.mutate(input);
          }}
          pending={submitMutation.isPending}
          sameSpecies={sameSpecies}
          scientificName={saved.scientificName}
        />
      ) : null}
    </section>
  );
}

function SubmitError({
  code,
  blockers,
}: {
  code: ReviewClientErrorCode;
  blockers: SubmitBlocker[];
}) {
  if (code === "NETWORK") {
    return (
      <p
        className="flex items-start gap-2 rounded-[10px] border border-[#E8C58A] bg-[#FFF6E5] px-3 py-2 text-sm leading-6 text-[#5C3A04]"
        data-submit-error="NETWORK"
        role="alert"
      >
        <WifiOff aria-hidden="true" className="mt-1 size-4 shrink-0" />
        ยังไม่รู้ว่าส่งถึงครูหรือไม่ เพราะเชื่อมต่อไม่ได้ · กดส่งอีกครั้งได้
        ระบบจะไม่ส่งซ้ำ
      </p>
    );
  }
  const presentation = presentReviewError(code);
  const described =
    code === "OBSERVATION_VERSION_CONFLICT"
      ? "ข้อมูลพืชนี้ถูกบันทึกจากหน้าจออื่น โหลดฉบับล่าสุดแล้ว ตรวจอีกครั้งแล้วส่ง"
      : presentation.description;
  return (
    <div
      className="rounded-[10px] border border-[#F2B8B5] bg-[#FDECEA] px-3 py-2 text-sm leading-6 text-[#8C1D18]"
      data-submit-error={code}
      role="alert"
    >
      <p className="font-semibold">ส่งไม่สำเร็จ · {presentation.title}</p>
      <p>{described}</p>
      {blockers.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {blockers.map((blocker) => (
            <li key={blocker}>{SUBMIT_BLOCKER_LABELS[blocker]}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ConfirmSubmitDialog({
  commonName,
  scientificName,
  evidenceNote,
  sameSpecies,
  pending,
  onConfirm,
  onCancel,
}: {
  commonName: string;
  scientificName: string;
  evidenceNote: string;
  sameSpecies: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,33,28,.45)] sm:items-center">
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-card flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-t-[20px] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(22,33,28,.14)] sm:rounded-[20px]"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) onCancel();
        }}
        role="alertdialog"
      >
        <h2
          className="flex items-start gap-2 text-lg font-semibold"
          id={titleId}
        >
          <Send aria-hidden="true" className="mt-1 size-5 shrink-0" />
          ส่งการสังเกตนี้ให้ครู?
        </h2>
        <p className="mt-1 text-sm leading-6" id={descriptionId}>
          ครูจะเห็นภาพ พิกัด ชื่อ ลักษณะที่ตรวจ และเหตุผลประกอบตามที่บันทึกไว้
          ส่งแล้วแก้ไม่ได้ จนกว่าครูจะขอให้แก้ไข
        </p>
        <dl className="border-border mt-3 grid gap-2 rounded-xl border p-3 text-sm leading-6">
          <div>
            <dt className="text-muted-foreground text-[13px]">ชื่อ</dt>
            <dd className="break-words">
              {commonName} ·{" "}
              <i className="font-serif" lang="la">
                {scientificName}
              </i>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-[13px]">เหตุผลประกอบ</dt>
            <dd className="line-clamp-4 break-words whitespace-pre-line">
              {evidenceNote}
            </dd>
          </div>
          {sameSpecies ? (
            <div>
              <dt className="text-muted-foreground text-[13px]">คำเตือน</dt>
              <dd>รับทราบแล้วว่าพบพืชชนิดนี้ในรอบนี้แล้ว</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 grid gap-2">
          <Button disabled={pending} onClick={onConfirm} size="lg">
            {pending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-4" />
            )}
            {pending ? "กำลังส่ง..." : "ยืนยันส่งให้ครู"}
          </Button>
          <button
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            disabled={pending}
            onClick={onCancel}
            ref={backRef}
            type="button"
          >
            กลับไปตรวจอีกครั้ง
          </button>
        </div>
      </section>
    </div>
  );
}
