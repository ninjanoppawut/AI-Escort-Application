"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Check, CircleAlert, Loader2, Save, WifiOff } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { formatClockTime } from "@/features/sessions/components/session-freshness";
import {
  useDeviceDraft,
  type DeviceDraft,
} from "@/lib/offline/use-device-draft";
import { cn } from "@/lib/utils";

import {
  conflictObservationOf,
  sendObservationJson,
} from "../../client/request";
import {
  fetchReviewState,
  presentReviewError,
  reviewErrorCodeOf,
  reviewInvalidFieldsOf,
} from "../client";
import { UNKNOWN_PLANT_NAMES } from "../contracts";
import {
  REVIEW_FIELD_LABELS,
  REVIEW_TEXT_FIELDS,
  REVIEW_TEXT_LIMITS,
  evidenceProgressOf,
  mergeReviewEdits,
  nameWarningOf,
  reviewFormSchema,
  reviewFormValuesOf,
  saveReviewResponseSchema,
  studentReviewRequestOf,
  type ReviewFormValues,
  type ReviewNames,
  type ReviewTextField,
  type SaveReviewResponse,
} from "../review-form";
import type { ReviewState } from "../contracts";
import { ReviewConflictDialog } from "./review-conflict-dialog";
import { TraitChecklist } from "./trait-checklist";

interface Conflict {
  latest: ReviewFormValues;
  local: ReviewFormValues;
  base: ReviewFormValues;
}

type SaveNote =
  | { kind: "updated" | "unchanged"; at: string }
  | { kind: "reapplied" | "latest"; version: number }
  | { kind: "restored" }
  | null;

const FIELD_HINTS: Record<ReviewTextField, string> = {
  commonName: "เช่น ชบา",
  scientificName: "เช่น Hibiscus rosa-sinensis",
  evidenceNote:
    "สิ่งที่เห็นจากต้นจริง เช่น ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง กลีบ 5 กลีบ",
  referenceNote: "เช่น หนังสือพรรณไม้ หน้า 12 หรือเว็บไซต์ที่ใช้เทียบ",
};

function cloneValues(values: ReviewFormValues): ReviewFormValues {
  return {
    ...values,
    traits: Object.fromEntries(
      Object.entries(values.traits).map(([key, trait]) => [key, { ...trait }]),
    ),
  };
}

/**
 * Manual plant entry (REV-001, UI_CONTRACTS.md §6): names, trait checks, the
 * evidence note, and an optional reference. Saves carry the version the form
 * was loaded from; a stale version opens the conflict dialog and nothing is
 * overwritten without the student's choice. Gaps save; the submit panel lists
 * what is still needed.
 */
