"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  DRAFT_FIELDS,
  DRAFT_FIELD_LABELS,
  mergeDraftEdits,
  type DraftField,
  type DraftNotesValues,
} from "../draft-form";
import { OBSERVATION_ERROR_PRESENTATIONS } from "../errors";

function FieldValue({ field, value }: { field: DraftField; value: string }) {
  if (!value.trim()) {
    return <span className="text-muted-foreground">(ว่าง)</span>;
  }
  return (
    <span
      className={cn(
        "break-words whitespace-pre-line",
        field === "scientificName" && "font-serif italic",
      )}
    >
      {value}
    </span>
  );
}

/**
 * OBSERVATION_VERSION_CONFLICT (D-052, OBS-011): the save was refused because
 * another screen saved first. The student sees the latest saved values next
 * to their unsaved ones and chooses; nothing is overwritten without a choice.
 */
export function VersionConflictDialog({
  latestVersion,
  latest,
  local,
  base,
  onReapply,
  onUseLatest,
}: {
  latestVersion: number;
  latest: DraftNotesValues;
  local: DraftNotesValues;
  /** The values the student's edits started from. */
  base: DraftNotesValues;
  onReapply: () => void;
  onUseLatest: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const presentation =
    OBSERVATION_ERROR_PRESENTATIONS.OBSERVATION_VERSION_CONFLICT;
  const { reapplied } = mergeDraftEdits(base, local, latest);

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
          {presentation.description}
        </p>

        <ul aria-label="เทียบข้อมูล" className="mt-3 grid gap-3">
          {DRAFT_FIELDS.map((field) => {
            const edited = reapplied.includes(field);
            const differs = latest[field].trim() !== local[field].trim();
            return (
              <li
                className="border-border rounded-xl border p-3"
                data-field={field}
                key={field}
              >
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                  {DRAFT_FIELD_LABELS[field]}
                  {differs ? (
                    <span className="rounded-full border border-[#E8C58A] bg-[#FFF6E5] px-2 text-[12px] font-medium text-[#6B4204]">
                      ต่างกัน
                    </span>
                  ) : null}
                </p>
                <dl className="mt-2 grid gap-2 text-sm leading-6">
                  <div>
                    <dt className="text-muted-foreground text-[13px]">
                      ล่าสุดในระบบ (ฉบับที่ {latestVersion})
                    </dt>
                    <dd>
                      <FieldValue field={field} value={latest[field]} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-[13px]">
                      ของคุณ (ยังไม่บันทึก)
                    </dt>
                    <dd>
                      <FieldValue field={field} value={local[field]} />
                    </dd>
                  </div>
                </dl>
                <p className="text-muted-foreground mt-2 text-[13px]">
                  {edited
                    ? "ถ้าทำซ้ำ จะใส่ข้อความที่คุณแก้กลับเข้าไป"
                    : "คุณไม่ได้แก้ช่องนี้ จะใช้ค่าล่าสุดในระบบ"}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 grid gap-2">
          <Button onClick={onReapply} size="lg">
            <RefreshCw aria-hidden="true" className="size-4" />
            {presentation.action}
          </Button>
          <Button onClick={onUseLatest} size="lg" variant="outline">
            ใช้ฉบับล่าสุด ทิ้งที่แก้
          </Button>
          <p className="text-muted-foreground text-center text-[13px] leading-5">
            ยังไม่มีการบันทึกทับ · หลังทำซ้ำ ตรวจแล้วกด “บันทึกร่าง” อีกครั้ง
          </p>
        </div>
      </section>
    </div>
  );
}
