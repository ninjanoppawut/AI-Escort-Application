import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EligibleClassmates, GroupDetail } from "../invitations";
import { GroupDetailScreen } from "./group-detail";

vi.mock("../client/realtime", () => ({
  useClassGroupRealtime: () => "live",
}));

const classId = "20000000-0000-4000-8000-000000004401";
const groupId = "30000000-0000-4000-8000-000000004401";
const leaderId = "00000000-0000-4000-8000-000000004402";
const memberId = "00000000-0000-4000-8000-000000004403";
const inviteeId = "00000000-0000-4000-8000-000000004404";
const eligibleId = "00000000-0000-4000-8000-000000004405";
const invitationId = "60000000-0000-4000-8000-000000004401";
const requestId = "10000000-0000-4000-8000-000000004401";

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
    pendingCount: 1,
    availableSeats: 1,
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
    pendingInvitations: [
      {
        id: invitationId,
        invitee: { id: inviteeId, displayName: "Cy Invitee" },
        createdAt: "2026-09-12T01:00:00.000Z",
        expiresAt: "2026-09-13T00:00:00.000Z",
      },
    ],
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

const candidates: EligibleClassmates = {
  groupId,
  classId,
  groupName: "Leaf Team",
  groupStatus: "forming",
  maximumSize: 4,
  memberCount: 2,
  pendingCount: 1,
  availableSeats: 1,
  canInvite: true,
  cannotInviteReason: null,
  classmates: [
    {
      id: eligibleId,
      displayName: "Di Eligible",
      state: "eligible",
      groupName: null,
      invitationId: null,
      expiresAt: null,
    },
    {
      id: inviteeId,
      displayName: "Cy Invitee",
      state: "pending",
      groupName: null,
      invitationId,
      expiresAt: "2026-09-13T00:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000004406",
      displayName: "Ed Grouped",
      state: "in_group",
      groupName: "Root Team",
      invitationId: null,
      expiresAt: null,
    },
  ],
  refreshedAt: "2026-09-12T02:00:00.000Z",
};

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, error: null, requestId }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderScreen(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("GroupDetailScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets the leader cancel pending invitations and invite eligible classmates", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/eligible-classmates")) return envelope(candidates);
        if (url.endsWith(`/api/groups/${groupId}/invitations`)) {
          return envelope(
            {
              outcome: "sent",
              invitationId: "60000000-0000-4000-8000-000000004402",
              groupId,
              inviteeId: eligibleId,
              expiresAt: "2026-09-13T02:00:00.000Z",
              availableSeats: 0,
            },
            201,
          );
        }
        if (url.endsWith(`/api/group-invitations/${invitationId}/cancel`)) {
          return envelope({
            outcome: "cancelled",
            invitationId,
            groupId,
            classId,
          });
        }
        if (url.endsWith(`/api/classes/${classId}/groups/${groupId}`)) {
          return envelope(makeDetail());
        }
        throw new Error(`Unexpected request ${url} ${init?.method ?? "GET"}`);
      });

    renderScreen(
      <GroupDetailScreen
        classId={classId}
        groupId={groupId}
        initialDetail={makeDetail()}
        initialErrorCode={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Leaf Team" })).toBeVisible();
    expect(screen.getByText("Ada Leader")).toBeVisible();
    expect(screen.getByText("หัวหน้ากลุ่ม (คุณ)")).toBeVisible();
    expect(screen.getByText("หมดอายุใน 22 ชั่วโมง")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "ยกเลิกคำเชิญ Cy Invitee" }),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) === `/api/group-invitations/${invitationId}/cancel` &&
          init?.method === "POST",
      ),
    ).toBe(true);

    await userEvent.click(
      screen.getByRole("button", { name: "ชวนเพื่อนร่วมชั้น" }),
    );
    const panel = await screen.findByRole("region", {
      name: "ชวนเพื่อนร่วมชั้น",
    });
    expect(within(panel).getByText("ชวนได้ (1)")).toBeVisible();
    await userEvent.click(
      within(panel).getByRole("button", { name: "ชวน Di Eligible" }),
    );
    expect(
      await within(panel).findByText("ส่งคำเชิญถึง Di Eligible แล้ว"),
    ).toBeVisible();
    const send = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith(`/api/groups/${groupId}/invitations`),
    );
    expect(JSON.parse(String(send?.[1]?.body))).toEqual({
      inviteeId: eligibleId,
    });

    await userEvent.click(
      within(panel).getByRole("button", { name: "อยู่กลุ่มอื่นแล้ว (1)" }),
    );
    expect(
      within(panel).getByText("อยู่ใน Root Team แล้ว — เชิญไม่ได้"),
    ).toBeVisible();
  });

  it("explains why the leader cannot invite when seats are full", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      envelope({
        ...candidates,
        availableSeats: 0,
        canInvite: false,
        cannotInviteReason: "GROUP_FULL",
      }),
    );

    renderScreen(
      <GroupDetailScreen
        classId={classId}
        groupId={groupId}
        initialDetail={makeDetail()}
        initialErrorCode={null}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "ชวนเพื่อนร่วมชั้น" }),
    );
    expect(
      await screen.findByText(/ที่นั่งเต็มแล้ว \(รวมคำเชิญที่รอตอบรับ\)/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "ชวน Di Eligible" }),
    ).toBeDisabled();
  });

  it("shows members a read-only view without invitation management", () => {
    renderScreen(
      <GroupDetailScreen
        classId={classId}
        groupId={groupId}
        initialDetail={makeDetail({
          pendingInvitations: [],
          viewer: {
            userId: memberId,
            role: "student",
            isMember: true,
            isLeader: false,
          },
        })}
        initialErrorCode={null}
      />,
    );

    expect(screen.getByText("หัวหน้ากลุ่มเป็นผู้ชวนสมาชิกใหม่")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "ชวนเพื่อนร่วมชั้น" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /รอตอบรับ/ }),
    ).not.toBeInTheDocument();
  });

  it("routes a forbidden group back to the board", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          error: {
            code: "FORBIDDEN",
            message: "FORBIDDEN",
            retryable: false,
            details: {},
          },
          requestId,
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );

    renderScreen(
      <GroupDetailScreen
        classId={classId}
        groupId={groupId}
        initialDetail={null}
        initialErrorCode="FORBIDDEN"
      />,
    );

    expect(await screen.findByText("คุณไม่มีสิทธิ์ทำรายการนี้")).toBeVisible();
    expect(screen.getByRole("link", { name: "กลับหน้ากลุ่ม" })).toHaveAttribute(
      "href",
      `/classes/${classId}/groups`,
    );
  });
});
