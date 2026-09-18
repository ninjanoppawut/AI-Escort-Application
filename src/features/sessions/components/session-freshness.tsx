import { RefreshCw, WifiOff } from "lucide-react";

import { cn } from "@/lib/utils";

import type { SessionRealtimeStatus } from "../live-location/client/use-session-signals";

export const SESSION_REALTIME_LABELS: Record<SessionRealtimeStatus, string> = {
  connecting: "กำลังเชื่อมต่ออัปเดตสด",
  live: "อัปเดตสดอยู่",
  reconnecting: "กำลังเชื่อมต่อใหม่",
};

export function formatClockTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Freshness of the authoritative read model plus the signal connection. */
export function SessionFreshness({
  isFetching,
  realtime,
  refreshedAt,
  className,
}: {
  isFetching: boolean;
  /** Omitted when the viewer has no live topic to follow. */
  realtime?: SessionRealtimeStatus | undefined;
  refreshedAt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]",
        className,
      )}
      role="status"
    >
      <span className="inline-flex items-center gap-1.5">
        <RefreshCw
          aria-hidden="true"
          className={cn("size-3.5", isFetching && "animate-spin")}
        />
        {isFetching ? (
          "กำลังอัปเดตสถานะ..."
        ) : (
          <span suppressHydrationWarning>
            อัปเดตล่าสุด {formatClockTime(refreshedAt)}
          </span>
        )}
      </span>
      {realtime ? (
        <span
          className="inline-flex items-center gap-1.5"
          data-realtime={realtime}
        >
          {realtime === "reconnecting" ? (
            <WifiOff aria-hidden="true" className="size-3.5" />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                realtime === "live"
                  ? "bg-success"
                  : "border border-current bg-transparent",
              )}
            />
          )}
          {SESSION_REALTIME_LABELS[realtime]}
        </span>
      ) : null}
    </div>
  );
}
