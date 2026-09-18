"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { sessionQueryKeys } from "@/features/sessions/contracts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import {
  sessionGroupTopic,
  sessionLocationTopic,
  type LocationSampleMessage,
} from "../contracts";
import {
  fixFromPosition,
  isPublishStopStatus,
  shouldBroadcast,
  shouldPublish,
  shouldRecordDurable,
  type SentFix,
} from "../publisher";
import {
  useSessionSignals,
  type SessionRealtimeStatus,
} from "./use-session-signals";

export type LocationPublisherStatus =
  "off" | "starting" | "publishing" | "denied" | "unavailable";

export interface LocationPublisherState {
  status: LocationPublisherStatus;
  /** Rounded accuracy of the latest own fix while publishing; memory only. */
  accuracyM: number | null;
  /**
   * Connection state of the session group signal topic. The publisher is the
   * page's only subscriber of that topic: supabase-js shares one channel per
   * topic, so a second subscriber would never see its own join callback.
   */
  realtime: SessionRealtimeStatus;
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function usePageVisible() {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
}

function subscribeNothing() {
  return () => {};
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => false,
  );
}

export interface LocationPublisherOptions {
  sessionId: string;
  userId: string;
  groupId: string;
  /** canPublishLocation from the latest authoritative participant view. */
  canPublish: boolean;
  /** refreshedAt of that view; a new value lifts a signal-driven suspension. */
  viewRefreshedAt: string;
  noticeAcknowledged: boolean;
}

/**
 * Publishes the student's own position on their private location topic and
 * keeps a throttled durable sample. Any session signal, reconnect, hidden
 * page, or refused durable sample stops publishing immediately; it restarts
 * only after a newer participant view still allows it. Nothing is queued
 * offline and no position is stored on the device.
 */
export function useLocationPublisher(
  options: LocationPublisherOptions,
): LocationPublisherState {
  const {
    sessionId,
    userId,
    groupId,
    canPublish,
    viewRefreshedAt,
    noticeAcknowledged,
  } = options;
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const visible = usePageVisible();
  const online = useOnline();
  const [suspendedAt, setSuspendedAt] = useState<string | null>(null);
  // Status reported by the current publishing run, keyed so a new run starts
  // from "starting" without resetting state inside the effect.
  const [runStatus, setRunStatus] = useState<{
    key: string;
    value: LocationPublisherStatus;
    accuracyM: number | null;
  } | null>(null);
  const geolocationSupported = useSyncExternalStore(
    subscribeNothing,
    () => "geolocation" in navigator,
    () => true,
  );

  const refetchView = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: sessionQueryKeys.participant(sessionId),
    });
  }, [queryClient, sessionId]);

  const suspend = useCallback(() => {
    setSuspendedAt(viewRefreshedAt);
    refetchView();
  }, [refetchView, viewRefreshedAt]);

  const suspendRef = useRef(suspend);
  useEffect(() => {
    suspendRef.current = suspend;
  }, [suspend]);

  const realtime = useSessionSignals(
    sessionId,
    sessionGroupTopic(sessionId, groupId),
    suspend,
  );

  const active =
    shouldPublish({ canPublish, noticeAcknowledged, visible, online }) &&
    suspendedAt !== viewRefreshedAt &&
    geolocationSupported;
  const runKey = active ? `${sessionId}:${viewRefreshedAt}` : null;

  useEffect(() => {
    if (!runKey) return;
    const key = runKey;
    // Report only changes so a steady fix stream does not re-render the page.
    let reported: string | null = null;
    const setStatus = (
      value: LocationPublisherStatus,
      accuracyM: number | null = null,
    ) => {
      const next = `${value}:${accuracyM ?? ""}`;
      if (next === reported) return;
      reported = next;
      setRunStatus({ key, value, accuracyM });
    };

    let cancelled = false;
    let watchId: number | null = null;
    let channel: RealtimeChannel | null = null;
    let lastSent: SentFix | null = null;
    let lastDurableAtMs: number | null = null;
    let seq = 0;

    function stop() {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      lastSent = null;
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    }

    async function recordDurable(message: LocationSampleMessage) {
      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/location-samples`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientSampleId: crypto.randomUUID(),
              lat: message.lat,
              lng: message.lng,
              accuracyM: message.accuracyM,
              recordedAt: message.recordedAt,
            }),
          },
        );
        if (!cancelled && isPublishStopStatus(response.status)) {
          stop();
          setStatus("off");
          suspendRef.current();
        }
      } catch {
        // Offline or aborted: the next interval tries again with a new fix.
      }
    }

    function sendStatus(value: "denied" | "unavailable") {
      void channel?.send({
        type: "broadcast",
        event: "location.status",
        payload: {
          type: "location.status",
          version: 1,
          sessionId,
          status: value,
        },
      });
    }

    async function start() {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(sessionLocationTopic(sessionId, userId), {
          config: { private: true, broadcast: { self: false, ack: false } },
        })
        .subscribe((subscriptionStatus) => {
          if (cancelled) return;
          if (
            subscriptionStatus === "CHANNEL_ERROR" ||
            subscriptionStatus === "TIMED_OUT" ||
            subscriptionStatus === "CLOSED"
          ) {
            // RLS refuses the join once publishing is no longer allowed.
            stop();
            setStatus("off");
            suspendRef.current();
          }
        });

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (cancelled) return;
          const fix = fixFromPosition(position);
          if (!fix) return;
          setStatus("publishing", Math.max(1, Math.round(fix.accuracyM)));
          const nowMs = Date.now();
          const message: LocationSampleMessage = {
            type: "location.sample",
            version: 1,
            sessionId,
            seq: seq++,
            ...fix,
          };
          if (shouldBroadcast(lastSent, fix, nowMs)) {
            lastSent = { lat: fix.lat, lng: fix.lng, sentAtMs: nowMs };
            void channel?.send({
              type: "broadcast",
              event: "location.sample",
              payload: message,
            });
          }
          if (shouldRecordDurable(lastDurableAtMs, nowMs)) {
            lastDurableAtMs = nowMs;
            void recordDurable(message);
          }
        },
        (error) => {
          if (cancelled) return;
          const next =
            error.code === error.PERMISSION_DENIED ? "denied" : "unavailable";
          setStatus(next);
          sendStatus(next);
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
      );
    }

    void start();
    return stop;
  }, [runKey, sessionId, supabase, userId]);

  if (!geolocationSupported && canPublish) {
    return { status: "unavailable", accuracyM: null, realtime };
  }
  if (!runKey) return { status: "off", accuracyM: null, realtime };
  return runStatus?.key === runKey
    ? { status: runStatus.value, accuracyM: runStatus.accuracyM, realtime }
    : { status: "starting", accuracyM: null, realtime };
}
