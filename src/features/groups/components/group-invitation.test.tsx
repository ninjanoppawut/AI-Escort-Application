import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroupInvitationDetail } from "../invitations";
import { GroupInvitationScreen } from "./group-invitation";

vi.mock("../client/realtime", () => ({
  useClassGroupRealtime: () => "live",
}));

const classId = "20000000-0000-4000-8000-000000004301";
const groupId = "30000000-0000-4000-8000-000000004301";
const invitationId = "60000000-0000-4000-8000-000000004301";
const requestId = "10000000-0000-4000-8000-000000004301";
const leaderId = "00000000-0000-4000-8000-000000004302";

function makeInvitation(
  overrides: Partial<GroupInvitationDetail> = {},
): GroupInvitationDetail {
  return {
    id: invitationId,
    status: "pending",
    createdAt: "2026-09-12T01:00:00.000Z",
    expiresAt: "2026-09-13T01:00:00.000Z",
    respondedAt: null,
    classId,
    className: "Biology M.4",
    group: {
      id: groupId,
      name: "Leaf Team",
      status: "forming",
      leader: { id: leaderId, displayName: "Ada Leader" },
      members: [{ id: leaderId, displayName: "Ada Leader", role: "leader" }],
      memberCount: 1,
      maximumSize: 3,
      availableSeats: 2,
    },
    inviter: { id: leaderId, displayName: "Ada Leader" },
    viewer: { isInvitee: true, canRespond: true, cannotRespondReason: null },
    refreshedAt: "2026-09-12T01:00:00.000Z",
    ...overrides,
  };
}

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, error: null, requestId }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function failure(code: string, status: number) {
  return new Response(
    JSON.stringify({
      data: null,
      error: { code, message: code, retryable: false, details: {} },
      requestId,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function renderScreen(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("GroupInvitationScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the group, seats, expiry, and accepts into the group", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/accept") && init?.method === "POST") {
          return envelope({
            outcome: "accepted",
            invitationId,
            groupId,
            classId,
            membershipId: "40000000-0000-4000-8000-000000004301",
            memberCount: 2,
            maximumSize: 3,
          });
        }
        if (url.endsWith(`/api/group-invitations/${invitationId}`)) {
          return envelope(
            makeInvitation({
              status: "accepted",
              viewer: {
                isInvitee: true,
                canRespond: false,
                cannotRespondReason: "INVITATION_NOT_PENDING",
              },
            }),
          );
        }
        throw new Error(`Unexpected request ${url}`);
      });

    renderScreen(
      <GroupInvitationScreen
        initialErrorCode={null}
        initialInvitation={makeInvitation()}
        invitationId={invitationId}
      />,
    );

    expect(screen.getByText("Leaf Team")).toBeVisible();
    expect(screen.getByText("ที่นั่งคงเหลือ 2 จาก 3")).toBeVisible();
    expect(screen.getByText("หมดอายุใน 24 ชั่วโมง")).toBeVisible();
    expect(screen.getByText(/รับคำเชิญนี้แล้วจะเข้ากลุ่มทันที/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "ตอบรับคำเชิญ" }));

    expect(await screen.findByText("เข้ากลุ่ม Leaf Team แล้ว")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "เปิดกลุ่มของฉัน" }),
    ).toHaveAttribute("href", `/classes/${classId}/groups/${groupId}`);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) === `/api/group-invitations/${invitationId}/accept` &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("explains a revalidation denial and the refreshed way out", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/accept") && init?.method === "POST") {
        return failure("GROUP_FULL", 409);
      }
      return envelope(
        makeInvitation({
          group: {
            ...makeInvitation().group,
            memberCount: 3,
            availableSeats: 0,
          },
          viewer: {
            isInvitee: true,
            canRespond: false,
            cannotRespondReason: "GROUP_FULL",
          },
        }),
      );
    });

    renderScreen(
      <GroupInvitationScreen
        initialErrorCode={null}
        initialInvitation={makeInvitation()}
        invitationId={invitationId}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "ตอบรับคำเชิญ" }));

    expect(await screen.findByText("กลุ่มเต็มก่อนคุณกดรับ")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "ตอบรับคำเชิญ" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "กลับหน้ากลุ่ม" })).toHaveAttribute(
      "href",
      `/classes/${classId}/groups`,
    );
  });

  it("renders expired invitations without response actions", () => {
    renderScreen(
      <GroupInvitationScreen
        initialErrorCode={null}
        initialInvitation={makeInvitation({
          status: "expired",
          viewer: {
            isInvitee: true,
            canRespond: false,
            cannotRespondReason: "INVITATION_EXPIRED",
          },
        })}
        invitationId={invitationId}
      />,
    );

    expect(screen.getByText("คำเชิญเข้ากลุ่มหมดอายุ")).toBeVisible();
    expect(screen.getByText("ไม่สามารถตอบคำเชิญนี้ได้แล้ว")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "ปฏิเสธ" }),
    ).not.toBeInTheDocument();
  });

  it("declines and routes back to the group board", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/decline") && init?.method === "POST") {
        return envelope({
          outcome: "declined",
          invitationId,
          groupId,
          classId,
        });
      }
      return envelope(
        makeInvitation({
          status: "declined",
          viewer: {
            isInvitee: true,
            canRespond: false,
            cannotRespondReason: "INVITATION_NOT_PENDING",
          },
        }),
      );
    });

    renderScreen(
      <GroupInvitationScreen
        initialErrorCode={null}
        initialInvitation={makeInvitation()}
        invitationId={invitationId}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "ปฏิเสธ" }));
    expect(await screen.findByText("ปฏิเสธคำเชิญแล้ว")).toBeVisible();
  });

  it("handles permission denial and offline response blocking", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(failure("FORBIDDEN", 403));

    const { unmount } = renderScreen(
      <GroupInvitationScreen
        initialErrorCode="FORBIDDEN"
        initialInvitation={null}
        invitationId={invitationId}
      />,
    );
    expect(await screen.findByText("คุณไม่มีสิทธิ์ทำรายการนี้")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "กลับการแจ้งเตือน" }),
    ).toHaveAttribute("href", "/notifications");
    unmount();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderScreen(
      <GroupInvitationScreen
        initialErrorCode={null}
        initialInvitation={makeInvitation()}
        invitationId={invitationId}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "ตอบรับคำเชิญ" }),
      ).toBeDisabled(),
    );
    expect(screen.getByText(/ออฟไลน์อยู่/)).toBeVisible();
  });
});
