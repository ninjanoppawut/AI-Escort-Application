import {
  Clock3,
  Flag,
  ListStart,
  Navigation,
  Pause,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { SessionGroupStatus } from "../contracts";

type SessionGroupShape =
  "circle" | "diamond" | "pointed-circle" | "square" | "hexagon";

// Thai label, semantic color, icon, and shape follow UI_CONTRACTS.md §2 (D-053).
export const SESSION_GROUP_STATUS_TOKENS: Record<
  SessionGroupStatus,
  {
    label: string;
    icon: LucideIcon;
    shape: SessionGroupShape;
    badgeClassName: string;
    markerClassName: string;
  }
> = {
  waiting: {
    label: "กำลังรอ",
    icon: Clock3,
    shape: "circle",
    badgeClassName: "border-[#D4D7DB] bg-[#F1F2F3] text-[#3F4652]",
    markerClassName: "fill-[#6B7280]",
  },
  ready: {
    label: "กลุ่มถัดไป",
    icon: ListStart,
    shape: "diamond",
    badgeClassName: "border-[#BFD0F5] bg-[#EEF3FF] text-[#1E3A8A]",
    markerClassName: "fill-[#2F5FD0]",
  },
  active: {
    label: "กำลังสำรวจ",
    icon: Navigation,
    shape: "pointed-circle",
    badgeClassName: "border-[#B5DCC2] bg-[#E8F5EC] text-[#14532D]",
    markerClassName: "fill-[#1E7A45]",
  },
  paused: {
    label: "หยุดชั่วคราว",
    icon: Pause,
    shape: "square",
    badgeClassName: "border-[#E8C58A] bg-[#FFF6E5] text-[#6B4204]",
    markerClassName: "fill-[#B7791F]",
  },
  completed: {
    label: "สำรวจเสร็จแล้ว",
    icon: Flag,
    shape: "hexagon",
    badgeClassName: "border-[#CBD3DC] bg-[#EEF1F4] text-[#334155]",
    markerClassName: "fill-[#475569]",
  },
};

function ShapeMarker({
  className,
  shape,
}: {
  className: string;
  shape: SessionGroupShape;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-2.5 shrink-0", className)}
      data-shape={shape}
      viewBox="0 0 10 10"
    >
      {shape === "circle" ? <circle cx="5" cy="5" r="4.5" /> : null}
      {shape === "diamond" ? (
        <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" />
      ) : null}
      {shape === "pointed-circle" ? (
        <path d="M5 0.3 L8.2 3.2 A4.3 4.3 0 1 1 1.8 3.2 Z" />
      ) : null}
      {shape === "square" ? <rect height="8" width="8" x="1" y="1" /> : null}
      {shape === "hexagon" ? (
        <polygon points="2.5,0.7 7.5,0.7 9.8,5 7.5,9.3 2.5,9.3 0.2,5" />
      ) : null}
    </svg>
  );
}

export function SessionGroupStatusBadge({
  status,
}: {
  status: SessionGroupStatus;
}) {
  const token = SESSION_GROUP_STATUS_TOKENS[status];
  const Icon = token.icon;
  return (
    <span
      className={cn(
        "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] leading-5 font-medium",
        token.badgeClassName,
      )}
      data-status={status}
    >
      <ShapeMarker className={token.markerClassName} shape={token.shape} />
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {token.label}
    </span>
  );
}
