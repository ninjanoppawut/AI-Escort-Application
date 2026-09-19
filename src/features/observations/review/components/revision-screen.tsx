"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleAlert,
  Loader2,
  Lock,
  LockOpen,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button, buttonVariants } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import {
  useDeviceDraft,
  type DeviceDraft,
} from "@/lib/offline/use-device-draft";
import { localStoreAvailable } from "@/lib/offline/local-store";
import { enqueueOutbox, useOutbox } from "@/lib/offline/outbox";
import { cn } from "@/lib/utils";

import { QueuedActions } from "../../components/queued-actions";

import {
  fetchObservationJson,
  sendObservationJson,
} from "../../client/request";
import { ObservationMediaSection } from "../../media/components/observation-media-section";
import {
  presentReviewError,
  reviewErrorCodeOf,
  reviewInvalidFieldsOf,
  sameSpeciesCountOf,
} from "../client";
import {
  SUBMIT_BLOCKER_LABELS,
  SUBMIT_BLOCKERS,
  type SubmitBlocker,
} from "../contracts";
import { isReviewUiErrorCode } from "../errors";
import {
  REVIEW_FIELD_LABELS,
  REVIEW_TEXT_FIELDS,
  reviewFormSchema,
  reviewFormValuesOf,
  studentReviewRequestOf,
  type ReviewFormValues,
  type ReviewTextField,
} from "../review-form";
import {
  REVISION_TOPICS,
  REVISION_TOPIC_LABELS,
  resubmitResponseSchema,
  revisionQueryKeys,
  revisionStateSchema,
  saveRevisionResponseSchema,
  unlockRequestResponseSchema,
  type RevisionState,
  type RevisionTopic,
} from "../revision-contracts";
import { TraitChecklist } from "./trait-checklist";

const FIELD_TOPIC: Record<ReviewTextField, RevisionTopic> = {
  commonName: "common_name",
  scientificName: "scientific_name",
  evidenceNote: "evidence_note",
  referenceNote: "reference_note",
};

const REQUEST_STATUS_LABELS = {
  pending: "รอครูตัดสิน",
  granted: "ครูอนุญาตแล้ว",
  denied: "ครูไม่อนุญาต",
  cancelled: "ปิดแล้ว",
} as const;

function valuesOf(state: RevisionState): ReviewFormValues {
  return reviewFormValuesOf(state.current, {
    referenceNote: state.current.referenceNote,
    traits: state.current.traits,
    version: state.version,
  });
}

function topics(keys: readonly RevisionTopic[]) {
  return keys.map((key) => REVISION_TOPIC_LABELS[key]).join(" · ");
}

/**
 * Targeted revision (REV-009/REV-010, design S-23/S-24): the teacher's
 * feedback, only the open topics are editable, the same observation is
 * resubmitted as a new version, and more topics can be requested.
 */