export function ManualReviewForm({
  observationId,
  names,
  state,
  readOnly,
  online,
  onDirtyChange,
  onSaved,
  onChanged,
}: {
  observationId: string;
  names: ReviewNames;
  /** Review read model at the same version as `names`. */
  state: ReviewState;
  readOnly: boolean;
  online: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (result: SaveReviewResponse) => void;
  /** Something changed server-side (conflict, status); refetch. */
  onChanged: () => void;
}) {
  const formId = useId();
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [note, setNote] = useState<SaveNote>(null);
  const [traitsError, setTraitsError] = useState(false);
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: reviewFormValuesOf(names, state),
  });
  const { isDirty, errors } = form.formState;
  const commonName = useWatch({ control: form.control, name: "commonName" });
  const scientificName = useWatch({
    control: form.control,
    name: "scientificName",
  });
  const evidenceNote = useWatch({
    control: form.control,
    name: "evidenceNote",
  });
  const referenceNote = useWatch({
    control: form.control,
    name: "referenceNote",
  });
  const lengths: Record<ReviewTextField, number> = {
    commonName: (commonName ?? "").trim().length,
    scientificName: (scientificName ?? "").trim().length,
    evidenceNote: (evidenceNote ?? "").trim().length,
    referenceNote: (referenceNote ?? "").trim().length,
  };

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // P14-01: unsaved review text stays on this device between visits.
  const allValues = useWatch({ control: form.control });
  const restore = useCallback(
    (draft: DeviceDraft<ReviewFormValues>) => {
      const kept = cloneValues({
        ...draft.values,
        expectedVersion: draft.baseVersion,
      });
      const latest = reviewFormValuesOf(names, state);
      if (
        JSON.stringify({ ...kept, expectedVersion: 0 }) ===
        JSON.stringify({ ...latest, expectedVersion: 0 })
      ) {
        return;
      }
      form.reset(kept, { keepDefaultValues: true });
      setNote({ kind: "restored" });
    },
    [form, names, state],
  );
  const device = useDeviceDraft<ReviewFormValues>({
    key: `student-review:${observationId}`,
    scope: observationId,
    values: allValues as ReviewFormValues,
    dirty: isDirty && !readOnly,
    baseVersion: allValues.expectedVersion ?? state.version,
    onRestore: restore,
  });

  // Adopt a newer saved version only while nothing is unsaved; otherwise the
  // next save meets the conflict dialog.
  useEffect(() => {
    if (isDirty || conflict) return;
    if (form.getValues("expectedVersion") >= state.version) return;
    form.reset(reviewFormValuesOf(names, state));
  }, [conflict, form, isDirty, names, state]);

  const saveMutation = useMutation({
    mutationFn: (submitted: ReviewFormValues) =>
      sendObservationJson(
        "PUT",
        `/api/observations/${observationId}/student-review`,
        studentReviewRequestOf(submitted),
        saveReviewResponseSchema,
      ),
    onSuccess: (result, submitted) => {
      const current = cloneValues(form.getValues());
      const saved = {
        ...cloneValues(submitted),
        expectedVersion: result.version,
      };
      form.reset(saved);
      // Keep anything typed while the save was in flight as unsaved edits.
      const merged = mergeReviewEdits(submitted, current, saved);
      if (merged.reapplied.length > 0) {
        form.reset(merged.values, { keepDefaultValues: true });
      }
      setNote({ kind: result.outcome, at: new Date().toISOString() });
      onSaved(result);
    },
    onError: async (error, submitted) => {
      const code = reviewErrorCodeOf(error);
      if (code === "OBSERVATION_VERSION_CONFLICT") {
        const latestDraft = conflictObservationOf(error);
        const latestState = await fetchReviewState(observationId).catch(
          () => null,
        );
        const base = cloneValues(
          (form.formState.defaultValues as ReviewFormValues | undefined) ??
            submitted,
        );
        const latestNames = latestDraft?.draft ?? names;
        const latestVersion =
          latestDraft?.version ?? latestState?.version ?? base.expectedVersion;
        // Without the refreshed traits, the loaded ones stand in; the next
        // save still carries latestVersion and cannot overwrite silently.
        const latest = latestState
          ? reviewFormValuesOf(latestNames, {
              ...latestState,
              version: latestVersion,
            })
          : {
              ...cloneValues(base),
              commonName: latestNames.commonName ?? "",
              scientificName: latestNames.scientificName ?? "",
              evidenceNote: latestNames.evidenceNote ?? "",
              expectedVersion: latestVersion,
            };
        setConflict({
          latest,
          local: cloneValues(form.getValues()),
          base,
        });
        onChanged();
        return;
      }
      if (code === "VALIDATION_FAILED") {
        for (const field of reviewInvalidFieldsOf(error)) {
          if ((REVIEW_TEXT_FIELDS as readonly string[]).includes(field)) {
            form.setError(field as ReviewTextField, {
              message: "ข้อมูลช่องนี้ยังไม่ถูกต้อง",
            });
          }
          if (field === "traits") setTraitsError(true);
        }
      }
      if (
        code === "INVALID_STATUS_TRANSITION" ||
        code === "FORBIDDEN" ||
        code === "GROUP_NOT_ACTIVE" ||
        code === "SESSION_NOT_OPEN"
      ) {
        onChanged();
      }
    },
  });

  const onSubmit = form.handleSubmit((submitted) => {
    setNote(null);
    setTraitsError(false);
    saveMutation.mutate(submitted);
  });

  // Edits made offline are saved once the device reconnects (OBS-010).
  const wasOnline = useRef(online);
  useEffect(() => {
    const reconnected = !wasOnline.current && online;
    wasOnline.current = online;
    if (reconnected && isDirty && !readOnly && !saveMutation.isPending) {
      void onSubmit();
    }
  }, [isDirty, onSubmit, online, readOnly, saveMutation.isPending]);

  function reapply() {
    if (!conflict) return;
    const merged = mergeReviewEdits(
      conflict.base,
      conflict.local,
      conflict.latest,
    );
    form.reset(conflict.latest);
    form.reset(merged.values, { keepDefaultValues: true });
    setConflict(null);
    saveMutation.reset();
    setNote({ kind: "reapplied", version: conflict.latest.expectedVersion });
  }

  function adoptLatest() {
    if (!conflict) return;
    form.reset(conflict.latest);
    setConflict(null);
    saveMutation.reset();
    setNote({ kind: "latest", version: conflict.latest.expectedVersion });
  }

  const saving = saveMutation.isPending;
  const errorCode =
    saveMutation.isError && !conflict
      ? reviewErrorCodeOf(saveMutation.error)
      : null;
  const evidence = evidenceProgressOf(evidenceNote ?? "");

  let status: { icon: ReactNode; text: string; tone: "info" | "alert" };
  if (readOnly) {
    status = {
      icon: <CircleAlert aria-hidden="true" className="size-4 shrink-0" />,
      text: "แก้ไขไม่ได้ในตอนนี้ · ข้อมูลที่บันทึกไว้ยังอยู่ครบ",
      tone: "info",
    };
  } else if (saving) {
    status = {
      icon: (
        <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
      ),
      text: "กำลังบันทึก...",
      tone: "info",
    };
  } else if (errorCode === "NETWORK") {
    status = {
      icon: <WifiOff aria-hidden="true" className="size-4 shrink-0" />,
      text: "บันทึกไม่สำเร็จ เพราะเชื่อมต่อไม่ได้ · ข้อความของคุณยังอยู่ กดบันทึกอีกครั้ง",
      tone: "alert",
    };
  } else if (errorCode) {
    const presentation = presentReviewError(errorCode);
    status = {
      icon: <CircleAlert aria-hidden="true" className="size-4 shrink-0" />,
      text: `บันทึกไม่สำเร็จ · ${presentation.title} — ${presentation.description}`,
      tone: "alert",
    };
  } else if (!online) {
    status = {
      icon: <WifiOff aria-hidden="true" className="size-4 shrink-0" />,
      text:
        isDirty && device.savedAt
          ? "ออฟไลน์อยู่ · บันทึกในเครื่องนี้แล้ว จะส่งเข้าระบบเองเมื่อกลับมาออนไลน์"
          : "ออฟไลน์อยู่ · บันทึกได้เมื่อกลับมาออนไลน์ ข้อความยังอยู่ในหน้านี้",
      tone: "info",
    };
  } else if (note?.kind === "restored" && isDirty) {
    status = {
      icon: <CircleAlert aria-hidden="true" className="size-4 shrink-0" />,
      text: "กู้คืนข้อมูลที่ยังไม่ได้บันทึกจากเครื่องนี้ · ตรวจแล้วกดบันทึกข้อมูลพืช",
      tone: "info",
    };
  } else if (note?.kind === "reapplied") {
    status = {
      icon: <CircleAlert aria-hidden="true" className="size-4 shrink-0" />,
      text: `โหลดฉบับที่ ${note.version} แล้ว และใส่สิ่งที่คุณแก้กลับเข้าไป · ตรวจแล้วกดบันทึกข้อมูลพืช`,
      tone: "info",
    };
  } else if (isDirty) {
    status = {
      icon: <CircleAlert aria-hidden="true" className="size-4 shrink-0" />,
      text: device.savedAt
        ? "มีการแก้ไขที่ยังไม่บันทึก · เก็บไว้ในเครื่องนี้แล้ว"
        : "มีการแก้ไขที่ยังไม่บันทึก",
      tone: "info",
    };
  } else if (note?.kind === "updated") {
    status = {
      icon: <Check aria-hidden="true" className="size-4 shrink-0" />,
      text: `บันทึกแล้ว · ${formatClockTime(note.at)}`,
      tone: "info",
    };
  } else if (note?.kind === "unchanged") {
    status = {
      icon: <Check aria-hidden="true" className="size-4 shrink-0" />,
      text: "ไม่มีอะไรเปลี่ยน · ข้อมูลในระบบเป็นฉบับล่าสุดแล้ว",
      tone: "info",
    };
  } else if (note?.kind === "latest") {
    status = {
      icon: <Check aria-hidden="true" className="size-4 shrink-0" />,
      text: `ใช้ฉบับที่ ${note.version} จากระบบแล้ว`,
      tone: "info",
    };
  } else {
    status = {
      icon: <Check aria-hidden="true" className="size-4 shrink-0" />,
      text: "บันทึกในระบบแล้ว · ยังไม่มีการแก้ไข",
      tone: "info",
    };
  }

  function textField(field: ReviewTextField) {
    const id = `${formId}-${field}`;
    const error = errors[field]?.message;
    const limit = REVIEW_TEXT_LIMITS[field];
    const warning =
      field === "commonName"
        ? nameWarningOf(commonName ?? "")
        : field === "scientificName"
          ? nameWarningOf(scientificName ?? "")
          : null;
    const describedBy = [
      `${id}-count`,
      error ? `${id}-error` : null,
      warning ? `${id}-warning` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const shared = {
      "aria-describedby": describedBy,
      "aria-invalid": Boolean(error),
      id,
      placeholder: FIELD_HINTS[field],
      readOnly,
      ...form.register(field),
    };
    const multiline = field === "evidenceNote" || field === "referenceNote";
    return (
      <div className="grid gap-1.5" data-review-field={field} key={field}>
        <label className="text-sm font-medium" htmlFor={id}>
          {REVIEW_FIELD_LABELS[field]}
          {field !== "referenceNote" ? (
            <span aria-hidden="true" className="text-[#B3261E]">
              {" "}
              *
            </span>
          ) : null}
        </label>
        {multiline ? (
          <textarea
            className={cn(
              "border-border bg-background read-only:bg-muted rounded-[10px] border px-3 py-2 text-base leading-6",
              field === "evidenceNote" ? "min-h-32" : "min-h-20",
            )}
            {...shared}
          />
        ) : (
          <input
            autoCapitalize={field === "scientificName" ? "none" : undefined}
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
        {warning ? (
          <p
            className="flex items-start gap-1.5 text-[13px] leading-5 text-[#8C1D18]"
            id={`${id}-warning`}
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            บันทึกได้ แต่ส่งให้ครูไม่ได้ · ระบบถือว่ายังไม่ได้กรอก ถ้าพิมพ์ว่า{" "}
            {UNKNOWN_PLANT_NAMES.join(" · ")}
          </p>
        ) : null}
        <div className="flex items-start justify-between gap-3 text-[13px]">
          {error ? (
            <p className="text-[#B3261E]" id={`${id}-error`} role="alert">
              {error}
            </p>
          ) : field === "evidenceNote" ? (
            <span className="text-muted-foreground">
              ข้อความนี้คือสิ่งที่ครูใช้ตรวจ
            </span>
          ) : (
            <span />
          )}
          <span
            className={cn(
              "text-muted-foreground shrink-0 font-mono",
              lengths[field] > limit && "font-semibold text-[#B3261E]",
            )}
            id={`${id}-count`}
          >
            {field === "evidenceNote"
              ? `${evidence.length} / ${evidence.min} ขั้นต่ำ`
              : `${lengths[field]}/${limit}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="border-border bg-card rounded-xl border"
      data-manual-review="form"
    >
      <form className="grid gap-4 p-4" noValidate onSubmit={onSubmit}>
        <div>
          <h2 className="font-semibold" id={`${formId}-title`}>
            กรอกข้อมูลพืชเอง
          </h2>
          <p className="text-muted-foreground mt-1 text-[13px] leading-5">
            ตรวจกับต้นจริงแล้วกรอก · บันทึกได้แม้ยังไม่ครบ ช่องที่มี *
            ต้องครบก่อนส่งให้ครู
          </p>
        </div>

        {textField("commonName")}
        {textField("scientificName")}

        <TraitChecklist
          control={form.control}
          errors={errors}
          readOnly={readOnly}
          register={form.register}
        />
        {traitsError ? (
          <p className="text-[13px] text-[#B3261E]" role="alert">
            ข้อมูลลักษณะบางข้อยังไม่ถูกต้อง ตรวจแล้วบันทึกอีกครั้ง
          </p>
        ) : null}

        {textField("evidenceNote")}
        {textField("referenceNote")}

        <div className="border-border bg-card sticky bottom-0 -mx-4 -mb-4 grid gap-2 rounded-b-xl border-t p-4">
          <p
            className={cn(
              "flex items-start gap-2 text-sm leading-6",
              status.tone === "alert" && "font-medium text-[#8C1D18]",
            )}
            data-device-draft={isDirty && device.savedAt ? "kept" : "none"}
            data-review-save-state={
              readOnly
                ? "read_only"
                : saving
                  ? "saving"
                  : errorCode
                    ? "failed"
                    : !online
                      ? "offline"
                      : isDirty
                        ? "dirty"
                        : (note?.kind ?? "clean")
            }
            role="status"
          >
            <span className="mt-1">{status.icon}</span>
            <span suppressHydrationWarning>{status.text}</span>
          </p>
          <Button
            disabled={readOnly || saving || !online || !isDirty}
            size="lg"
            type="submit"
          >
            {saving ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-4" />
            )}
            {saving ? "กำลังบันทึก..." : "บันทึกข้อมูลพืช"}
          </Button>
        </div>
      </form>

      {conflict ? (
        <ReviewConflictDialog
          base={conflict.base}
          latestVersion={conflict.latest.expectedVersion}
          local={conflict.local}
          onReapply={reapply}
          onUseLatest={adoptLatest}
        />
      ) : null}
    </section>
  );
}
