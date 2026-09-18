import {
  BadgeCheck,
  Ban,
  CircleHelp,
  ClipboardCheck,
  ClockArrowUp,
  CloudUpload,
  Eye,
  FilePenLine,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import {
  OBSERVATION_STATUS_LABELS,
  type ObservationStatus,
} from "../contracts";

export type ObservationStatusShape =
  | "circle"
  | "striped-circle"
  | "diamond"
  | "hexagon"
  | "triangle"
  | "checked-circle"
  | "square"
  | "octagon";

// Thai label, semantic color, icon, and shape follow UI_CONTRACTS.md §2
// (observation table). Color is supplemental; the label and icon carry the
// meaning, and the shape distinguishes statuses in lists and markers.
export const OBSERVATION_STATUS_TOKENS: Record<
  ObservationStatus,
  {
    label: string;
    icon: LucideIcon;
    shape: ObservationStatusShape;
    badgeClassName: string;
    markerClassName: string;
  }
> = {
  draft: {
    label: OBSERVATION_STATUS_LABELS.draft,
    icon: FilePenLine,
    shape: "circle",
    badgeClassName: "border-[#CBD3DC] bg-[#EEF1F4] text-[#334155]",
    markerClassName: "fill-[#475569]",
  },
  images_uploading: {
    label: OBSERVATION_STATUS_LABELS.images_uploading,
    icon: CloudUpload,
    shape: "striped-circle",
    badgeClassName: "border-[#A5E3EE] bg-[#E8F8FB] text-[#155E75]",
    markerClassName: "fill-[#0E7490]",
  },
  analysis_queued: {
    label: OBSERVATION_STATUS_LABELS.analysis_queued,
    icon: ClockArrowUp,
    shape: "diamond",
    badgeClassName: "border-[#C7CCF5] bg-[#EEF0FE] text-[#3730A3]",
    markerClassName: "fill-[#4F46E5]",
  },
  analysis_running: {
    label: OBSERVATION_STATUS_LABELS.analysis_running,
    icon: Sparkles,
    shape: "diamond",
    badgeClassName: "border-[#D9C8F5] bg-[#F4EEFE] text-[#5B21B6]",
    markerClassName: "fill-[#7C3AED]",
  },
  student_review: {
    label: OBSERVATION_STATUS_LABELS.student_review,
    icon: ClipboardCheck,
    shape: "hexagon",
    badgeClassName: "border-[#B6DDF3] bg-[#EAF6FD] text-[#075985]",
    markerClassName: "fill-[#0284C7]",
  },
  submitted: {
    label: OBSERVATION_STATUS_LABELS.submitted,
    icon: Send,
    shape: "circle",
    badgeClassName: "border-[#E8C58A] bg-[#FFF6E5] text-[#6B4204]",
    markerClassName: "fill-[#A15C07]",
  },
  teacher_review: {
    label: OBSERVATION_STATUS_LABELS.teacher_review,
    icon: Eye,
    shape: "hexagon",
    badgeClassName: "border-[#F3C9A6] bg-[#FFF1E6] text-[#7C2D12]",
    markerClassName: "fill-[#C2410C]",
  },
  revision_required: {
    label: OBSERVATION_STATUS_LABELS.revision_required,
    icon: RotateCcw,
    shape: "triangle",
    badgeClassName: "border-[#F1B8B4] bg-[#FDECEB] text-[#8C1D18]",
    markerClassName: "fill-[#B3261E]",
  },
  resubmitted: {
    label: OBSERVATION_STATUS_LABELS.resubmitted,
    icon: RefreshCw,
    shape: "diamond",
    badgeClassName: "border-[#BFD0F5] bg-[#EEF3FF] text-[#1E3A8A]",
    markerClassName: "fill-[#1B4FA0]",
  },
  verified: {
    label: OBSERVATION_STATUS_LABELS.verified,
    icon: BadgeCheck,
    shape: "checked-circle",
    badgeClassName: "border-[#B5DCC2] bg-[#E8F5EC] text-[#14532D]",
    markerClassName: "fill-[#15803D]",
  },
  unable_to_verify: {
    label: OBSERVATION_STATUS_LABELS.unable_to_verify,
    icon: CircleHelp,
    shape: "square",
    badgeClassName: "border-[#D8C3EC] bg-[#F6EEFC] text-[#5B2C83]",
    markerClassName: "fill-[#5B34A8]",
  },
  rejected: {
    label: OBSERVATION_STATUS_LABELS.rejected,
    icon: Ban,
    shape: "octagon",
    badgeClassName: "border-[#D4D7DB] bg-[#F1F2F3] text-[#3F4652]",
    markerClassName: "fill-[#55605A]",
  },
};

export function ObservationStatusShapeMarker({
  className,
  shape,
}: {
  className: string;
  shape: ObservationStatusShape;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-2.5 shrink-0", className)}
      data-shape={shape}
      viewBox="0 0 10 10"
    >
      {shape === "circle" ? <circle cx="5" cy="5" r="4.5" /> : null}
      {shape === "striped-circle" ? (
        <>
          <circle cx="5" cy="5" r="4.5" />
          <path
            d="M2.2 7.2 7.2 2.2M3.8 8.6 8.6 3.8"
            fill="none"
            stroke="#fff"
            strokeWidth="1"
          />
        </>
      ) : null}
      {shape === "diamond" ? (
        <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" />
      ) : null}
      {shape === "hexagon" ? (
        <polygon points="2.5,0.7 7.5,0.7 9.8,5 7.5,9.3 2.5,9.3 0.2,5" />
      ) : null}
      {shape === "triangle" ? <polygon points="5,0.6 9.6,9.3 0.4,9.3" /> : null}
      {shape === "checked-circle" ? (
        <>
          <circle cx="5" cy="5" r="4.5" />
          <path
            d="M2.9 5.1 4.4 6.6 7.2 3.6"
            fill="none"
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="1.3"
          />
        </>
      ) : null}
      {shape === "square" ? <rect height="8" width="8" x="1" y="1" /> : null}
      {shape === "octagon" ? (
        <polygon points="3,0.5 7,0.5 9.5,3 9.5,7 7,9.5 3,9.5 0.5,7 0.5,3" />
      ) : null}
    </svg>
  );
}

export function ObservationStatusBadge({
  status,
  className,
}: {
  status: ObservationStatus;
  className?: string;
}) {
  const token = OBSERVATION_STATUS_TOKENS[status];
  const Icon = token.icon;
  return (
    <span
      className={cn(
        "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] leading-5 font-medium",
        token.badgeClassName,
        className,
      )}
      data-status={status}
    >
      <ObservationStatusShapeMarker
        className={token.markerClassName}
        shape={token.shape}
      />
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {token.label}
    </span>
  );
}
