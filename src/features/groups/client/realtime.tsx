"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { groupQueryKeys } from "../board";

// Event names follow API_AND_REALTIME.md §12.
export const GROUP_SIGNAL_TYPES = [
  "group.created",
  "group.updated",
  "group.deleted",
  "group.archived",
  "group.locked",
  "group.unlocked",
  "group.member_joined",
  "group.member_left",
  "group.member_moved",
  "group.leader_changed",
  "group.invitation_changed",
  "group.capacity_changed",
  "group.formation_changed",
] as const;

export const groupSignalSchema = z
  .object({
    type: z.enum(GROUP_SIGNAL_TYPES),
    version: z.literal(1),
    classId: z.uuid(),
    groupId: z.uuid().nullable(),
    changedAt: z.iso.datetime({ offset: true }),
  })
  .passthrough();

export type GroupSignal = z.infer<typeof groupSignalSchema>;

export type GroupRealtimeStatus = "connecting" | "live" | "reconnecting";

export function classGroupTopic(classId: string) {
  return `class:${classId}:groups`;
}

export function isClassGroupSignal(
  payload: unknown,
  expectedClassId: string,
): payload is GroupSignal {
  const parsed = groupSignalSchema.safeParse(payload);
  return parsed.success && parsed.data.classId === expectedClassId;
}

/**
 * Subscribes to the private class-group channel. Signals only invalidate the
 * authoritative board query; foreground and network reconnect refetches come
 * from the TanStack Query focus and online managers.
 */
export function useClassGroupRealtime(classId: string): GroupRealtimeStatus {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<GroupRealtimeStatus>("connecting");

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let pending = Promise.resolve();

    // Board, group detail, invitation candidates, and invitation detail all
    // derive from class-group state, so every group query refetches.
    function invalidateBoard() {
      void queryClient.invalidateQueries({
        queryKey: groupQueryKeys.all,
      });
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

      let nextChannel = supabase.channel(classGroupTopic(classId), {
        config: { private: true },
      });
      for (const event of GROUP_SIGNAL_TYPES) {
        nextChannel = nextChannel.on("broadcast", { event }, (message) => {
          if (isClassGroupSignal(message.payload, classId)) invalidateBoard();
        });
      }
      channel = nextChannel.subscribe((subscriptionStatus) => {
        if (cancelled) return;
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("live");
          invalidateBoard();
        } else if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "TIMED_OUT" ||
          subscriptionStatus === "CLOSED"
        ) {
          setStatus("reconnecting");
          invalidateBoard();
        }
      });
    }

    // Serialize session changes so a fast auth event cannot leak a channel.
    function schedule(session: Session | null) {
      pending = pending.then(() => subscribeForSession(session));
    }

    void supabase.auth.getSession().then(({ data }) => schedule(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      schedule(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      pending = pending.then(removeActiveChannel);
    };
  }, [classId, queryClient, supabase]);

  return status;
}
