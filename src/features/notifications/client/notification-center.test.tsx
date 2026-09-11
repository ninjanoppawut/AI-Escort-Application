import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  NotificationLayout,
  NotificationPage,
  NotificationSummary,
  NotificationType,
} from "../contracts";
import { NotificationBadge } from "./notification-badge";
import { NotificationCenter } from "./notification-center";

const layouts: Array<[NotificationLayout, NotificationType, string]> = [
  ["invitation", "group_invitation_received", "MailPlus"],
  ["membership", "class_joined", "School"],
  ["group_status", "group_approved", "BadgeCheck"],
  ["session_status", "session_group_active", "Navigation"],
  ["observation_status", "observation_verified", "BadgeCheck"],
  ["request", "group_approval_requested", "ClipboardClock"],
  ["warning", "same_species_warning", "Copy"],
  ["export", "export_ready", "Download"],
];

function notification(
  index: number,
  layout: NotificationLayout,
  type: NotificationType,
  icon: string,
  overrides: Partial<NotificationSummary> = {},
): NotificationSummary {
  return {
    id: `50000000-0000-4000-8000-00000000090${index}`,
    type,
    layout,
    icon,
    copyKey: `notifications.${type}`,
    title: `Notification ${index}`,
    message: `Message ${index}`,
    payload: {},
    entityType: "class",
    entityId: "20000000-0000-4000-8000-000000000901",
    deepLink: `/target/${index}`,
    readAt: index % 2 === 0 ? "2026-08-12T04:00:00.000Z" : null,
    createdAt: `2026-08-12T04:${String(index).padStart(2, "0")}:00.000Z`,
    expiresAt: null,
    ...overrides,
  };
}

function page(items: NotificationSummary[]): NotificationPage {
  return {
    items,
    unreadCount: items.filter((item) => !item.readAt).length,
    nextCursor: null,
    hasMore: false,
  };
}

function renderWithQuery(children: ReactNode, staleTime = Infinity) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("NotificationCenter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all notification layout treatments and deleted-target state", () => {
    const items = layouts.map(([layout, type, icon], index) =>
      notification(index + 1, layout, type, icon),
    );
    items[0] = notification(
      1,
      "invitation",
      "group_invitation_received",
      "MailPlus",
      {
        deepLink: null,
      },
    );

    renderWithQuery(<NotificationCenter initialPage={page(items)} />);

    for (const label of [
      "คำเชิญ",
      "สมาชิก",
      "สถานะกลุ่ม",
      "รอบกิจกรรม",
      "รายการพืช",
      "ต้องดำเนินการ",
      "คำเตือน",
      "ส่งออกข้อมูล",
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getByText("ปลายทางถูกลบหรือหมดอายุ")).toBeVisible();
    expect(screen.getByText(/มี 4 รายการที่ยังไม่ได้อ่าน/)).toBeVisible();
  });

  it("shows empty, stale-refreshing, pagination, and mark-read states", async () => {
    const firstItem = notification(9, "membership", "class_joined", "School", {
      id: "50000000-0000-4000-8000-000000000999",
      readAt: null,
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              items: [],
              unreadCount: 1,
              nextCursor: null,
              hasMore: false,
            },
            error: null,
            requestId: "10000000-0000-4000-8000-000000000901",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              items: [
                notification(10, "warning", "same_species_warning", "Copy"),
                notification(11, "membership", "class_joined", "School", {
                  id: "50000000-0000-4000-8000-000000000911",
                  readAt: null,
                }),
              ],
              unreadCount: 1,
              nextCursor: null,
              hasMore: false,
            },
            error: null,
            requestId: "10000000-0000-4000-8000-000000000902",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: page([]),
            error: null,
            requestId: "10000000-0000-4000-8000-000000000903",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    renderWithQuery(
      <NotificationCenter
        initialPage={{
          items: [firstItem],
          unreadCount: 1,
          nextCursor: "next",
          hasMore: true,
        }}
      />,
    );

    expect(screen.getByText("Notification 9")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "ยังไม่ได้อ่าน" }),
    );
    expect(
      await screen.findByText("ไม่มีรายการที่ยังไม่ได้อ่าน"),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "ทั้งหมด" }));
    await userEvent.click(
      screen.getByRole("button", { name: "โหลดเพิ่มเติม" }),
    );
    expect(await screen.findByText("Notification 10")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "ทำเครื่องหมายว่าอ่านแล้ว" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/50000000-0000-4000-8000-000000000911/read",
        { method: "POST" },
      ),
    );
  });

  it("shows offline error and fetches the unread badge count", async () => {
    vi.spyOn(globalThis.navigator, "onLine", "get").mockReturnValue(false);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "FORBIDDEN", message: "Forbidden", retryable: false },
          requestId: "10000000-0000-4000-8000-000000000904",
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );

    renderWithQuery(
      <NotificationCenter
        initialPage={{ ...page([]), hasMore: true, nextCursor: "next" }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "โหลดเพิ่มเติม" }),
    );
    expect(await screen.findByText("ออฟไลน์อยู่")).toBeVisible();

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { ...page([]), unreadCount: 7 },
          error: null,
          requestId: "10000000-0000-4000-8000-000000000905",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    renderWithQuery(<NotificationBadge initialUnreadCount={2} />, 0);
    expect(screen.getByText("2")).toBeVisible();
    expect(await screen.findByText("7")).toBeVisible();
  });
});
