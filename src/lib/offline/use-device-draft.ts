"use client";

import { useEffect, useRef, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import {
  deleteLocal,
  getLocal,
  localStoreAvailable,
  putLocal,
} from "./local-store";

/** What a form keeps on the device between saves (P14-01, OBS-009). */
export interface DeviceDraft<T> {
  values: T;
  /** The server version the edits started from; the save still checks it. */
  baseVersion: number;
}

const SAVE_DELAY_MS = 400;

let testUserId: string | null | undefined;

/**
 * The signed-in user, read from the local session on every call so a
 * sign-out and another sign-in in the same tab never mixes accounts; device
 * drafts never cross accounts on a shared phone.
 */
export async function deviceUserId(): Promise<string | null> {
  if (testUserId !== undefined) return testUserId;
  try {
    const { data } = await createSupabaseBrowserClient().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** Test hook: a fixed user, or undefined to read the session again. */
export function resetDeviceUserIdForTests(value?: string | null) {
  testUserId = value;
}

/**
 * Keeps a form's unsaved text on the device while it is dirty, offers the
 * kept text back once after a reload or restart, and forgets it after a
 * successful save. The server save still carries `baseVersion`, so a kept
 * edit can never overwrite a newer version silently (D-052).
 */
export function useDeviceDraft<T>({
  key,
  scope,
  values,
  dirty,
  baseVersion,
  onRestore,
}: {
  /** Stable per form and record, e.g. `draft-notes:{observationId}`. */
  key: string;
  scope: string;
  values: T;
  dirty: boolean;
  baseVersion: number;
  /** Called at most once with text kept from an earlier visit. */
  onRestore: (draft: DeviceDraft<T>) => void;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  // Nothing is written (or deleted) until the kept text has been read.
  const [ready, setReady] = useState(false);
  const restoredOnce = useRef(false);
  const restoreRef = useRef(onRestore);
  useEffect(() => {
    restoreRef.current = onRestore;
  }, [onRestore]);
  const available = localStoreAvailable();

  // Offer kept text once, before anything new is written.
  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void (async () => {
      const userId = await deviceUserId();
      try {
        const record = userId
          ? await getLocal<DeviceDraft<T>>("drafts", key, userId)
          : null;
        if (record && !cancelled && !restoredOnce.current) {
          restoredOnce.current = true;
          restoreRef.current(record.value);
          setRestored(true);
          setSavedAt(record.updatedAt);
        }
      } catch {
        // An unreadable device store only means nothing is restored.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [available, key]);

  const serialized = JSON.stringify(values);
  useEffect(() => {
    if (!available || !ready) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const userId = await deviceUserId();
        if (!userId || cancelled) return;
        try {
          if (dirty) {
            const updatedAt = Date.now();
            await putLocal<DeviceDraft<T>>("drafts", {
              key,
              scope,
              userId,
              updatedAt,
              value: { values: JSON.parse(serialized) as T, baseVersion },
            });
            if (!cancelled) setSavedAt(updatedAt);
          } else {
            await deleteLocal("drafts", key);
            if (!cancelled) setSavedAt(null);
          }
        } catch {
          // A full device store keeps the text in this page only.
        }
      })();
    }, SAVE_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [available, baseVersion, dirty, key, ready, scope, serialized]);

  return { available, savedAt, restored };
}