export function RevisionScreen({
  observationId,
  initialState,
  initialErrorCode,
}: {
  observationId: string;
  initialState: RevisionState | null;
  initialErrorCode: string | null;
}) {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const stateQuery = useQuery({
    queryKey: revisionQueryKeys.state(observationId),
    queryFn: () =>
      fetchObservationJson(
        `/api/observations/${observationId}/revision`,
        revisionStateSchema,
      ),
    ...(initialState ? { initialData: initialState } : {}),
    enabled: initialState !== null,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });
  const state = stateQuery.data;
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["observations"] });
  };

  if (!state) {
    const code = initialErrorCode ?? "FORBIDDEN";
    const presentation = presentReviewError(
      isReviewUiErrorCode(code) ? code : "FORBIDDEN",
    );
    return (
      <main className="bg-background min-h-dvh px-4 pt-5">
        <section
          className="border-border bg-card mx-auto max-w-[480px] rounded-xl border p-4"
          data-error-code={code}
          role="alert"
        >
          <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
          <h1 className="mt-2 font-semibold">{presentation.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            เปิดได้เฉพาะเจ้าของรายการที่ส่งให้ครูแล้ว
          </p>
          <Link
            className="border-border bg-background mt-3 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
            href="/app"
          >
            กลับหน้าหลัก
          </Link>
        </section>
      </main>
    );
  }

  const inRevision = state.status === "revision_required";
  const review = state.latestReview;

  return (
    <main className="bg-background min-h-dvh">
      <div className="mx-auto grid w-full max-w-[480px] content-start gap-4 px-4 pt-4 pb-8">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับรายการพืช"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={`/observations/${observationId}`}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">
            {inRevision
              ? `ครูขอให้แก้ไข ${state.openTopics.length} หัวข้อ`
              : "คำขอแก้ไขจากครู"}
          </h1>
        </header>

        {!inRevision ? (
          <section
            className="border-border bg-card rounded-xl border p-4 text-sm leading-6"
            data-revision-closed=""
            role="status"
          >
            {state.status === "resubmitted" || state.status === "teacher_review"
              ? "ส่งฉบับแก้ไขแล้ว · รอครูตรวจ"
              : "ตอนนี้ไม่มีหัวข้อที่ต้องแก้"}
            {" · "}
            <Link
              className="font-medium text-[#1F5C3A] underline underline-offset-2"
              href={`/observations/${observationId}`}
            >
              ดูรายการ
            </Link>
          </section>
        ) : null}

        {review ? (
          <section
            aria-labelledby="teacher-feedback-title"
            className="grid gap-2 rounded-xl border border-[#F2B8B5] bg-[#FDECEA] p-4 text-sm text-[#5C1712]"
          >
            <h2
              className="flex items-center gap-2 font-semibold"
              id="teacher-feedback-title"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              คำแนะนำจากครู · ฉบับที่ {review.submissionNumber}
            </h2>
            {review.feedback ? (
              <p className="leading-6 whitespace-pre-line">
                “{review.feedback}”
              </p>
            ) : null}
            {inRevision ? (
              <p className="leading-6" data-open-topics="">
                หัวข้อที่ต้องแก้: {topics(state.openTopics)}
              </p>
            ) : null}
          </section>
        ) : null}

        {!online ? (
          <p
            className="flex items-start gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ออฟไลน์อยู่ · ข้อความที่พิมพ์ยังอยู่
            บันทึกและส่งได้เมื่อกลับมาออนไลน์
          </p>
        ) : null}

        {inRevision && state.openTopics.includes("images") ? (
          <ObservationMediaSection observationId={observationId} />
        ) : null}

        {inRevision ? (
          <RevisionForm
            observationId={observationId}
            onChanged={invalidate}
            online={online}
            state={state}
          />
        ) : null}

        {inRevision ? (
          <UnlockRequestPanel
            observationId={observationId}
            onChanged={invalidate}
            online={online}
            state={state}
          />
        ) : null}
      </div>
    </main>
  );
}

