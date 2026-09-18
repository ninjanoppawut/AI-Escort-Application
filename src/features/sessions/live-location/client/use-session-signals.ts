"use client";

import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import {
  SESSION_SIGNAL_TYPES,
  sessionSignalSchema,
  type SessionSignal,
} from "../contracts";

export type SessionRealtimeStatus = "connecting" | "live" | "reconnecting";

export function isSessionSignalFor(
  payload: unknown,
  expectedSessionId: string,
): payload is SessionSignal {
  const parsed = sessionSignalSchema.safeParse(payload);
  return parsed.success && parsed.data.sessionId === expectedSessionId;
}

/**
 * Subscribes to a private session group or teachers topic. Every signal and
 * every (re)subscribe calls onChange so callers stop publishing and refetch
 * authoritative state; signals carry pointers only.
 */
export function useSessionSignals(
  sessionId: string,
  topic: string | null,
  onChange: () => void,
): SessionRealtimeStatus {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<SessionRealtimeStatus>("connecting");
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!topic) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let pending = Promise.resolve();

    async function removeActiveChannel() {
      if (!channel) return;
      const current = channel;
      channel = null;
      await supabase.removeChannel(current);
    }

    async function subscribeForSession(session: Session | null) {
      await removeActiveChannel();
      if (!session || cancelled || !topic) return;

      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      let next = supabase.channel(topic, { config: { private: true } });
      for (const event of SESSION_SIGNAL_TYPES) {
        next = next.on("broadcast", { event }, (message) => {
          if (isSessionSignalFor(message.payload, sessionId)) {
            onChangeRef.current();
          }
        });
      }
      channel = next.subscribe((subscriptionStatus) => {
        if (cancelled) return;
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("live");
          onChangeRef.current();
        } else if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "TIMED_OUT" ||
          subscriptionStatus === "CLOSED"
        ) {
          setStatus("reconnecting");
          onChangeRef.current();
        }
      });
    }

    function schedule(session: Session | null) {
      pending = pending.then(() => subscribeForSession(session));
    }

    void supabase.auth.getSession().then(({ data }) => schedule(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => schedule(session));

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      pending = pending.then(removeActiveChannel);
    };
  }, [sessionId, supabase, topic]);

  return status;
}
