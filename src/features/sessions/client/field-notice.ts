"use client";

import { useCallback, useSyncExternalStore } from "react";

// DRAFT field-mode location notice (PRIVACY_RETENTION_AND_RESEARCH.md §3).
// This Thai copy is not yet in UI_CONTRACTS.md and is pending owner
// confirmation: docs/OWNER_QUESTIONS_PENDING.md item 29. Keep it short: who
// sees the location, when sending stops, and what is kept.
export const FIELD_LOCATION_NOTICE = {
  title: "ก่อนเริ่มสำรวจ: การแชร์ตำแหน่ง",
  points: [
    "เฉพาะครูของชั้นเรียนนี้ที่เห็นชื่อและตำแหน่งสดของคุณ เพื่อนไม่เห็น",
    "ส่งตำแหน่งเฉพาะตอนที่กลุ่มของคุณกำลังสำรวจ และหยุดทันทีเมื่อครูพักรอบ จบกลุ่ม จบรอบสำรวจ หรือเมื่อคุณออกจากหน้านี้",
    "ไม่เก็บตำแหน่งไว้ในเครื่องของคุณ ระบบบันทึกตำแหน่งเป็นระยะไว้กับรอบสำรวจนี้",
  ],
  action: "เริ่มแชร์ตำแหน่ง",
} as const;

// Only the acknowledgement flag is kept, per browser tab and session. No
// position is ever written to browser storage.
const STORAGE_PREFIX = "ai-escort:field-location-notice:";
const acknowledgedInMemory = new Set<string>();
const listeners = new Set<() => void>();

function storageKey(sessionId: string) {
  return `${STORAGE_PREFIX}${sessionId}`;
}

export function readFieldNoticeAcknowledged(sessionId: string) {
  if (acknowledgedInMemory.has(sessionId)) return true;
  try {
    return window.sessionStorage.getItem(storageKey(sessionId)) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeFieldNotice(sessionId: string) {
  // Memory keeps the answer for this page when storage is blocked.
  acknowledgedInMemory.add(sessionId);
  try {
    window.sessionStorage.setItem(storageKey(sessionId), "1");
  } catch {
    // Private mode or blocked storage: the in-memory flag still applies.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether this tab acknowledged the field-mode notice for the session. */
export function useFieldNoticeAcknowledgement(sessionId: string) {
  const acknowledged = useSyncExternalStore(
    subscribe,
    () => readFieldNoticeAcknowledged(sessionId),
    () => false,
  );
  const acknowledge = useCallback(
    () => acknowledgeFieldNotice(sessionId),
    [sessionId],
  );
  return [acknowledged, acknowledge] as const;
}
