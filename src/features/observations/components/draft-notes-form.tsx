"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Check, CircleAlert, Loader2, Save, WifiOff } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { formatClockTime } from "@/features/sessions/components/session-freshness";
import { cn } from "@/lib/utils";

import {
  conflictObservationOf,
  invalidFieldsOf,
  observationErrorCodeOf,
  presentObservationError,
  sendObservationJson,
} from "../client/request";
import { DRAFT_FIELD_LIMITS, type ObservationDraft } from "../contracts";
import {
  DRAFT_FIELDS,
  DRAFT_FIELD_LABELS,
  draftFormValuesOf,
  draftNotesFormSchema,
  draftNotesValuesOf,
  mergeDraftEdits,
  updateDraftRequestOf,
  updateObservationDraftResponseSchema,
  type DraftField,
  type DraftNotesFormValues,
  type DraftNotesValues,
  type UpdateObservationDraftResponse,
} from "../draft-form";
import { OBSERVATION_BLOCKED_REASON_LABELS } from "../errors";
import { VersionConflictDialog } from "./version-conflict-dialog";

interface Conflict {
  latest: ObservationDraft;
  local: DraftNotesValues;
  base: DraftNotesValues;
}

type SaveNote =
  | { kind: "updated" | "unchanged"; at: string }
  | { kind: "reapplied"; version: number }
  | { kind: "latest"; version: number }
  | null;

function pickValues(values: Partial<DraftNotesValues> | undefined) {
  return {
    commonName: values?.commonName ?? "",
    scientificName: values?.scientificName ?? "",
    evidenceNote: values?.evidenceNote ?? "",
  };
}

const FIELD_HINTS: Record<DraftField, string> = {
  commonName: "เช่น มะม่วง",
  scientificName: "เช่น Mangifera indica",
  evidenceNote: "สิ่งที่เห็นจากต้นจริง เช่น ใบเดี่ยว เรียงสลับ ขยี้แล้วมีกลิ่น",
};

/**
 * Owner-only draft notes (commonName, scientificName, evidenceNote). Saves
 * carry the version the form was loaded from; a stale version opens the
 * conflict dialog and nothing is overwritten without the student's choice.
 */
