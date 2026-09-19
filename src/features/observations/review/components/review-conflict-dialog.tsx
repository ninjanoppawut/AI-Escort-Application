"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";

import { reviewErrorPresentation } from "../errors";
import {
  editedReviewEntries,
  reviewEntryLabel,
  type ReviewFormValues,
} from "../review-form";

/**
 * OBSERVATION_VERSION_CONFLICT on the manual review (D-052): another screen
 * saved first. The student sees which entries they changed and chooses to
 * re-apply them onto the latest version or to take the latest as it is.
 */
export function ReviewConflictDialog({
  latestVersion,
  base,
  local,
  onReapply,
  onUseLatest,
}: {
  latestVersion: number;
  base: ReviewFormValues;
  local: ReviewFormValues;
  onReapply: () => void;
  onUseLatest: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const presentation = reviewErrorPresentation("OBSERVATION_VERSION_CONFLICT");
  const edited = editedReviewEntries(base, local);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,33,28,.45)] sm:items-center">
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-card flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-t-[20px] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(22,33,28,.14)] sm:rounded-[20px]"
        role="alertdialog"
      >
        <h2
          className="flex items-start gap-2 text-lg font-semibold outline-none"
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
        >
          <TriangleAlert aria-hidden="true" className="mt-1 size-5 shrink-0" />
          {presentation.title}
        </h2>
        <p className="mt-1 text-sm leading-6" id={descriptionId}>
          มีการบันทึกข้อมูลพืชนี้จากหน้าจออื่น (ฉบับที่ {latestVersion})
          ยังไม่มีการบันทึกทับ เลือกว่าจะทำอย่างไรกับสิ่งที่คุณแก้
        </p>

        <div className="border-border mt-3 rounded-xl border p-3 text-sm">
          <p className="font-semibold">สิ่งที่คุณแก้ (ยังไม่บันทึก)</p>
          {edited.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 leading-6">
              {edited.map((entry) => (
                <li data-entry={entry} key={entry}>
                  {reviewEntryLabel(entry)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-1">ไม่มี</p>
          )}
          <p className="text-muted-foreground mt-2 text-[13px] leading-5">
            ช่องที่คุณไม่ได้แก้จะใช้ค่าล่าสุดในระบบเสมอ
          </p>
        </div>

        <div className="mt-4 grid gap-2">
          <Button onClick={onReapply} size="lg">
            <RefreshCw aria-hidden="true" className="size-4" />
            {presentation.action}
          </Button>
          <Button onClick={onUseLatest} size="lg" variant="outline">
            ใช้ฉบับล่าสุด ทิ้งที่แก้
          </Button>
          <p className="text-muted-foreground text-center text-[13px] leading-5">
            หลังทำซ้ำ ตรวจแล้วกด “บันทึกข้อมูลพืช” อีกครั้ง
          </p>
        </div>
      </section>
    </div>
  );
}
