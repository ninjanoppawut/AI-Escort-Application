"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useEffect, useMemo } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import {
  notificationSignalSchema,
  type NotificationSignal,
} from "../contracts";

declare global {
  interface Window {
    __notificationRealtimeEvents?: Array<{
      type: string;
      status?: string;
      notificationId?: string;
      recipientId?: string;
    }>;
  }
}

export const notificationQueryKeys = {
  all: ["notifications"] as const,
  lists: () => [...notificationQueryKeys.all, "list"] as const,
  list: (params: Record<string, unknown> = {}) =>
    [...notificationQueryKeys.lists(), params] as const,
};

export function isNotificationSignalPayload(
  payload: unknown,
  expectedRecipientId: string,
): payload is NotificationSignal {
  const parsed = notificationSignalSchema.safeParse(payload);
  return parsed.success && parsed.data.recipientId === expectedRecipientId;
}

export function NotificationRealtimeBridge() {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    function invalidateNotifications() {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.all,
      });
    }

    function recordRealtimeEvent(
      event: NonNullable<Window["__notificationRealtimeEvents"]>[number],
    ) {
      if (process.env.NODE_ENV !== "development") return;
      window.__notificationRealtimeEvents ??= [];
      window.__notificationRealtimeEvents.push(event);
    }

    async function removeActiveChannel() {
      if (!channel) return;
      const currentChannel = channel;
      channel = null;
      await supabase.removeChannel(currentChannel);
    }

    async function subscribeForSession(session: Session | null) {
      await removeActiveChannel();
      if (!session || cancelled) return;

      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      const userId = session.user.id;
      channel = supabase
        .channel(`user:${userId}:notifications`, {
          config: { private: true },
        })
        .on("broadcast", { event: "notification.created" }, (message) => {
          if (isNotificationSignalPayload(message.payload, userId)) {
            recordRealtimeEvent({
              type: "broadcast",
              notificationId: message.payload.notificationId,
              recipientId: message.payload.recipientId,
            });
            invalidateNotifications();
          }
        })
        .subscribe((status) => {
          recordRealtimeEvent({ type: "status", status });
          if (
            status === "SUBSCRIBED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            invalidateNotifications();
          }
        });
    }

    void supabase.auth
      .getSession()
      .then(({ data }) => subscribeForSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void subscribeForSession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      void removeActiveChannel();
    };
  }, [queryClient, supabase]);

  return null;
}
