"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { cn } from "@/lib/utils";

import { PLANT_TRAIT_GROUPS } from "../contracts";
import {
  REVIEW_TEXT_LIMITS,
  TRAIT_MODES,
  TRAIT_MODE_LABELS,
  traitSummaryOf,
  type ReviewFormValues,
  type TraitMode,
} from "../review-form";

/**
 * Manual trait rows (REV-001, S-19): each trait is written as seen on the real
 * plant, or marked unsure / not visible, or left unchecked. Groups collapse so
 * the list stays short on a phone; state is shown with symbols and words.
 */
export function TraitChecklist({
  control,
  register,
  errors,
  readOnly,
}: {
  control: Control<ReviewFormValues>;
  register: UseFormRegister<ReviewFormValues>;
  errors: FieldErrors<ReviewFormValues>;
  readOnly: boolean;
}) {
  const traits = useWatch({ control, name: "traits" });
  const total = traitSummaryOf(traits ?? {});

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">
        ตรวจลักษณะกับต้นจริง
        <span className="text-muted-foreground ml-2 font-mono text-[13px] font-normal">
          {total.checked}/{total.total} ลักษณะ
        </span>
      </legend>
      <p className="text-muted-foreground text-[13px] leading-5">
        ดูจากต้นจริง ไม่ใช่เดา ถ้ามองไม่เห็นหรือไม่แน่ใจให้เลือกตามจริง
        ไม่ต้องตรวจครบทุกข้อก็ส่งได้
      </p>
      {PLANT_TRAIT_GROUPS.map((group) => {
        const keys = group.traits.map((trait) => trait.key);
        const summary = traitSummaryOf(traits ?? {}, keys);
        const groupHasError = keys.some((key) => errors.traits?.[key]);
        return (
          <TraitGroup
            groupKey={group.key}
            hasError={groupHasError}
            key={group.key}
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              <span>{group.label}</span>
              <span className="text-muted-foreground flex items-center gap-2 text-[13px] font-normal">
                <span className="font-mono">
                  {summary.checked}/{summary.total}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform group-open:rotate-180"
                />
              </span>
            </summary>
            <div className="grid gap-3 border-t px-3 pt-3 pb-3">
              {group.traits.map((trait) => (
                <TraitRow
                  error={errors.traits?.[trait.key]}
                  hint={trait.hint}
                  key={trait.key}
                  label={trait.label}
                  mode={traits?.[trait.key]?.mode ?? "skip"}
                  readOnly={readOnly}
                  register={register}
                  traitKey={trait.key}
                />
              ))}
            </div>
          </TraitGroup>
        );
      })}
    </fieldset>
  );
}

/** Opens (never closes) when a row inside it has an error to fix. */
function TraitGroup({
  groupKey,
  hasError,
  children,
}: {
  groupKey: string;
  hasError: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (hasError && ref.current) ref.current.open = true;
  }, [hasError]);
  return (
    <details
      className="border-border bg-background group rounded-xl border"
      data-trait-group={groupKey}
      ref={ref}
    >
      {children}
    </details>
  );
}

interface TraitRowError {
  value?: { message?: string };
  note?: { message?: string };
}

function TraitRow({
  traitKey,
  label,
  hint,
  mode,
  register,
  error,
  readOnly,
}: {
  traitKey: string;
  label: string;
  hint: string;
  mode: TraitMode;
  register: UseFormRegister<ReviewFormValues>;
  error: TraitRowError | undefined;
  readOnly: boolean;
}) {
  const id = useId();
  const valueError = error?.value?.message;
  const noteError = error?.note?.message;
  return (
    <div className="grid gap-2" data-trait={traitKey} data-trait-mode={mode}>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{label}</legend>
        <div className="grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-4">
          {TRAIT_MODES.map((option) => (
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border px-2 text-center text-[13px] font-semibold",
                "has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-2",
                option === mode
                  ? "border-[#1F5C3A] bg-[#E6F2EA] text-[#16432A]"
                  : "border-border bg-card text-foreground",
                readOnly && "cursor-default opacity-70",
              )}
              key={option}
            >
              <input
                className="sr-only"
                disabled={readOnly}
                type="radio"
                value={option}
                {...register(`traits.${traitKey}.mode`)}
              />
              {TRAIT_MODE_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "value" ? (
        <div className="grid gap-1">
          <label className="text-[13px] font-medium" htmlFor={`${id}-value`}>
            {label}ที่เห็นจากต้นจริง
          </label>
          <input
            aria-describedby={valueError ? `${id}-value-error` : undefined}
            aria-invalid={Boolean(valueError)}
            className="border-border bg-card read-only:bg-muted min-h-11 rounded-[10px] border px-3 text-base"
            id={`${id}-value`}
            maxLength={REVIEW_TEXT_LIMITS.traitValue + 40}
            placeholder={hint}
            readOnly={readOnly}
            type="text"
            {...register(`traits.${traitKey}.value`)}
          />
          {valueError ? (
            <p
              className="text-[13px] text-[#B3261E]"
              id={`${id}-value-error`}
              role="alert"
            >
              {valueError}
            </p>
          ) : null}
        </div>
      ) : null}
      {mode !== "skip" ? (
        <div className="grid gap-1">
          <label
            className="text-muted-foreground text-[13px]"
            htmlFor={`${id}-note`}
          >
            หมายเหตุ{label} (ถ้ามี)
          </label>
          <input
            aria-describedby={noteError ? `${id}-note-error` : undefined}
            aria-invalid={Boolean(noteError)}
            className="border-border bg-card read-only:bg-muted min-h-11 rounded-[10px] border px-3 text-base"
            id={`${id}-note`}
            readOnly={readOnly}
            type="text"
            {...register(`traits.${traitKey}.note`)}
          />
          {noteError ? (
            <p
              className="text-[13px] text-[#B3261E]"
              id={`${id}-note-error`}
              role="alert"
            >
              {noteError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
