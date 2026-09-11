import {
  Archive,
  BadgeCheck,
  CircleCheckBig,
  LockKeyhole,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { GroupStatus } from "../contracts";

export type GroupStatusShape =
  "circle" | "diamond" | "hexagon" | "square" | "rounded-square";

// Thai label, semantic color, icon, and shape follow UI_CONTRACTS.md §2 (D-053).
export const GROUP_STATUS_TOKENS: Record<
  GroupStatus,
  {
    label: string;
    icon: LucideIcon;
    shape: GroupStatusShape;
    badgeClassName: string;
    markerClassName: string;
  }
> = {
  forming: {
    label: "กำลังจัดกลุ่ม",
    icon: UsersRound,
    shape: "circle",
    badgeClassName: "border-[#E8C58A] bg-[#FFF6E5] text-[#6B4204]",
    markerClassName: "fill-[#B7791F]",
  },
  ready: {
    label: "พร้อมส่งให้ครู",
    icon: CircleCheckBig,
    shape: "diamond",
    badgeClassName: "border-[#BFD0F5] bg-[#EEF3FF] text-[#1E3A8A]",
    markerClassName: "fill-[#2F5FD0]",
  },
  approved: {
    label: "ครูอนุมัติแล้ว",
    icon: BadgeCheck,
    shape: "hexagon",
    badgeClassName: "border-[#B5DCC2] bg-[#E8F5EC] text-[#14532D]",
    markerClassName: "fill-[#1E7A45]",
  },
  locked: {
    label: "ล็อกกลุ่มแล้ว",
    icon: LockKeyhole,
    shape: "square",
    badgeClassName: "border-[#CBD3DC] bg-[#EEF1F4] text-[#334155]",
    markerClassName: "fill-[#475569]",
  },
  archived: {
    label: "เก็บถาวร",
    icon: Archive,
    shape: "rounded-square",
    badgeClassName: "border-[#D4D7DB] bg-[#F1F2F3] text-[#3F4652]",
    markerClassName: "fill-[#6B7280]",
  },
};

function ShapeMarker({
  shape,
  className,
}: {
  shape: GroupStatusShape;
  className: string;
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
      {shape === "hexagon" ? (
        <polygon points="2.5,0.7 7.5,0.7 9.8,5 7.5,9.3 2.5,9.3 0.2,5" />
      ) : null}
      {shape === "square" ? <rect height="8" width="8" x="1" y="1" /> : null}
      {shape === "rounded-square" ? (
        <rect height="8" rx="2.5" width="8" x="1" y="1" />
      ) : null}
    </svg>
  );
}

export function GroupStatusBadge({ status }: { status: GroupStatus }) {
  const token = GROUP_STATUS_TOKENS[status];
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
