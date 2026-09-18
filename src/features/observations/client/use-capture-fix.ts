"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  CAPTURE_WATCH_OPTIONS,
  captureFixFromPosition,
  geolocationErrorOutcome,
  type CaptureFix,
} from "../capture";
import type { LocationUnavailableReason } from "../contracts";

export type CaptureFixState =
  | { kind: "locating" }
  | { kind: "fix"; fix: CaptureFix }
  | { kind: "denied" }
  | {
      kind: "unavailable";
      reason: LocationUnavailableReason;
      /** Changes with every new failure so an acknowledged one can reappear. */
      errorId: string;
    };

export interface CaptureFixController {
  state: CaptureFixState;
  /** Seconds since the current watch started. */
  elapsedS: number;
  /** Explicit student retries in this capture. */
  retries: number;
  /** A watch in this capture ended in a timeout. */
  sawTimeout: boolean;
  /** Student retry: restarts the watch and counts toward the flagged save. */
  retry: () => void;
  /** New capture after a refused start; not a GPS retry. */
  restart: () => void;
}

function subscribeNothing() {
  return () => {};
}

function geolocationSupported() {
  return "geolocation" in navigator && Boolean(navigator.geolocation);
}

/**
 * Watches for a fresh capture fix while `active`. The watch is cleared on
 * deactivation, retry, and unmount. Once a fix exists, later signal lapses
 * keep that fix; only a denied permission replaces it.
 */
export function useCaptureFix(active: boolean): CaptureFixController {
  const supported = useSyncExternalStore(
    subscribeNothing,
    geolocationSupported,
    () => true,
  );
  const [run, setRun] = useState(0);
  const [retries, setRetries] = useState(0);
  const [sawTimeout, setSawTimeout] = useState(false);
  // Reports are keyed by run so a new watch starts from "locating" without
  // resetting state inside the effect.
  const [report, setReport] = useState<{
    key: number;
    state: CaptureFixState;
  } | null>(null);
  const [tick, setTick] = useState<{ key: number; seconds: number } | null>(
    null,
  );

  const runKey = active && supported ? run : null;

  useEffect(() => {
    if (runKey === null) return;
    const key = runKey;
    let cancelled = false;
    let hasFix = false;
    let failures = 0;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (cancelled) return;
        const fix = captureFixFromPosition(position);
        if (!fix) return;
        hasFix = true;
        setReport({ key, state: { kind: "fix", fix } });
      },
      (error) => {
        if (cancelled) return;
        const outcome = geolocationErrorOutcome(error);
        if (outcome === "denied") {
          navigator.geolocation.clearWatch(watchId);
          setReport({ key, state: { kind: "denied" } });
          return;
        }
        if (outcome === "timeout") setSawTimeout(true);
        if (hasFix) return;
        failures += 1;
        setReport({
          key,
          state: {
            kind: "unavailable",
            reason: outcome,
            errorId: `${key}:${failures}`,
          },
        });
      },
      CAPTURE_WATCH_OPTIONS,
    );

    const timer = window.setInterval(() => {
      setTick((previous) => ({
        key,
        seconds: previous?.key === key ? previous.seconds + 1 : 1,
      }));
    }, 1_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [runKey]);

  const retry = useCallback(() => {
    setRetries((count) => count + 1);
    setRun((count) => count + 1);
  }, []);
  const restart = useCallback(() => setRun((count) => count + 1), []);

  let state: CaptureFixState;
  if (!supported) {
    state = {
      kind: "unavailable",
      reason: "unsupported",
      errorId: `unsupported:${run}`,
    };
  } else if (report && report.key === runKey) {
    state = report.state;
  } else {
    state = { kind: "locating" };
  }

  return {
    state,
    elapsedS: tick && tick.key === runKey ? tick.seconds : 0,
    retries,
    sawTimeout,
    retry,
    restart,
  };
}
