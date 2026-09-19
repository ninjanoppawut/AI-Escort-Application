"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Loader2,
  PencilLine,
  RefreshCw,
  Send,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { formatCaptureTime } from "../../capture";
import { observationQueryKeys, type ObservationDraft } from "../../contracts";
import { mediaQueryKeys } from "../../media/contracts";
import {
  fetchReviewState,
  presentReviewError,
  reviewErrorCodeOf,
} from "../client";
import { reviewQueryKeys, type ReviewState } from "../contracts";
import { ManualReviewForm } from "./manual-review-form";
import { ReviewOutcomeCard } from "./review-outcome-card";
import { SubmitPanel } from "./submit-panel";

/** Lifecycle states in which the owner still edits the review. */
const EDITABLE_STATUSES = new Set(["draft", "student_review"]);

/**
 * AI analysis substates (UI_CONTRACTS.md §2). P10 is not live, so the review
 * read model reports `unavailable`; the other states are labelled so the panel
 * reads correctly once the analysis worker ships.
 */
const ANALYSIS_COPY: Record<string, { title: string; body: string }> = {
  unavailable: {
    title: "AI ช่วยดูยังไม่เปิดใช้",
    body: "ตอนนี้ยังไม่มีตัวเลือกจาก AI ตรวจกับต้นจริงแล้วกรอกชื่อและลักษณะเองได้เลย ภาพและพิกัดยังเก็บไว้ครบ",
  },
  queued: {
    title: "อยู่ในคิว — AI ยังไม่เริ่มวิเคราะห์",
    body: "ไม่ต้องรออยู่ตรงนี้ ร่างนี้ถูกบันทึกไว้แล้ว หรือกรอกข้อมูลเองได้เลย",
  },
  running: {
    title: "AI กำลังวิเคราะห์",
    body: "ผลที่ได้เป็นเพียงข้อเสนอชั่วคราว คุณต้องเทียบกับต้นจริงเสมอ",
  },
  failed: {
    title: "AI วิเคราะห์ไม่สำเร็จ",
    body: "ร่างของคุณยังอยู่ครบ กรอกข้อมูลเองได้",
  },
};

/**
 * P11-02: the owner's identify → verify → submit flow under the images. While
 * the record is a plain draft the P8 notes form stays; choosing manual entry
 * (or a saved review) swaps it for the full manual form and the submit panel.
 * After submission the frozen submission is summarised instead.
 */
export function PlantReviewSection({
  draft,
  online,
  draftNotes,
  draftNotesDirty,
}: {
  draft: ObservationDraft;
  online: boolean;
  /** The P8 draft notes form, shown until manual entry starts. */
  draftNotes: ReactNode;
  draftNotesDirty: boolean;
}) {
  const observationId = draft.id;
  const queryClient = useQueryClient();
  const [manualRequested, setManualRequested] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [submittedNumber, setSubmittedNumber] = useState<number | null>(null);

  const reviewQuery = useQuery({
    queryKey: reviewQueryKeys.state(observationId),
    queryFn: () => fetchReviewState(observationId),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });
  const state = reviewQuery.data;

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: reviewQueryKeys.state(observationId),
    });
    void queryClient.invalidateQueries({
      queryKey: observationQueryKeys.detail(observationId),
    });
    void queryClient.invalidateQueries({
      queryKey: observationQueryKeys.session(draft.session.id),
    });
  }, [draft.session.id, observationId, queryClient]);

  // The draft and review read models share the observation version; refetch
  // whichever one is behind so the form never mixes two versions.
  const behind =
    state && state.version !== draft.version
      ? state.version < draft.version
        ? "review"
        : "draft"
      : null;
  useEffect(() => {
    if (behind === "review") {
      void queryClient.invalidateQueries({
        queryKey: reviewQueryKeys.state(observationId),
      });
    } else if (behind === "draft") {
      void queryClient.invalidateQueries({
        queryKey: observationQueryKeys.detail(observationId),
      });
    }
  }, [behind, observationId, queryClient]);

  // The last pair read at one version. While one query catches up the form
  // keeps this pair, so a refetch never unmounts it or drops unsaved edits.
  const [synced, setSynced] = useState<{
    names: ObservationDraft["draft"];
    state: ReviewState;
  } | null>(null);
  if (
    state &&
    !behind &&
    (synced?.state !== state || synced.names !== draft.draft)
  ) {
    setSynced({ names: draft.draft, state });
  }

  if (!state) {
    return (
      <>
        {reviewQuery.isError ? (
          <ReviewLoadError
            error={reviewQuery.error}
            onRetry={() => void reviewQuery.refetch()}
            retrying={reviewQuery.isFetching}
          />
        ) : (
          <p
            className="text-muted-foreground flex items-center gap-2 text-sm"
            role="status"
          >
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            กำลังโหลดส่วนตรวจสอบพืช...
          </p>
        )}
        {draft.status === "draft" ? draftNotes : null}
      </>
    );
  }

  if (state.submission || !EDITABLE_STATUSES.has(state.status)) {
    return state.submission ? (
      <>
        <ReviewOutcomeCard
          observationId={observationId}
          status={state.status}
        />
        <SubmittedSummary
          justSubmitted={submittedNumber === state.submission.submissionNumber}
          submission={state.submission}
        />
      </>
    ) : null;
  }

  const manual =
    state.status !== "draft" ||
    state.identitySource !== null ||
    manualRequested;

  if (!manual) {
    return (
      <>
        <IdentityEntryPanel
          analysisState={state.analysis.state}
          blocked={draftNotesDirty}
          canEdit={state.permissions.canEdit}
          onManual={() => setManualRequested(true)}
        />
        {draftNotes}
      </>
    );
  }

  const current = !behind ? { names: draft.draft, state } : synced;
  if (!current) {
    return (
      <p
        className="text-muted-foreground flex items-center gap-2 text-sm"
        role="status"
      >
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        กำลังอัปเดตข้อมูลล่าสุด...
      </p>
    );
  }

  return (
    <>
      <ManualReviewForm
        names={current.names}
        observationId={observationId}
        onChanged={invalidateAll}
        onDirtyChange={setFormDirty}
        onSaved={invalidateAll}
        online={online}
        readOnly={!current.state.permissions.canEdit}
        state={current.state}
      />
      <SubmitPanel
        formDirty={formDirty || Boolean(behind)}
        names={current.names}
        observationId={observationId}
        onChanged={invalidateAll}
        onSubmitted={(result) => {
          setSubmittedNumber(result.submissionNumber);
          invalidateAll();
          void queryClient.invalidateQueries({
            queryKey: mediaQueryKeys.list(observationId),
          });
        }}
        online={online}
        state={current.state}
      />
    </>
  );
}

