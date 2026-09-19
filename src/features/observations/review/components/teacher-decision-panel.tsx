"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  BadgeCheck,
  Ban,
  CircleHelp,
  Loader2,
  PencilLine,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { sendObservationJson } from "../../client/request";
import {
  presentReviewError,
  reviewErrorCodeOf,
  reviewInvalidFieldsOf,
} from "../client";
import { PLANT_TRAIT_GROUPS, isUnknownPlantName } from "../contracts";
import {
  FEEDBACK_MAX_CHARS,
  REVISION_TOPICS,
  REVISION_TOPIC_LABELS,
  reviewDecisionResponseSchema,
  type ReviewDecision,
  type RevisionTopic,
  type TeacherReviewDetail,
} from "../revision-contracts";

type Mode = "verify" | "correct" | "revision" | "unable" | "reject";

const MODE_DECISION: Record<Mode, ReviewDecision> = {
  verify: "verified",
  correct: "verified",
  revision: "revision_required",
  unable: "unable_to_verify",
  reject: "rejected",
};

const MODE_COPY: Record<Mode, { title: string; confirm: string }> = {
  verify: { title: "รับรองรายการนี้?", confirm: "รับรอง" },
  correct: { title: "แก้ไขและรับรอง", confirm: "บันทึกและรับรอง" },
  revision: { title: "ขอให้แก้ไข", confirm: "ส่งคำขอแก้ไข" },
  unable: { title: "ตรวจสอบไม่ได้", confirm: "บันทึกว่าตรวจสอบไม่ได้" },
  reject: { title: "ไม่รับรายการ", confirm: "ยืนยันไม่รับรายการ" },
};

