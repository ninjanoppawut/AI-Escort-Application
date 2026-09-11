import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import type { NotificationSignal } from "../contracts";
import {
  NotificationRealtimeBridge,
  isNotificationSignalPayload,
  notificationQueryKeys,
} from "./realtime";

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: vi.fn(),
}));

const recipientId = "00000000-0000-4000-8000-000000000901";
const notificationId = "50000000-0000-4000-8000-000000000901";

function renderWithQueryClient(children: ReactNode, queryClient: QueryClient) {
  return render(
    createElement(QueryClientProvider, { client: queryClient }, children),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notification realtime client contract", () => {
  it("keeps notification query keys in one invalidation namespace", () => {
    expect(notificationQueryKeys.all).toEqual(["notifications"]);
    expect(notificationQueryKeys.lists()).toEqual(["notifications", "list"]);
    expect(notificationQueryKeys.list({ status: "unread" })).toEqual([
      "notifications",
      "list",
      { status: "unread" },
    ]);
  });

  it("accepts only notification.created signals for the current recipient", () => {
    expect(
      isNotificationSignalPayload(
        {
          id: "70000000-0000-4000-8000-000000000901",
          type: "notification.created",
          version: 1,
          notificationId,
          recipientId,
          changedAt: "2026-08-12T04:13:06.000000+00:00",
        },
        recipientId,
      ),
    ).toBe(true);

    expect(
      isNotificationSignalPayload(
        {
          type: "notification.created",
          version: 1,
          notificationId,
          recipientId: "00000000-0000-4000-8000-000000000902",
          changedAt: "2026-08-12T04:13:06.000Z",
        },
        recipientId,
      ),
    ).toBe(false);

    expect(
      isNotificationSignalPayload(
        {
          type: "notification.read",
          version: 1,
          notificationId,
          recipientId,
          changedAt: "2026-08-12T04:13:06.000Z",
        },
        recipientId,
      ),
    ).toBe(false);
  });

  it("subscribes to the private recipient channel and invalidates authoritative notification queries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    let broadcastHandler:
      ((message: { payload: NotificationSignal }) => void) | undefined;
    let subscribeHandler: ((status: string) => void) | undefined;
    const subscription = { unsubscribe: vi.fn() };
    const channel = {
      on: vi.fn((_type, _filter, handler) => {
        broadcastHandler = handler;
        return channel;
      }),
      subscribe: vi.fn((handler) => {
        subscribeHandler = handler;
        return channel;
      }),
    };
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "session-token",
              user: { id: recipientId },
            },
          },
        }),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription },
        })),
      },
      realtime: {
        setAuth: vi.fn().mockResolvedValue(undefined),
      },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn().mockResolvedValue("ok"),
    };
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(supabase as never);

    const view = renderWithQueryClient(
      createElement(NotificationRealtimeBridge),
      queryClient,
    );

    await waitFor(() => {
      expect(supabase.realtime.setAuth).toHaveBeenCalledWith("session-token");
      expect(supabase.channel).toHaveBeenCalledWith(
        `user:${recipientId}:notifications`,
        { config: { private: true } },
      );
    });

    expect(channel.on).toHaveBeenCalledWith(
      "broadcast",
      { event: "notification.created" },
      expect.any(Function),
    );

    subscribeHandler?.("SUBSCRIBED");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: notificationQueryKeys.all,
    });

    broadcastHandler?.({
      payload: {
        type: "notification.created",
        version: 1,
        notificationId,
        recipientId,
        changedAt: "2026-08-12T04:13:06.000Z",
      },
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);

    broadcastHandler?.({
      payload: {
        type: "notification.created",
        version: 1,
        notificationId,
        recipientId: "00000000-0000-4000-8000-000000000902",
        changedAt: "2026-08-12T04:13:06.000Z",
      },
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(subscription.unsubscribe).toHaveBeenCalled();
    await waitFor(() => expect(supabase.removeChannel).toHaveBeenCalled());
  });
});
