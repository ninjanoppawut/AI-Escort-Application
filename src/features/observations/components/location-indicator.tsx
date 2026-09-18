import { Flag, Loader2, LocateFixed, TriangleAlert } from "lucide-react";

import { accuracyLabel } from "@/features/sessions/live-view";
import { cn } from "@/lib/utils";

import { captureQuality } from "../capture";

export type LocationIndicatorState =
  | { kind: "locating"; elapsedS: number }
  | { kind: "fix"; accuracyM: number }
  | { kind: "missing" };

/**
 * GPS quality as text, icon, and shape, never color alone. `capture` is the
 * live capture step (advice to wait); `record` is a stored draft.
 */
export function LocationIndicator({
  state,
  context,
  className,
}: {
  state: LocationIndicatorState;
  context: "capture" | "record";
  className?: string;
}) {
  if (state.kind === "locating") {
    return (
      <p
        className={cn(
          "border-border bg-card inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[15px] font-medium",
          className,
        )}
        data-location-quality="locating"
        role="status"
      >
        <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
        กำลังหาตำแหน่ง...
        {/* Hidden from the live region so it is not announced every second. */}
        <span aria-hidden="true" className="font-mono text-[13px]">
          {state.elapsedS} วินาที
        </span>
      </p>
    );
  }

  if (state.kind === "missing") {
    return (
      <p
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-[4px] border border-dashed border-[#6B4204] bg-[#FFF6E5] px-3 text-[15px] font-semibold text-[#5C3A04]",
          className,
        )}
        data-location-quality="missing"
      >
        <Flag aria-hidden="true" className="size-4 shrink-0" />
        ไม่มีพิกัด
      </p>
    );
  }

  const label = accuracyLabel(state.accuracyM);
  if (captureQuality(state.accuracyM) === "poor") {
    return (
      <p
        className={cn(
          "flex items-start gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] px-3 py-2 text-[15px] leading-6 font-semibold text-[#5C3A04]",
          className,
        )}
        data-location-quality="poor"
      >
        <TriangleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
        <span>
          {context === "capture"
            ? `สัญญาณตำแหน่งอ่อน (${label}) — รอสักครู่ให้แม่นขึ้น`
            : `สัญญาณตำแหน่งอ่อน (${label})`}
        </span>
      </p>
    );
  }

  return (
    <p
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full border border-[#B5DCC2] bg-[#E8F5EC] px-3 text-[15px] font-semibold text-[#14532D]",
        className,
      )}
      data-location-quality="good"
    >
      <LocateFixed aria-hidden="true" className="size-4 shrink-0" />
      <span className="font-mono">{label}</span>
      <span>· แม่นยำดี</span>
    </p>
  );
}