function RevisionForm({
  observationId,
  state,
  online,
  onChanged,
}: {
  observationId: string;
  state: RevisionState;
  online: boolean;
  onChanged: () => void;
}) {
  const formId = useId();
  const open = new Set(state.openTopics);
  const [conflict, setConflict] = useState(false);
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: valuesOf(state),
  });
  const { isDirty, errors } = form.formState;
  const [restoredNote, setRestoredNote] = useState(false);

  // P14-01: unsaved revision text stays on this device between visits.
  const allValues = useWatch({ control: form.control });
  const restore = useCallback(
    (draft: DeviceDraft<ReviewFormValues>) => {
      const kept = { ...draft.values, expectedVersion: draft.baseVersion };
      const latest = valuesOf(state);
      if (
        JSON.stringify({ ...kept, expectedVersion: 0 }) ===
        JSON.stringify({ ...latest, expectedVersion: 0 })
      ) {
        return;
      }
      form.reset(kept, { keepDefaultValues: true });
      setRestoredNote(true);
    },
    [form, state],
  );
  const device = useDeviceDraft<ReviewFormValues>({
    key: `revision:${observationId}`,
    scope: observationId,
    values: allValues as ReviewFormValues,
    dirty: isDirty,
    baseVersion: allValues.expectedVersion ?? state.version,
    onRestore: restore,
  });

  // Adopt a newer saved version only while nothing is unsaved.
  useEffect(() => {
    if (isDirty) return;
    if (form.getValues("expectedVersion") >= state.version) return;
    form.reset(valuesOf(state));
  }, [form, isDirty, state]);

  const save = useMutation({
    mutationFn: (values: ReviewFormValues) => {
      const request = studentReviewRequestOf(values);
      return sendObservationJson(
        "PUT",
        `/api/observations/${observationId}/revision`,
        {
          expectedVersion: request.expectedVersion,
          commonName: request.commonName,
          scientificName: request.scientificName,
          evidenceNote: request.evidenceNote,
          referenceNote: request.referenceNote,
          traits: request.traits,
        },
        saveRevisionResponseSchema,
      );
    },
    onSuccess: (result, values) => {
      setConflict(false);
      form.reset({ ...values, expectedVersion: result.version });
      onChanged();
    },
    onError: (error) => {
      const code = reviewErrorCodeOf(error);
      if (code === "OBSERVATION_VERSION_CONFLICT") {
        setConflict(true);
        onChanged();
      }
      if (code === "VALIDATION_FAILED") {
        for (const field of reviewInvalidFieldsOf(error)) {
          if ((REVIEW_TEXT_FIELDS as readonly string[]).includes(field)) {
            form.setError(field as ReviewTextField, {
              message: "ข้อมูลช่องนี้ยังไม่ถูกต้อง",
            });
          }
        }
      }
    },
  });

  const saveError = save.isError ? reviewErrorCodeOf(save.error) : null;

  return (
    <>
      <section
        aria-labelledby={`${formId}-title`}
        className="border-border bg-card rounded-xl border"
        data-revision-form=""
      >
        <form
          className="grid gap-4 p-4"
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <div>
            <h2 className="font-semibold" id={`${formId}-title`}>
              แก้ไขและส่งใหม่
            </h2>
            <p className="text-muted-foreground mt-1 text-[13px] leading-5">
              แก้ได้เฉพาะหัวข้อที่ครูเปิด หัวข้ออื่นแสดงไว้ให้ดูเท่านั้น
              ฉบับที่ส่งไปก่อนหน้ายังเก็บไว้ครบ
            </p>
          </div>

          {REVIEW_TEXT_FIELDS.map((field) => {
            const topic = FIELD_TOPIC[field];
            const editable = open.has(topic);
            const id = `${formId}-${field}`;
            const multiline =
              field === "evidenceNote" || field === "referenceNote";
            const shared = {
              "aria-invalid": Boolean(errors[field]),
              id,
              readOnly: !editable,
              ...form.register(field),
            };
            return (
              <div
                className="grid gap-1.5"
                data-revision-field={field}
                data-editable={editable ? "true" : "false"}
                key={field}
              >
                <label
                  className="flex items-center gap-2 text-sm font-medium"
                  htmlFor={id}
                >
                  {REVIEW_FIELD_LABELS[field]}
                  {editable ? (
                    <span className="inline-flex items-center gap-1 rounded-[6px] bg-[#E6F2EA] px-1.5 text-[12px] text-[#16432A]">
                      <LockOpen aria-hidden="true" className="size-3" />
                      แก้ได้
                    </span>
                  ) : (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-[12px]">
                      <Lock aria-hidden="true" className="size-3" />
                      ครูยังไม่เปิด
                    </span>
                  )}
                </label>
                {multiline ? (
                  <textarea
                    className="border-border bg-background read-only:bg-muted min-h-24 rounded-[10px] border px-3 py-2 text-base leading-6"
                    {...shared}
                  />
                ) : (
                  <input
                    autoCorrect="off"
                    className={cn(
                      "border-border bg-background read-only:bg-muted min-h-12 rounded-[10px] border px-3 text-base",
                      field === "scientificName" && "font-serif italic",
                    )}
                    lang={field === "scientificName" ? "la" : undefined}
                    spellCheck={false}
                    type="text"
                    {...shared}
                  />
                )}
                {errors[field] ? (
                  <p className="text-[13px] text-[#B3261E]" role="alert">
                    {errors[field]?.message}
                  </p>
                ) : null}
              </div>
            );
          })}

          <div data-editable={open.has("traits") ? "true" : "false"}>
            <TraitChecklist
              control={form.control}
              errors={errors}
              readOnly={!open.has("traits")}
              register={form.register}
            />
          </div>

          {isDirty && (restoredNote || device.savedAt) ? (
            <p
              className="text-muted-foreground text-[13px]"
              data-device-draft="kept"
              role="status"
            >
              {restoredNote
                ? "กู้คืนการแก้ไขที่ยังไม่ได้บันทึกจากเครื่องนี้ · ตรวจแล้วกดบันทึกการแก้ไข"
                : "เก็บการแก้ไขไว้ในเครื่องนี้แล้ว · กดบันทึกการแก้ไขเมื่อออนไลน์"}
            </p>
          ) : null}
          {conflict ? (
            <p className="text-sm text-[#8C1D18]" role="alert">
              มีการบันทึกจากหน้าจออื่นแล้ว · โหลดฉบับล่าสุดแล้ว
              ตรวจแล้วกดบันทึกอีกครั้ง
            </p>
          ) : saveError && saveError !== "VALIDATION_FAILED" ? (
            <p className="text-sm text-[#8C1D18]" role="alert">
              {saveError === "NETWORK"
                ? "บันทึกไม่สำเร็จ เพราะเชื่อมต่อไม่ได้ · ข้อความยังอยู่ กดบันทึกอีกครั้ง"
                : `บันทึกไม่สำเร็จ · ${presentReviewError(saveError).title}`}
            </p>
          ) : null}

          <Button
            disabled={!online || !isDirty || save.isPending}
            size="lg"
            type="submit"
          >
            {save.isPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-4" />
            )}
            บันทึกการแก้ไข
          </Button>
        </form>
      </section>

      <ResubmitPanel
        formDirty={isDirty}
        observationId={observationId}
        onChanged={onChanged}
        online={online}
        state={state}
      />
    </>
  );
}

