"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchActivityJson } from "@/features/activities/client/request";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import {
  liveLocationQueryKeys,
  locationSampleMessageSchema,
  sessionLiveLocationsSchema,
  sessionLocationTopic,
  sessionTeachersTopic,
  type SessionLiveLocations,
} from "../contracts";
import {
  useSessionSignals,
  type SessionRealtimeStatus,
} from "./use-session-signals";

export interface LivePosition {
  lat: number;
  lng: number;
  accuracyM: number;
  recordedAt: string;
  seq: number;
}

function fetchLiveLocations(sessionId: string) {
  return fetchActivityJson(
    `/api/sessions/${sessionId}/live-locations`,
    sessionLiveLocationsSchema,
  );
}

/**
 * Teacher live positions: the authoritative snapshot comes from the
 * live-locations read model; per-student Broadcast updates it in memory only.
 * A session signal clears every position and refetches, and topics of
 * students outside the active group are left immediately.
 *
 * This hook is the page's only subscriber of the teachers topic (supabase-js
 * shares one channel per topic); `onSignal` lets the caller refetch its own
 * read models, such as the group queue, on the same signals.
 */
export function useTeacherLiveLocations(
  sessionId: string,
  options: { onSignal?: () => void } = {},
): {
  snapshot: SessionLiveLocations | undefined;
  positions: Record<string, LivePosition>;
  realtime: SessionRealtimeStatus;
  error: unknown;
} {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [positions, setPositions] = useState<Record<string, LivePosition>>({});
  const { onSignal: onCallerSignal } = options;
  const onCallerSignalRef = useRef(onCallerSignal);

  useEffect(() => {
    onCallerSignalRef.current = onCallerSignal;
  }, [onCallerSignal]);

  const query = useQuery({
    queryKey: liveLocationQueryKeys.session(sessionId),
    queryFn: () => fetchLiveLocations(sessionId),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
    gcTime: 0,
  });

  const onSignal = useCallback(() => {
    setPositions({});
    void queryClient.invalidateQueries({ queryKey: liveLocationQueryKeys.all });
    onCallerSignalRef.current?.();
  }, [queryClient]);

  const realtime = useSessionSignals(
    sessionId,
    sessionTeachersTopic(sessionId),
    onSignal,
  );

  const publishing = query.data?.publishing ?? false;
  const activeUserIds = useMemo(
    () =>
      publishing ? (query.data?.items.map((item) => item.userId) ?? []) : [],
    [publishing, query.data],
  );
  const activeKey = activeUserIds.join(",");

  useEffect(() => {
    if (!activeKey) return;
    const userIds = activeKey.split(",");
    const channels: RealtimeChannel[] = [];
    let cancelled = false;

    async function join(session: Session | null) {
      if (!session || cancelled) return;
      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;
      for (const userId of userIds) {
        const channel = supabase
          .channel(sessionLocationTopic(sessionId, userId), {
            config: { private: true },
          })
          .on("broadcast", { event: "location.sample" }, (message) => {
            const parsed = locationSampleMessageSchema.safeParse(
              message.payload,
            );
            if (!parsed.success || parsed.data.sessionId !== sessionId) return;
            const sample = parsed.data;
            setPositions((current) => {
              const previous = current[userId];
              if (previous && previous.seq >= sample.seq) return current;
              return {
                ...current,
                [userId]: {
                  lat: sample.lat,
                  lng: sample.lng,
                  accuracyM: sample.accuracyM,
                  recordedAt: sample.recordedAt,
                  seq: sample.seq,
                },
              };
            });
          })
          .subscribe();
        channels.push(channel);
      }
    }

    void supabase.auth.getSession().then(({ data }) => join(data.session));

    return () => {
      cancelled = true;
      for (const channel of channels) void supabase.removeChannel(channel);
      setPositions((current) => {
        const kept: Record<string, LivePosition> = {};
        for (const userId of userIds) {
          if (current[userId]) kept[userId] = current[userId];
        }
        return Object.keys(kept).length === Object.keys(current).length
          ? current
          : kept;
      });
    };
  }, [activeKey, sessionId, supabase]);

  return {
    snapshot: query.data,
    positions: publishing ? positions : {},
    realtime,
    error: query.error,
  };
}
