import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroupDetail } from "../invitations";
import { GroupLeaderActions } from "./group-leader-actions";

const classId = "20000000-0000-4000-8000-000000004601";
const groupId = "30000000-0000-4000-8000-000000004601";
const leaderId = "00000000-0000-4000-8000-000000004602";
const memberId = "00000000-0000-4000-8000-000000004603";
const requestId = "10000000-0000-4000-8000-000000004601";

function makeDetail(overrides: Partial<GroupDetail> = {}): GroupDetail {
  return {
    id: groupId,
    classId,
    className: "Biology M.4",
    name: "Leaf Team",
    description: null,
    status: "forming",
    creatorType: "student",
    createdAt: "2026-09-12T01:00:00.000Z",
    formationStatus: "open",
    minimumSize: 2,
    maximumSize: 4,
    memberCount: 2,
    pendingCount: 0,
    availableSeats: 2,
    meetsMinimumSize: true,
    members: [
      {
        id: leaderId,
        displayName: "Ada Leader",
        role: "leader",
        joinedAt: "2026-09-12T01:00:00.000Z",
      },
      {
        id: memberId,
        displayName: "Bo Member",
        role: "member",
        joinedAt: "2026-09-12T01:05:00.000Z",
      },
    ],
    pendingInvitations: [],
    viewer: {
      userId: leaderId,
      role: "student",
      isMember: true,
      isLeader: true,
    },
    refreshedAt: "2026-09-12T02:00:00.000Z",
    ...overrides,
  };
}

function envelope(data: unknown) {
  return new Response(JSON.stringify({ data, error: null, requestId }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderActions(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("GroupLeaderActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks a group ready when it meets the minimum", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      envelope({
        outcome: "ready",
        groupId,
        classId,
        memberCount: 2,
        minimumSize: 2,
      }),
    );

    renderActions(<GroupLeaderActions detail={makeDetail()} online />);

    await userEvent.click(
      screen.getByRole("button", { name: "แจ้งครูว่ากลุ่มพร้อมแล้ว" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/groups/${groupId}/ready`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps readiness visible but disabled with its reason", () => {
    renderActions(
      <GroupLeaderActions
        detail={makeDetail({ meetsMinimumSize: false, memberCount: 1 })}
        online
      />,
    );

    const button = screen.getByRole("button", {
      name: "แจ้งครูว่ากลุ่มพร้อมแล้ว",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "ต้องมีสมาชิกอย่างน้อย 2 คนก่อนแจ้งครู",
    );
  });

  it("requires two confirmations before transferring leadership", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      envelope({
        outcome: "transferred",
        groupId,
        classId,
        leaderId: memberId,
        previousLeaderId: leaderId,
      }),
    );

    renderActions(<GroupLeaderActions detail={makeDetail()} online />);

    await userEvent.click(
      screen.getByRole("button", { name: "เลือกหัวหน้าคนใหม่" }),
    );
    expect(screen.getByRole("button", { name: "ถัดไป" })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Bo Member" }));
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(
      screen.getByText("ยืนยันโอนหัวหน้ากลุ่มให้ Bo Member?"),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "โอนสิทธิ์หัวหน้า" }),
    );
    const transfer = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/transfer-leadership"),
    );
    expect(JSON.parse(String(transfer?.[1]?.body))).toEqual({
      newLeaderId: memberId,
    });
  });

  it("confirms removal with the affected member's name", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      envelope({
        outcome: "removed",
        groupId,
        classId,
        memberCount: 1,
        status: "forming",
      }),
    );

    renderActions(<GroupLeaderActions detail={makeDetail()} online />);

    await userEvent.click(
      screen.getByRole("button", { name: "นำ Bo Member ออกจากกลุ่ม" }),
    );
    expect(screen.getByText("นำ Bo Member ออกจากกลุ่ม?")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "นำ Bo Member ออก" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/groups/${groupId}/members/${memberId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("shows a stale-leader refusal returned by the server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          error: {
            code: "NOT_GROUP_LEADER",
            message: "NOT_GROUP_LEADER",
            retryable: false,
            details: {},
          },
          requestId,
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );

    renderActions(<GroupLeaderActions detail={makeDetail()} online />);

    await userEvent.click(
      screen.getByRole("button", { name: "แจ้งครูว่ากลุ่มพร้อมแล้ว" }),
    );
    expect(
      await screen.findByText("เฉพาะหัวหน้ากลุ่มทำรายการนี้ได้"),
    ).toBeVisible();
  });
});
