"use client";

import { Check } from "lucide-react";
import { useId } from "react";

import { cn } from "@/lib/utils";

import {
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_LABELS,
  type MediaCategory,
} from "../contracts";

/**
 * Image category chips as a native radio group: arrow keys move the choice,
 * the checked chip shows a tick as well as a fill, and a disabled group keeps
 * its labels legible. Choosing only changes the pending value; the caller
 * commits it with an explicit action.
 */
export function ImageCategoryPicker({
  legend,
  value,
  onChange,
  disabled = false,
  describedBy,
}: {
  legend: string;
  value: MediaCategory | null;
  onChange: (category: MediaCategory) => void;
  disabled?: boolean;
  describedBy?: string | undefined;
}) {
  const id = useId();
  const legendId = `${id}-legend`;
  const name = `media-category-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      aria-labelledby={legendId}
      className="grid gap-2"
      role="radiogroup"
    >
      <p className="text-[13px] leading-5 font-semibold" id={legendId}>
        {legend}
      </p>
      <div className="flex flex-wrap gap-2">
        {MEDIA_CATEGORIES.map((category) => {
          const inputId = `${name}-${category}`;
          const checked = value === category;
          return (
            <span className="relative" key={category}>
              <input
                checked={checked}
                className="peer sr-only"
                data-category={category}
                disabled={disabled}
                id={inputId}
                name={name}
                onChange={() => onChange(category)}
                type="radio"
                value={category}
              />
              <label
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors select-none",
                  "peer-focus-visible:ring-ring peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2",
                  checked
                    ? "border-[#14472F] bg-[#14472F] text-white"
                    : "border-border bg-card text-foreground",
                  disabled && "cursor-not-allowed border-dashed",
                )}
                htmlFor={inputId}
              >
                {checked ? (
                  <Check aria-hidden="true" className="size-4 shrink-0" />
                ) : null}
                {MEDIA_CATEGORY_LABELS[category]}
              </label>
            </span>
          );
        })}
      </div>
    </div>
  );
}
