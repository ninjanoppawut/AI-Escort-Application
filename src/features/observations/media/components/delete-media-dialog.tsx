"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { MediaCategory } from "../contracts";
import { MEDIA_COPY } from "./media-copy";

/**
 * Confirms deleting an uploaded image. The destructive button names the real
 * verb; focus starts on the safe choice and Escape keeps the image.
 */
export function DeleteMediaDialog({
  index,
  category,
  busy,
  onConfirm,
  onCancel,
}: {
  index: number;
  category: MediaCategory | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,33,28,.45)] sm:items-center">
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-card w-full max-w-[480px] rounded-t-[20px] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(22,33,28,.14)] sm:rounded-[20px]"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        role="alertdialog"
      >
        <h2
          className="flex items-start gap-2 text-lg font-semibold"
          id={titleId}
        >
          <Trash2 aria-hidden="true" className="mt-1 size-5 shrink-0" />
          {MEDIA_COPY.deleteDialog.title}
        </h2>
        <p className="mt-1 text-sm leading-6" id={descriptionId}>
          {MEDIA_COPY.deleteDialog.body(index, category)}
        </p>
        <div className="mt-4 grid gap-2">
          <Button
            className="bg-[#B3261E] text-white hover:bg-[#8C1D18]"
            disabled={busy}
            onClick={onConfirm}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {MEDIA_COPY.deleteDialog.confirm}
          </Button>
          <button
            className={cn(buttonVariants({ variant: "outline" }))}
            onClick={onCancel}
            ref={keepRef}
            type="button"
          >
            {MEDIA_COPY.deleteDialog.keep}
          </button>
        </div>
      </section>
    </div>
  );
}