function IdentityEntryPanel({
  analysisState,
  canEdit,
  blocked,
  onManual,
}: {
  analysisState: string;
  canEdit: boolean;
  blocked: boolean;
  onManual: () => void;
}) {
  const copy = ANALYSIS_COPY[analysisState] ?? ANALYSIS_COPY.unavailable!;
  const failed = analysisState === "failed";
  return (
    <section
      aria-labelledby="identity-entry-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      data-analysis-state={analysisState}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EFE9FB] text-[#4B2A8C]">
          {failed ? (
            <TriangleAlert aria-hidden="true" className="size-5" />
          ) : (
            <Sparkles aria-hidden="true" className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold" id="identity-entry-title">
            {copy.title}
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm leading-6">
            {copy.body}
          </p>
        </div>
      </div>
      <Button
        disabled={!canEdit || blocked}
        onClick={onManual}
        size="lg"
        variant={analysisState === "unavailable" ? "default" : "outline"}
      >
        <PencilLine aria-hidden="true" className="size-4" />
        กรอกข้อมูลเอง
      </Button>
      {blocked ? (
        <p
          className="text-muted-foreground text-[13px] leading-5"
          role="status"
        >
          บันทึกร่างด้านล่างก่อน แล้วค่อยกรอกข้อมูลเอง ข้อความที่พิมพ์จะไม่หาย
        </p>
      ) : null}
    </section>
  );
}

function SubmittedSummary({
  submission,
  justSubmitted,
}: {
  submission: NonNullable<ReviewState["submission"]>;
  justSubmitted: boolean;
}) {
  return (
    <section
      aria-labelledby="submitted-summary-title"
      className="grid gap-3 rounded-xl border border-[#B7D8C2] bg-[#EEF7F1] p-4"
      data-submission-number={submission.submissionNumber}
    >
      <h2
        className="flex items-start gap-2 font-semibold text-[#16432A]"
        id="submitted-summary-title"
      >
        {justSubmitted ? (
          <BadgeCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        ) : (
          <Send aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        )}
        {justSubmitted
          ? "ส่งให้ครูแล้ว"
          : `ส่งให้ครูแล้ว (ครั้งที่ ${submission.submissionNumber})`}
      </h2>
      {justSubmitted ? (
        <p className="text-sm leading-6" role="status">
          ส่งครั้งที่ {submission.submissionNumber} เรียบร้อย ·
          ครูจะตรวจและแจ้งผลให้ทราบ
        </p>
      ) : null}
      <dl className="grid gap-2 text-sm leading-6">
        <div>
          <dt className="text-muted-foreground text-[13px]">ชื่อ</dt>
          <dd className="break-words">
            {submission.commonName} ·{" "}
            <i className="font-serif" lang="la">
              {submission.scientificName}
            </i>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">เหตุผลประกอบ</dt>
          <dd className="break-words whitespace-pre-line">
            {submission.evidenceNote}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">ส่งเมื่อ</dt>
          <dd className="font-mono" suppressHydrationWarning>
            {formatCaptureTime(submission.submittedAt)} · ภาพ{" "}
            {submission.imageCount} ภาพ
          </dd>
        </div>
        {submission.sameSpeciesAcknowledged ? (
          <div>
            <dt className="text-muted-foreground text-[13px]">ป้าย</dt>
            <dd>ชนิดเดียวกันในรอบนี้ (รับทราบแล้ว)</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-muted-foreground text-[13px] leading-5">
        ฉบับที่ส่งถูกเก็บไว้ถาวร แก้ได้อีกครั้งเมื่อครูขอให้แก้ไขเท่านั้น
      </p>
    </section>
  );
}

function ReviewLoadError({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  const code = reviewErrorCodeOf(error);
  const presentation =
    code === "NETWORK"
      ? {
          title: "โหลดส่วนตรวจสอบพืชไม่สำเร็จ",
          description: "ตรวจสอบสัญญาณแล้วลองอีกครั้ง",
        }
      : presentReviewError(code);
  return (
    <section
      className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
      data-review-error={code}
      role="alert"
    >
      <span className="min-w-0 flex-1 leading-6">
        <span className="font-semibold">{presentation.title}</span> ·{" "}
        {presentation.description}
      </span>
      <Button disabled={retrying} onClick={onRetry} variant="outline">
        <RefreshCw
          aria-hidden="true"
          className={retrying ? "size-4 animate-spin" : "size-4"}
        />
        โหลดส่วนตรวจสอบอีกครั้ง
      </Button>
    </section>
  );
}
