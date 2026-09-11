import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { groupQueryKeys } from "../board";
import {
  GROUP_SIGNAL_TYPES,
  classGroupTopic,
  isClassGroupSignal,
  useClassGroupRealtime,
} from "./realtime";

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: vi.fn(),
}));

const classId = "20000000-0000-4000-8000-000000003401";
const otherClassId = "20000000-0000-4000-8000-000000003402";
const groupId = "30000000-0000-4000-8000-000000003401";

function StatusProbe({ id }: { id: string }) {
  return <p>{useClassGroupRealtime(id)}</p>;
}

function renderWithQueryClient(children: ReactNode, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

function mockSupabase() {
  const handlers = new Map<string, (message: { payload: unknown }) => void>();
  let subscribeHandler: ((status: string) => void) | undefined;
  const subscription = { unsubscribe: vi.fn() };
  const channel = {
    on: vi.fn(
      (
        _type: string,
        filter: { event: string },
        handler: (message: { payload: unknown }) => void,
      ) => {
        handlers.set(filter.event, handler);
        return channel;
      },
    ),
    subscribe: vi.fn((handler: (status: string) => void) => {
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
            user: { id: "00000000-0000-4000-8000-000000003401" },
          },
        },
      }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription } })),
    },
    realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue("ok"),
  };
  vi.mocked(createSupabaseBrowserClient).mockReturnValue(supabase as never);
  return {
    supabase,
    channel,
    handlers,
    subscription,
    emitStatus: (status: string) => subscribeHandler?.(status),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("P3-04 class-group realtime contract", () => {
  it("accepts only versioned group signals for the subscribed class", () => {
    const signal = {
      type: "group.created",
      version: 1,
      classId,
      groupId,
      changedAt: "2026-09-12T02:00:00.123456+00:00",
    };
    expect(isClassGroupSignal(signal, classId)).toBe(true);
    expect(
      isClassGroupSignal(
        { ...signal, groupId: null, type: "group.formation_changed" },
        classId,
      ),
    ).toBe(true);
    expect(isClassGroupSignal(signal, otherClassId)).toBe(false);
    expect(
      isClassGroupSignal({ ...signal, type: "group.renamed" }, classId),
    ).toBe(false);
    expect(isClassGroupSignal({ ...signal, version: 2 }, classId)).toBe(false);
    expect(classGroupTopic(classId)).toBe(`class:${classId}:groups`);
  });

  it("subscribes privately, invalidates the board on signals and reconnects, and cleans up", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const mock = mockSupabase();

    const view = renderWithQueryClient(
      <StatusProbe id={classId} />,
      queryClient,
    );

    await waitFor(() => {
      expect(mock.supabase.realtime.setAuth).toHaveBeenCalledWith(
        "session-token",
      );
      expect(mock.supabase.channel).toHaveBeenCalledWith(
        classGroupTopic(classId),
        {
          config: { private: true },
        },
      );
    });
    expect(screen.getByText("connecting")).toBeVisible();
    expect([...mock.handlers.keys()].sort()).toEqual(
      [...GROUP_SIGNAL_TYPES].sort(),
    );

    mock.emitStatus("SUBSCRIBED");
    expect(await screen.findByText("live")).toBeVisible();
    expect(invalidateQueries).toHaveBeenLastCalledWith({
      queryKey: groupQueryKeys.board(classId),
    });
    const afterSubscribe = invalidateQueries.mock.calls.length;

    mock.handlers.get("group.member_joined")?.({
      payload: {
        type: "group.member_joined",
        version: 1,
        classId,
        groupId,
        changedAt: "2026-09-12T02:00:00.000Z",
      },
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(afterSubscribe + 1);

    mock.handlers.get("group.created")?.({
      payload: {
        type: "group.created",
        version: 1,
        classId: otherClassId,
        groupId,
        changedAt: "2026-09-12T02:00:00.000Z",
      },
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(afterSubscribe + 1);

    mock.emitStatus("CHANNEL_ERROR");
    expect(await screen.findByText("reconnecting")).toBeVisible();
    expect(invalidateQueries).toHaveBeenCalledTimes(afterSubscribe + 2);

    view.unmount();
    expect(mock.subscription.unsubscribe).toHaveBeenCalled();
    await waitFor(() => expect(mock.supabase.removeChannel).toHaveBeenCalled());
  });
});
