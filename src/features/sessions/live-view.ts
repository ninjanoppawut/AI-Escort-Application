import type { SessionLive, SessionParticipantView } from "./contracts";
import type { SessionLiveLocations } from "./live-location/contracts";

// P7-04 view helpers shared by the student session shell and the teacher live
// control screen. They only interpret authoritative read models; nothing here
// authorizes an action.

export type StudentSessionPhase =
  | "waiting"
  | "ready"
  | "active"
  | "paused"
  | "group_completed"
  | "session_completed"
  | "participation_inactive";

/** Which student screen the latest participant view calls for. */
export function studentSessionPhase(
  view: SessionParticipantView,
): StudentSessionPhase {
  if (view.session.status === "completed") return "session_completed";
  if (view.myGroup.status === "completed") return "group_completed";
  if (view.permissions.blockedReason === "participation_inactive") {
    return "participation_inactive";
  }
  if (view.myGroup.status === "paused") return "paused";
  if (view.myGroup.status === "active") {
    return view.session.status === "open" ? "active" : "paused";
  }
  return view.myGroup.status === "ready" ? "ready" : "waiting";
}

export type LiveQueueEntry = SessionLive["queue"][number];

/** The group currently exploring, or held while the session is paused. */
export function currentQueueEntry(live: SessionLive) {
  return (
    live.queue.find(
      (entry) => entry.status === "active" || entry.status === "paused",
    ) ?? null
  );
}

/** The group the teacher would start next: the ready group, else the first waiting one. */
export function nextQueueEntry(live: SessionLive) {
  const ordered = [...live.queue].sort(
    (a, b) => a.queuePosition - b.queuePosition,
  );
  return (
    ordered.find((entry) => entry.status === "ready") ??
    ordered.find((entry) => entry.status === "waiting") ??
    null
  );
}

export type ActivationBlock =
  | "offline"
  | "pending"
  | "session_completed"
  | "session_scheduled"
  | "session_paused"
  | "group_active"
  | "queue_done"
  | null;

/**
 * Why starting a group is unavailable right now. The server re-checks every
 * condition; this only explains a disabled control.
 */
export function activationBlock(
  live: SessionLive,
  options: { online: boolean; pending: boolean },
): ActivationBlock {
  if (live.session.status === "completed") return "session_completed";
  if (live.session.status === "scheduled") return "session_scheduled";
  if (live.session.status === "paused") return "session_paused";
  if (live.queue.some((entry) => entry.status === "active")) {
    return "group_active";
  }
  if (!nextQueueEntry(live) || !live.allowedActions.canActivate) {
    return "queue_done";
  }
  if (!options.online) return "offline";
  if (options.pending) return "pending";
  return null;
}

export const ACTIVATION_BLOCK_REASONS: Record<
  Exclude<ActivationBlock, null>,
  string
> = {
  offline: "เริ่มกลุ่มไม่ได้ขณะออฟไลน์",
  pending: "กำลังบันทึกคำสั่งก่อนหน้า",
  session_completed: "รอบสำรวจจบแล้ว",
  session_scheduled: "ยังไม่เปิดรอบ · เปิดรอบจากหน้าตั้งค่าก่อน",
  session_paused: "พักรอบอยู่ · เปิดรอบต่อก่อนเริ่มกลุ่ม",
  group_active: "จบกลุ่มที่กำลังสำรวจก่อน · สำรวจได้ทีละกลุ่ม",
  queue_done: "ทุกกลุ่มสำรวจครบแล้ว",
};

// Working stale threshold from the design brief. The wireframes say 2 minutes;
// the value is pending owner confirmation (OWNER_QUESTIONS_PENDING.md item 31).
export const LIVE_POSITION_STALE_AFTER_MS = 30_000;

export interface LivePositionView {
  lat: number;
  lng: number;
  accuracyM: number;
  recordedAt: string;
}

export interface LiveLocationRow {
  userId: string;
  displayName: string;
  roleAtStart: "leader" | "member";
  position: LivePositionView | null;
  /** Device-reported problem (permission denied or no fix), if any. */
  deviceStatus: "denied" | "unavailable" | null;
}

/** Fixes less precise than this are flagged for the teacher; never hidden. */
export const LOW_ACCURACY_M = 50;

function recordedAtMs(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Merges the authoritative snapshot (latest durable sample) with in-memory
 * Broadcast positions, keeping whichever fix is newer. Positions never leave
 * memory; a session signal clears them before the snapshot is refetched.
 */
export function liveLocationRows(
  snapshot: SessionLiveLocations | undefined,
  positions: Record<string, LivePositionView>,
  deviceStatuses: Record<string, "denied" | "unavailable"> = {},
): LiveLocationRow[] {
  if (!snapshot?.publishing) return [];
  return snapshot.items.map((item) => {
    const live = positions[item.userId];
    const sample = item.latestSample;
    let position: LivePositionView | null = sample
      ? {
          lat: sample.lat,
          lng: sample.lng,
          accuracyM: sample.accuracyM,
          recordedAt: sample.recordedAt,
        }
      : null;
    if (
      live &&
      (!position ||
        recordedAtMs(live.recordedAt) >= recordedAtMs(position.recordedAt))
    ) {
      position = {
        lat: live.lat,
        lng: live.lng,
        accuracyM: live.accuracyM,
        recordedAt: live.recordedAt,
      };
    }
    return {
      userId: item.userId,
      displayName: item.displayName,
      roleAtStart: item.roleAtStart,
      position,
      deviceStatus: deviceStatuses[item.userId] ?? null,
    };
  });
}

/** Age of a fix in milliseconds; device clock skew never yields a negative age. */
export function positionAgeMs(recordedAt: string, nowMs: number) {
  return Math.max(0, nowMs - recordedAtMs(recordedAt));
}

export function isPositionStale(recordedAt: string, nowMs: number) {
  return positionAgeMs(recordedAt, nowMs) > LIVE_POSITION_STALE_AFTER_MS;
}

export function positionAgeLabel(ageMs: number) {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `อัปเดต ${seconds} วินาทีที่แล้ว`;
  return `อัปเดต ${Math.floor(seconds / 60)} นาทีที่แล้ว`;
}

export function accuracyLabel(accuracyM: number) {
  return `±${Math.max(1, Math.round(accuracyM))} ม.`;
}