export function DraftNotesForm({
  observation,
  online,
  onSaved,
  onConflict,
  onStatusChanged,
}: {
  observation: ObservationDraft;
  online: boolean;
  onSaved: (
    result: UpdateObservationDraftResponse,
    values: DraftNotesValues,
  ) => void;
  /** The refreshed record the conflict returned. */
  onConflict: (latest: ObservationDraft) => void;
  /** The draft became read-only or otherwise changed state; refetch it. */
  onStatusChanged: () => void;
}) {
  const formId = useId();
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [note, setNote] = useState<SaveNote>(null);
  const form = useForm<DraftNotesFormValues>({
    resolver: zodResolver(draftNotesFormSchema),
    defaultValues: draftFormValuesOf(observation),
  });
  const { isDirty, errors } = form.formState;
  const values = useWatch({ control: form.control });
  const readOnly = !observation.permissions.canEdit;

  // Adopt a newer saved version only while the student has nothing unsaved;
  // otherwise the next save meets the conflict dialog.
  useEffect(() => {
    if (isDirty || conflict) return;
    if (form.getValues("expectedVersion") >= observation.version) return;
    form.reset(draftFormValuesOf(observation));
  }, [conflict, form, isDirty, observation]);

  const saveMutation = useMutation({
    mutationFn: (submitted: DraftNotesFormValues) =>
      sendObservationJson(
        "PUT",
        `/api/observations/${observation.id}/draft`,
        updateDraftRequestOf(submitted),
        updateObservationDraftResponseSchema,
      ),
    onSuccess: (result, submitted) => {
      const current = form.getValues();
      const saved = pickValues(submitted);
      // Keep anything typed while the save was in flight as unsaved edits.
      form.reset({ ...saved, expectedVersion: result.version });
      for (const field of DRAFT_FIELDS) {
        if (current[field] !== saved[field]) {
          form.setValue(field, current[field], { shouldDirty: true });
        }
      }
      setNote({ kind: result.outcome, at: new Date().toISOString() });
      onSaved(result, saved);
    },
    onError: (error) => {
      const latest = conflictObservationOf(error);
      if (latest) {
        setConflict({
          latest,
          local: pickValues(form.getValues()),
          base: pickValues(form.formState.defaultValues),
        });
        onConflict(latest);
        return;
      }
      const code = observationErrorCodeOf(error);
      if (code === "VALIDATION_FAILED") {
        for (const field of invalidFieldsOf(error)) {
          if ((DRAFT_FIELDS as readonly string[]).includes(field)) {
            form.setError(field as DraftField, {
              message: "ข้อมูลช่องนี้ยังไม่ถูกต้อง",
            });
          }
        }
      }
      if (code === "INVALID_STATUS_TRANSITION" || code === "FORBIDDEN") {
        onStatusChanged();
      }
    },
  });

  const onSubmit = form.handleSubmit((submitted) => {
    setNote(null);
    saveMutation.mutate(submitted);
  });

  function reapply() {
    if (!conflict) return;
    const latestValues = draftNotesValuesOf(conflict.latest);
    const merged = mergeDraftEdits(conflict.base, conflict.local, latestValues);
    form.reset(draftFormValuesOf(conflict.latest));
    for (const field of merged.reapplied) {
      form.setValue(field, merged.values[field], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setConflict(null);
    saveMutation.reset();
    setNote({ kind: "reapplied", version: conflict.latest.version });
  }

  function adoptLatest() {
    if (!conflict) return;
    form.reset(draftFormValuesOf(conflict.latest));
    setConflict(null);
    saveMutation.reset();
    setNote({ kind: "latest", version: conflict.latest.version });
  }

  const saving = saveMutation.isPending;
  const errorCode =
    saveMutation.isError && !conflict
      ? observationErrorCodeOf(saveMutation.error)
      : null;
  const blockedReason = observation.permissions.blockedReason
    ? (OBSERVATION_BLOCKED_REASON_LABELS[
        observation.permissions.blockedReason
      ] ?? "ร่างนี้แก้ไขไม่ได้แล้ว")
    : "ร่างนี้แก้ไขไม่ได้แล้ว";

  let status: { icon: ReactNode; text: string; tone: "info" | "alert" };
  if (readOnly) {
    status = {
      icon: <CircleAlert aria-hidden="true" className="size-4 shrink-0" />,
      text: `แก้ไขไม่ได้ · ${blockedReason}`,
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
    const presentation = presentObservationError(errorCode);
    status = {
      icon: <CircleAlert aria-hidden="true" className="size-4 shrink-0" />,
      text: `บันทึกไม่สำเร็จ · ${presentation.title} — ${presentation.description}`,
      tone: "alert",
    };
  } else if (!online) {
    status = {
      icon: <WifiOff aria-hidden="true" className="size-4 shrink-0" />,
      text: "ออฟไลน์อยู่ · บันทึกได้เมื่อกลับมาออนไลน์ ข้อความยังอยู่ในหน้านี้",
      tone: "info",
    };
  } else if (note?.kind === "reapplied") {
    status = {
      icon: <CircleAlert aria-hidden="true" className="size-4 shrink-0" />,
      text: `โหลดฉบับที่ ${note.version} แล้ว และใส่ข้อความที่คุณแก้กลับเข้าไป · ตรวจแล้วกดบันทึกร่าง`,
      tone: "info",
    };
  } else if (isDirty) {
    status = {
      icon: <CircleAlert aria-hidden="true" className="size-4 shrink-0" />,
      text: "มีการแก้ไขที่ยังไม่บันทึก",
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
      text: "ไม่มีอะไรเปลี่ยน · ร่างในระบบเป็นฉบับล่าสุดแล้ว",
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

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className="border-border bg-card rounded-xl border"
    >
      <form className="grid gap-4 p-4" noValidate onSubmit={onSubmit}>
        <div>
          <h2 className="font-semibold" id={`${formId}-title`}>
            ข้อมูลพืช
          </h2>
          <p className="text-muted-foreground mt-1 text-[13px] leading-5">
            กรอกไม่ครบก็บันทึกร่างได้ ต้องครบทั้ง 3 ช่องก่อนส่งให้ครู
          </p>
        </div>

        {DRAFT_FIELDS.map((field) => {
          const id = `${formId}-${field}`;
          const length = (values[field] ?? "").trim().length;
          const limit = DRAFT_FIELD_LIMITS[field];
          const error = errors[field]?.message;
          const shared = {
            "aria-describedby": `${id}-count${error ? ` ${id}-error` : ""}`,
            "aria-invalid": Boolean(error),
            id,
            placeholder: FIELD_HINTS[field],
            readOnly,
            ...form.register(field),
          };
          return (
            <div className="grid gap-1.5" key={field}>
              <label className="text-sm font-medium" htmlFor={id}>
                {DRAFT_FIELD_LABELS[field]}
              </label>
              {field === "evidenceNote" ? (
                <textarea
                  className="border-border bg-background read-only:bg-muted min-h-32 rounded-[10px] border px-3 py-2 text-base leading-6"
                  {...shared}
                />
              ) : (
                <input
                  autoCapitalize={
                    field === "scientificName" ? "none" : undefined
                  }
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
              <div className="flex items-start justify-between gap-3 text-[13px]">
                {error ? (
                  <p className="text-[#B3261E]" id={`${id}-error`} role="alert">
                    {error}
                  </p>
                ) : (
                  <span />
                )}
                <span
                  className={cn(
                    "text-muted-foreground shrink-0 font-mono",
                    length > limit && "font-semibold text-[#B3261E]",
                  )}
                  id={`${id}-count`}
                >
                  {length}/{limit}
                </span>
              </div>
            </div>
          );
        })}

        <div className="border-border bg-card sticky bottom-0 -mx-4 -mb-4 grid gap-2 rounded-b-xl border-t p-4">
          <p
            className={cn(
              "flex items-start gap-2 text-sm leading-6",
              status.tone === "alert" && "font-medium text-[#8C1D18]",
            )}
            data-save-state={
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
            {saving ? "กำลังบันทึก..." : "บันทึกร่าง"}
          </Button>
        </div>
      </form>

      {conflict ? (
        <VersionConflictDialog
          base={conflict.base}
          latest={draftNotesValuesOf(conflict.latest)}
          latestVersion={conflict.latest.version}
          local={conflict.local}
          onReapply={reapply}
          onUseLatest={adoptLatest}
        />
      ) : null}
    </section>
  );
}