function ResubmitPanel({
  observationId,
  state,
  online,
  formDirty,
  onChanged,
}: {
  observationId: string;
  state: RevisionState;
  online: boolean;
  formDirty: boolean;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [sameSpecies, setSameSpecies] = useState<{
    version: number;
    count: number;
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const submission = useRef<{ version: number; id: string } | null>(null);
  const blockers: SubmitBlocker[] = SUBMIT_BLOCKERS.filter((blocker) =>
    state.readiness.blockers.includes(blocker),
  );
  const warning = sameSpecies?.version === state.version ? sameSpecies : null;
  // P14-02: an offline resubmit waits on this device, keyed by its client
  // submission ID, and is sent once on reconnect.
  const canQueue = localStoreAvailable();
  const outbox = useOutbox(observationId, onChanged, online);
  const queued = outbox.actions.length > 0;

  function submissionId() {
    if (submission.current?.version !== state.version) {
      submission.current = {
        version: state.version,
        id: crypto.randomUUID(),
      };
    }
    return submission.current.id;
  }

  function queueResubmit() {
    const id = submissionId();
    void enqueueOutbox({
      id,
      kind: "resubmit_observation",
      scope: observationId,
      url: `/api/observations/${observationId}/resubmit`,
      body: {
        clientSubmissionId: id,
        expectedVersion: state.version,
        acknowledgeSameSpecies: warning !== null && acknowledged,
      },
      label: "ส่งฉบับแก้ไขให้ครู",
    }).then(() => setConfirming(false));
  }

  const mutation = useMutation({
    mutationFn: () => {
      const id = submissionId();
      return sendObservationJson(
        "POST",
        `/api/observations/${observationId}/resubmit`,
        {
          clientSubmissionId: id,
          expectedVersion: state.version,
          acknowledgeSameSpecies: warning !== null && acknowledged,
        },
        resubmitResponseSchema,
      );
    },
    onSuccess: () => {
      setConfirming(false);
      submission.current = null;
      onChanged();
    },
    onError: (error) => {
      setConfirming(false);
      const code = reviewErrorCodeOf(error);
      if (code === "SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED") {
        setAcknowledged(false);
        setSameSpecies({
          version: state.version,
          count: sameSpeciesCountOf(error) ?? 0,
        });
      }
      if (code === "IDEMPOTENCY_KEY_REUSE") submission.current = null;
      if (code !== "NETWORK") onChanged();
    },
  });

  const errorCode = mutation.isError ? reviewErrorCodeOf(mutation.error) : null;
  const noChanges = state.changedTopics.length === 0;
  const ready =
    state.permissions.canResubmit &&
    (online || canQueue) &&
    !queued &&
    !formDirty &&
    blockers.length === 0 &&
    !noChanges &&
    (!warning || acknowledged) &&
    !mutation.isPending;

  let gate: string | null = null;
  if (state.permissions.blockedCode === "SESSION_PAUSED") {
    gate = "กิจกรรมหยุดชั่วคราว · ส่งใหม่ได้เมื่อครูเปิดต่อ";
  } else if (formDirty) {
    gate = "บันทึกการแก้ไขก่อน แล้วค่อยส่งใหม่";
  } else if (queued) {
    gate = "ฉบับแก้ไขรออยู่ในเครื่อง · จะส่งเองเมื่อกลับมาออนไลน์";
  } else if (!online && !canQueue) {
    gate = "ออฟไลน์อยู่ · ส่งได้เมื่อกลับมาออนไลน์";
  } else if (noChanges) {
    gate = "ยังไม่มีอะไรเปลี่ยนจากฉบับที่ส่งไป";
  } else if (blockers.length > 0) {
    gate = `ยังส่งไม่ได้ — มี ${blockers.length} ข้อที่ต้องทำก่อน`;
  } else if (warning && !acknowledged) {
    gate = "รับทราบคำเตือนพืชชนิดเดียวกันก่อนส่ง";
  }

  return (
    <section
      aria-labelledby="resubmit-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      data-resubmit-ready={ready ? "true" : "false"}
    >
      <h2 className="font-semibold" id="resubmit-title">
        ส่งฉบับแก้ไข
      </h2>
      {state.changedTopics.length > 0 ? (
        <p className="text-sm leading-6" data-changed-topics="">
          ที่แก้แล้ว: {topics(state.changedTopics)}
        </p>
      ) : null}
      {blockers.length > 0 ? (
        <ul className="grid gap-1.5">
          {blockers.map((blocker) => (
            <li
              className="flex items-start gap-2 rounded-[10px] border border-[#F2B8B5] bg-[#FDECEA] px-3 py-2 text-sm text-[#8C1D18]"
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
      ) : null}
      {warning ? (
        <div
          className="grid gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
          data-same-species="warning"
        >
          <p className="font-semibold">
            พืชชนิดนี้ถูกบันทึกในรอบนี้แล้ว {warning.count} รายการ
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
      {errorCode && errorCode !== "SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED" ? (
        <p className="text-sm text-[#8C1D18]" role="alert">
          {errorCode === "NETWORK"
            ? "ยังไม่รู้ว่าส่งถึงครูหรือไม่ เพราะเชื่อมต่อไม่ได้ · กดส่งอีกครั้งได้ ระบบจะไม่ส่งซ้ำ"
            : `ส่งไม่สำเร็จ · ${presentReviewError(errorCode).title}`}
        </p>
      ) : null}
      <QueuedActions online={online} onSent={onChanged} scope={observationId} />
      {gate ? (
        <p className="text-muted-foreground text-sm" role="status">
          {gate}
        </p>
      ) : null}
      <Button disabled={!ready} onClick={() => setConfirming(true)} size="lg">
        {mutation.isPending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Send aria-hidden="true" className="size-4" />
        )}
        ส่งใหม่
      </Button>
      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,33,28,.45)] sm:items-center">
          <section
            aria-labelledby="resubmit-confirm-title"
            aria-modal="true"
            className="bg-card w-full max-w-[480px] rounded-t-[20px] p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-[20px]"
            role="alertdialog"
          >
            <h2 className="text-lg font-semibold" id="resubmit-confirm-title">
              ส่งฉบับแก้ไขให้ครู?
            </h2>
            <p className="mt-1 text-sm leading-6">
              ส่งเป็นฉบับที่ {state.submissionCount + 1} ของรายการเดิม ·
              ครูเห็นทั้งฉบับก่อนหน้าและฉบับนี้
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                disabled={mutation.isPending}
                onClick={() => {
                  if (!online) queueResubmit();
                  else mutation.mutate();
                }}
                size="lg"
              >
                ยืนยันส่งใหม่
              </Button>
              <button
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                )}
                onClick={() => setConfirming(false)}
                type="button"
              >
                กลับไปตรวจอีกครั้ง
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function UnlockRequestPanel({
  observationId,
  state,
  online,
  onChanged,
}: {
  observationId: string;
  state: RevisionState;
  online: boolean;
  onChanged: () => void;
}) {
  const id = useId();
  const closed = REVISION_TOPICS.filter(
    (topic) => !state.openTopics.includes(topic),
  );
  const [fields, setFields] = useState<RevisionTopic[]>([]);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      sendObservationJson(
        "POST",
        `/api/observations/${observationId}/unlock-request`,
        { fieldKeys: fields, reason },
        unlockRequestResponseSchema,
      ),
    onSuccess: () => {
      setFields([]);
      setReason("");
      onChanged();
    },
  });
  const errorCode = mutation.isError ? reviewErrorCodeOf(mutation.error) : null;
  const canRequest = state.permissions.canRequestTopics && closed.length > 0;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      data-unlock-panel=""
    >
      <h2 className="flex items-center gap-2 font-semibold" id={`${id}-title`}>
        <LockOpen aria-hidden="true" className="size-4" />
        ขอแก้เพิ่ม
      </h2>
      {state.unlockRequests.length > 0 ? (
        <ul className="grid gap-1.5 text-sm">
          {state.unlockRequests.map((request) => (
            <li
              className="border-border rounded-[10px] border px-3 py-2 leading-6"
              data-unlock-request={request.status}
              key={request.id}
            >
              {topics(request.requestedFields)} ·{" "}
              {REQUEST_STATUS_LABELS[request.status]}
              {request.decisionNote ? ` · “${request.decisionNote}”` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {canRequest ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <fieldset className="grid gap-1.5">
            <legend className="text-sm font-medium">
              หัวข้อที่อยากแก้เพิ่ม
            </legend>
            {closed.map((topic) => (
              <label
                className="flex min-h-11 items-center gap-3 text-sm"
                key={topic}
              >
                <input
                  checked={fields.includes(topic)}
                  className="size-5 accent-[#1F5C3A]"
                  onChange={(event) =>
                    setFields((current) =>
                      event.target.checked
                        ? REVISION_TOPICS.filter(
                            (key) => key === topic || current.includes(key),
                          )
                        : current.filter((key) => key !== topic),
                    )
                  }
                  type="checkbox"
                />
                {REVISION_TOPIC_LABELS[topic]}
              </label>
            ))}
          </fieldset>
          <label className="text-sm font-medium" htmlFor={`${id}-reason`}>
            เหตุผลถึงครู
          </label>
          <textarea
            className="border-border bg-background min-h-20 rounded-[10px] border px-3 py-2 text-base"
            id={`${id}-reason`}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น พบหลักฐานเพิ่มจากต้นจริง"
            value={reason}
          />
          {errorCode ? (
            <p className="text-sm text-[#8C1D18]" role="alert">
              {errorCode === "NETWORK"
                ? "ส่งคำขอไม่สำเร็จ เพราะเชื่อมต่อไม่ได้ ลองอีกครั้ง"
                : `ส่งคำขอไม่สำเร็จ · ${presentReviewError(errorCode).title}`}
            </p>
          ) : null}
          <Button
            disabled={
              !online ||
              mutation.isPending ||
              fields.length === 0 ||
              reason.trim().length < 5
            }
            type="submit"
            variant="outline"
          >
            {mutation.isPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            ส่งคำขอแก้เพิ่ม
          </Button>
        </form>
      ) : state.unlockRequests.some(
          (request) => request.status === "pending",
        ) ? (
        <p className="text-muted-foreground text-sm">
          มีคำขอที่รอครูตัดสินอยู่ · ส่งคำขอใหม่ได้เมื่อครูตัดสินแล้ว
        </p>
      ) : null}
    </section>
  );
}