const formSchema = z
  .object({
    verifiedCommonName: z.string(),
    verifiedScientificName: z.string(),
    corrections: z.record(z.string(), z.string()),
    feedback: z.string(),
    topicKeys: z.array(z.enum(REVISION_TOPICS)),
    mode: z.enum(["verify", "correct", "revision", "unable", "reject"]),
  })
  .superRefine((values, context) => {
    const feedback = values.feedback.trim();
    if (feedback.length > FEEDBACK_MAX_CHARS) {
      context.addIssue({
        code: "custom",
        path: ["feedback"],
        message: `ยาวเกิน ${FEEDBACK_MAX_CHARS} ตัวอักษร`,
      });
    }
    if (
      (values.mode === "revision" || values.mode === "reject") &&
      feedback === ""
    ) {
      context.addIssue({
        code: "custom",
        path: ["feedback"],
        message:
          values.mode === "reject"
            ? "ต้องพิมพ์เหตุผลก่อนยืนยัน"
            : "เขียนคำแนะนำถึงนักเรียน",
      });
    }
    if (values.mode === "revision" && values.topicKeys.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["topicKeys"],
        message: "เลือกอย่างน้อย 1 หัวข้อ",
      });
    }
    if (values.mode === "correct") {
      for (const field of [
        "verifiedCommonName",
        "verifiedScientificName",
      ] as const) {
        if (isUnknownPlantName(values[field])) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: "กรอกชื่อที่ถูกต้อง (ไม่ใช่ “ไม่ทราบ”)",
          });
        }
      }
    }
    for (const [key, value] of Object.entries(values.corrections)) {
      if (value.trim().length > 120) {
        context.addIssue({
          code: "custom",
          path: ["corrections", key],
          message: "ยาวเกิน 120 ตัวอักษร",
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

const ALL_TRAITS: ReadonlyArray<{ key: string; label: string; hint: string }> =
  PLANT_TRAIT_GROUPS.flatMap(
    (group): Array<{ key: string; label: string; hint: string }> => [
      ...group.traits,
    ],
  );

/**
 * Teacher decisions (REV-007, design T-12/T-12b/T-13/T-14). Every decision
 * carries the submitted version the teacher is looking at; a decision on a
 * version that changed meanwhile is refused and the view reloads (REV-012).
 */
export function TeacherDecisionPanel({
  review,
  online,
  onChanged,
}: {
  review: TeacherReviewDetail;
  online: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const latest = review.submissions[0];

  if (!latest || !review.latestSubmissionId) return null;

  return (
    <section
      aria-labelledby="decision-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      data-decision-panel=""
    >
      <div>
        <h2 className="font-semibold" id="decision-title">
          ผลการตรวจ · ฉบับที่ {latest.submissionNumber}
        </h2>
        <p className="text-muted-foreground mt-1 text-[13px] leading-5">
          ตัดสินฉบับที่แสดงอยู่เท่านั้น ถ้านักเรียนส่งฉบับใหม่
          ระบบจะให้โหลดใหม่ก่อน · ค่าที่นักเรียนกรอกไม่ถูกลบ
        </p>
      </div>
      {outcome ? (
        <p
          className="rounded-[10px] border border-[#F2B8B5] bg-[#FDECEA] px-3 py-2 text-sm leading-6 text-[#8C1D18]"
          data-decision-error=""
          role="alert"
        >
          {outcome}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={!online} onClick={() => setMode("verify")} size="lg">
          <BadgeCheck aria-hidden="true" className="size-4" />
          รับรอง
        </Button>
        <Button
          disabled={!online}
          onClick={() => setMode("correct")}
          size="lg"
          variant="outline"
        >
          <PencilLine aria-hidden="true" className="size-4" />
          แก้แล้วรับรอง
        </Button>
        <Button
          disabled={!online}
          onClick={() => setMode("revision")}
          size="lg"
          variant="outline"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          ขอให้แก้ไข
        </Button>
        <Button
          disabled={!online}
          onClick={() => setMode("unable")}
          size="lg"
          variant="outline"
        >
          <CircleHelp aria-hidden="true" className="size-4" />
          ตรวจสอบไม่ได้
        </Button>
        <Button
          className="col-span-2"
          disabled={!online}
          onClick={() => setMode("reject")}
          size="lg"
          variant="outline"
        >
          <Ban aria-hidden="true" className="size-4" />
          ไม่รับรายการ
        </Button>
      </div>
      {!online ? (
        <p className="text-muted-foreground text-sm" role="status">
          ออฟไลน์อยู่ · ตัดสินได้เมื่อกลับมาออนไลน์
        </p>
      ) : null}
      {mode ? (
        <DecisionDialog
          key={mode}
          mode={mode}
          onCancel={() => setMode(null)}
          onDone={(message) => {
            setMode(null);
            setOutcome(message);
            onChanged();
          }}
          review={review}
        />
      ) : null}
    </section>
  );
}

function DecisionDialog({
  mode,
  review,
  onCancel,
  onDone,
}: {
  mode: Mode;
  review: TeacherReviewDetail;
  onCancel: () => void;
  /** A refusal message to show, or null on success. */
  onDone: (message: string | null) => void;
}) {
  const titleId = useId();
  const formId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const latest = review.submissions[0]!;
  const recordedTraits = new Set(
    Array.isArray(latest.verification.traits)
      ? (latest.verification.traits as Array<{ traitKey?: unknown }>)
          .map((trait) => trait.traitKey)
          .filter((key): key is string => typeof key === "string")
      : [],
  );
  const student = {
    verifiedCommonName: latest.commonName,
    verifiedScientificName: latest.scientificName,
  };
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...student,
      corrections: {},
      feedback: "",
      topicKeys: [],
      mode,
    },
  });
  const { errors } = form.formState;
  const topicKeys = useWatch({ control: form.control, name: "topicKeys" });
  const feedback = useWatch({ control: form.control, name: "feedback" });

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const corrections = Object.fromEntries(
        Object.entries(values.corrections)
          .map(([key, value]) => [key, value.trim()] as const)
          .filter(([, value]) => value !== ""),
      );
      return sendObservationJson(
        "POST",
        `/api/observations/${review.observationId}/review`,
        {
          submissionId: review.latestSubmissionId,
          decision: MODE_DECISION[mode],
          verifiedCommonName:
            mode === "correct" ? values.verifiedCommonName : null,
          verifiedScientificName:
            mode === "correct" ? values.verifiedScientificName : null,
          correctedTraits: mode === "correct" ? corrections : {},
          feedback: values.feedback,
          // Catalogue order keeps a retried decision byte-identical.
          topicKeys:
            mode === "revision"
              ? REVISION_TOPICS.filter((topic) =>
                  values.topicKeys.includes(topic),
                )
              : [],
        },
        reviewDecisionResponseSchema,
      );
    },
    onSuccess: () => onDone(null),
    onError: (error) => {
      const code = reviewErrorCodeOf(error);
      if (code === "VALIDATION_FAILED") {
        for (const field of reviewInvalidFieldsOf(error)) {
          if (field === "feedback" || field === "topicKeys") {
            form.setError(field, { message: "ข้อมูลช่องนี้ยังไม่ถูกต้อง" });
          }
        }
        return;
      }
      if (code === "NETWORK") return;
      onDone(
        code === "OBSERVATION_VERSION_CONFLICT" ||
          code === "INVALID_STATUS_TRANSITION"
          ? "ตัดสินไม่สำเร็จ · รายการนี้มีการตัดสินหรือนักเรียนส่งฉบับใหม่แล้ว โหลดข้อมูลล่าสุดแล้ว ตรวจอีกครั้ง"
          : `ตัดสินไม่สำเร็จ · ${presentReviewError(code).title}`,
      );
    },
  });

  const networkFailed =
    mutation.isError && reviewErrorCodeOf(mutation.error) === "NETWORK";
  const copy = MODE_COPY[mode];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,33,28,.45)] sm:items-center">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-card flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-y-auto rounded-t-[20px] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(22,33,28,.14)] sm:rounded-[20px]"
        data-decision-mode={mode}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !mutation.isPending) onCancel();
        }}
        role="dialog"
      >
        <h2 className="text-lg font-semibold" id={titleId}>
          {copy.title}
        </h2>
        <form
          className="mt-3 grid gap-4"
          id={formId}
          noValidate
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          {mode === "verify" ? (
            <p className="text-sm leading-6">
              รับรองว่า{" "}
              <span className="font-semibold">{latest.commonName}</span> ·{" "}
              <i className="font-serif" lang="la">
                {latest.scientificName}
              </i>{" "}
              ตรงกับหลักฐาน
            </p>
          ) : null}
          {mode === "unable" ? (
            <p className="text-sm leading-6">
              หลักฐานไม่พอจะชี้ชนิด เช่น ภาพไม่ชัดหรือไม่มีส่วนสำคัญ
              ไม่ใช่การตัดสินว่าผิด
            </p>
          ) : null}
          {mode === "reject" ? (
            <p className="flex items-start gap-2 text-sm leading-6 text-[#8C1D18]">
              <TriangleAlert
                aria-hidden="true"
                className="mt-1 size-4 shrink-0"
              />
              หมุดจะไม่ขึ้นบนแผนที่ผลลัพธ์ · ต้องพิมพ์เหตุผลก่อนยืนยัน
            </p>
          ) : null}

          {mode === "correct" ? (
            <>
              {(["verifiedCommonName", "verifiedScientificName"] as const).map(
                (field) => (
                  <div className="grid gap-1.5" key={field}>
                    <label
                      className="text-sm font-medium"
                      htmlFor={`${formId}-${field}`}
                    >
                      {field === "verifiedCommonName"
                        ? "ชื่อไทยหรือชื่อทั่วไปที่ถูกต้อง"
                        : "ชื่อวิทยาศาสตร์ที่ถูกต้อง"}
                    </label>
                    <input
                      aria-invalid={Boolean(errors[field])}
                      className={cn(
                        "border-border bg-background min-h-12 rounded-[10px] border px-3 text-base",
                        field === "verifiedScientificName" &&
                          "font-serif italic",
                      )}
                      id={`${formId}-${field}`}
                      lang={
                        field === "verifiedScientificName" ? "la" : undefined
                      }
                      type="text"
                      {...form.register(field)}
                    />
                    <p className="text-muted-foreground text-[13px]">
                      นักเรียนกรอก:{" "}
                      {field === "verifiedCommonName" ? (
                        latest.commonName
                      ) : (
                        <i className="font-serif" lang="la">
                          {latest.scientificName}
                        </i>
                      )}
                    </p>
                    {errors[field] ? (
                      <p className="text-[13px] text-[#B3261E]" role="alert">
                        {errors[field]?.message}
                      </p>
                    ) : null}
                  </div>
                ),
              )}
              <details className="border-border rounded-xl border">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
                  แก้ลักษณะ (ถ้ามี)
                </summary>
                <div className="grid gap-3 border-t p-3">
                  {ALL_TRAITS.map((trait) => (
                    <div className="grid gap-1" key={trait.key}>
                      <label
                        className="text-[13px] font-medium"
                        htmlFor={`${formId}-trait-${trait.key}`}
                      >
                        {trait.label}
                        {recordedTraits.has(trait.key) ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · นักเรียนตรวจแล้ว
                          </span>
                        ) : null}
                      </label>
                      <input
                        className="border-border bg-background min-h-11 rounded-[10px] border px-3 text-base"
                        id={`${formId}-trait-${trait.key}`}
                        placeholder={trait.hint}
                        type="text"
                        {...form.register(`corrections.${trait.key}`)}
                      />
                    </div>
                  ))}
                </div>
              </details>
              <button
                className="text-left text-sm font-medium text-[#1F5C3A] underline underline-offset-2"
                onClick={() =>
                  form.reset({
                    ...form.getValues(),
                    ...student,
                    corrections: {},
                  })
                }
                type="button"
              >
                คืนค่าที่นักเรียนกรอก
              </button>
              <p className="text-muted-foreground text-[13px]">
                ค่าเดิมของนักเรียนไม่ถูกลบ ครูและนักเรียนเห็นทั้งสองค่าเคียงกัน
              </p>
            </>
          ) : null}

          {mode === "revision" ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                หัวข้อที่ต้องแก้ <span className="text-[#B3261E]">*</span>
              </legend>
              {REVISION_TOPICS.map((topic) => (
                <label
                  className="border-border flex min-h-11 items-center gap-3 rounded-[10px] border px-3 text-sm"
                  key={topic}
                >
                  <input
                    className="size-5 accent-[#1F5C3A]"
                    type="checkbox"
                    value={topic}
                    {...form.register("topicKeys")}
                  />
                  {REVISION_TOPIC_LABELS[topic as RevisionTopic]}
                </label>
              ))}
              <p
                className={cn(
                  "text-[13px]",
                  errors.topicKeys ? "text-[#B3261E]" : "text-muted-foreground",
                )}
                role={errors.topicKeys ? "alert" : undefined}
              >
                {errors.topicKeys?.message ??
                  `เลือกแล้ว ${topicKeys?.length ?? 0} หัวข้อ · นักเรียนแก้ได้เฉพาะหัวข้อที่เลือก`}
              </p>
            </fieldset>
          ) : null}

          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor={`${formId}-feedback`}
            >
              {mode === "reject"
                ? "เหตุผลที่ไม่รับ"
                : mode === "revision"
                  ? "คำแนะนำถึงนักเรียน"
                  : "ข้อความถึงนักเรียน (ถ้ามี)"}
              {mode === "revision" || mode === "reject" ? (
                <span className="text-[#B3261E]"> *</span>
              ) : null}
            </label>
            <textarea
              aria-invalid={Boolean(errors.feedback)}
              className="border-border bg-background min-h-24 rounded-[10px] border px-3 py-2 text-base leading-6"
              id={`${formId}-feedback`}
              {...form.register("feedback")}
            />
            <div className="flex justify-between gap-3 text-[13px]">
              {errors.feedback ? (
                <p className="text-[#B3261E]" role="alert">
                  {errors.feedback.message}
                </p>
              ) : (
                <span className="text-muted-foreground">
                  ส่งถึงเจ้าของรายการเท่านั้น
                </span>
              )}
              <span className="text-muted-foreground font-mono">
                {(feedback ?? "").trim().length}/{FEEDBACK_MAX_CHARS}
              </span>
            </div>
          </div>

          {networkFailed ? (
            <p className="text-sm text-[#8C1D18]" role="alert">
              ยังไม่รู้ว่าบันทึกถึงระบบหรือไม่ เพราะเชื่อมต่อไม่ได้ ·
              กดอีกครั้งได้ ระบบจะไม่บันทึกซ้ำ
            </p>
          ) : null}

          <div className="grid gap-2">
            <Button disabled={mutation.isPending} size="lg" type="submit">
              {mutation.isPending ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              {copy.confirm}
            </Button>
            <button
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              disabled={mutation.isPending}
              onClick={onCancel}
              ref={cancelRef}
              type="button"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
