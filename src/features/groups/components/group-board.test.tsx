import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { GroupBoard } from "../board";
import { GROUP_STATUS_TOKENS } from "./group-status-badge";
import { GroupBoardScreen } from "./group-board";

// Realtime subscription behavior is covered in client/realtime.test.tsx.
vi.mock("../client/realtime", () => ({
  useClassGroupRealtime: () => "live",
}));

const classId = "20000000-0000-4000-8000-000000003301";
const viewerId = "00000000-0000-4000-8000-000000003304";
const groupId = "30000000-0000-4000-8000-000000003301";
const requestId = "10000000-0000-4000-8000-000000003301";

function makeBoard(overrides: Partial<GroupBoard> = {}): GroupBoard {
  return {
    classId,
    className: "Biology M.4",
    formationStatus: "open",
    allowStudentGroups: true,
    maximumGroups: 2,
    currentGroupCount: 1,
    remainingGroupSlots: 1,
    minimumGroupSize: 2,
    maximumGroupSize: 3,
    viewer: {
      userId: viewerId,
      role: "student",
      currentGroupId: null,
      isLeader: false,
      hasCreatedStudentGroup: false,
      canCreateGroup: true,
      cannotCreateReason: null,
    },
    groups: [
      {
        id: "30000000-0000-4000-8000-000000003302",
        name: "Bark Team",
        description: null,
        status: "forming",
        creatorType: "student",
        leader: {
          id: "00000000-0000-4000-8000-000000003302",
          displayName: "Ada Leader",
        },
        memberCount: 3,
        maximumSize: 3,
        availableSeats: 0,
        meetsMinimumSize: true,
        isAcceptingMembers: false,
        members: [
          {
            id: "00000000-0000-4000-8000-000000003302",
            displayName: "Ada Leader",
            role: "leader",
          },
        ],
        createdAt: "2026-09-12T01:00:00.000Z",
      },
    ],
    unassignedStudents: [{ id: viewerId, displayName: "Cy Student" }],
    refreshedAt: "2026-09-12T01:00:00.000Z",
    ...overrides,
  };
}

const limitReachedBoard = makeBoard({
  currentGroupCount: 2,
  remainingGroupSlots: 0,
  viewer: {
    ...makeBoard().viewer,
    canCreateGroup: false,
    cannotCreateReason: "GROUP_LIMIT_REACHED",
  },
});

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

function renderBoard(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

function isBoardRequest(input: RequestInfo | URL, init?: RequestInit) {
  return (
    String(input).endsWith(`/api/classes/${classId}/group-board`) &&
    (!init?.method || init.method === "GET")
  );
}

describe("GroupBoardScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a group and refetches the authoritative board", async () => {
    const createdBoard = makeBoard({
      currentGroupCount: 2,
      remainingGroupSlots: 0,
      viewer: {
        ...makeBoard().viewer,
        currentGroupId: groupId,
        isLeader: true,
        hasCreatedStudentGroup: true,
        canCreateGroup: false,
        cannotCreateReason: "STUDENT_ALREADY_IN_GROUP",
      },
      groups: [
        ...makeBoard().groups,
        {
          ...makeBoard().groups[0]!,
          id: groupId,
          name: "Leaf Team",
          leader: { id: viewerId, displayName: "Cy Student" },
          memberCount: 1,
          availableSeats: 2,
          meetsMinimumSize: false,
          isAcceptingMembers: true,
          members: [
            { id: viewerId, displayName: "Cy Student", role: "leader" },
          ],
        },
      ],
      unassignedStudents: [],
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        if (String(input) === "/api/groups" && init?.method === "POST") {
          return envelope(
            {
              group: {
                id: groupId,
                classId,
                name: "Leaf Team",
                description: null,
                status: "forming",
                leaderId: viewerId,
                createdAt: "2026-09-12T01:01:00.000Z",
              },
              slots: {
                currentGroupCount: 2,
                maximumGroups: 2,
                remainingGroupSlots: 0,
              },
            },
            201,
          );
        }
        if (isBoardRequest(input, init)) return envelope(createdBoard);
        throw new Error(`Unexpected request ${String(input)}`);
      });

    renderBoard(
      <GroupBoardScreen
        classId={classId}
        initialBoard={makeBoard()}
        initialErrorCode={null}
      />,
    );

    expect(screen.getByText("เหลือ 1 กลุ่ม")).toBeVisible();
    expect(screen.getByText("เต็มแล้ว")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "สร้างกลุ่มของฉัน" }),
    );
    await userEvent.type(screen.getByLabelText("ชื่อกลุ่ม"), "  Leaf Team ");
    await userEvent.click(screen.getByRole("button", { name: "สร้างกลุ่ม" }));

    expect(await screen.findByText("สร้างกลุ่ม Leaf Team แล้ว")).toBeVisible();
    const post = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === "/api/groups" && init?.method,
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      classId,
      name: "Leaf Team",
    });
    expect(await screen.findByText("กลุ่มของคุณ")).toBeVisible();
    expect(screen.getByText("คุณเป็นหัวหน้ากลุ่ม")).toBeVisible();
    expect(
      screen.getByText("สร้างไม่ได้เพราะคุณอยู่ในกลุ่มแล้ว"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "สร้างกลุ่มของฉัน" }),
    ).toBeDisabled();
  });

  it("keeps Create Group visible but disabled with the slot-limit reason", () => {
    renderBoard(
      <GroupBoardScreen
        classId={classId}
        initialBoard={limitReachedBoard}
        initialErrorCode={null}
      />,
    );

    const button = screen.getByRole("button", { name: "สร้างกลุ่มของฉัน" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      /สร้างไม่ได้เพราะครบจำนวนกลุ่มสูงสุด 2 กลุ่มแล้ว/,
    );
    expect(screen.getByText("เหลือ 0 กลุ่ม")).toBeVisible();
    const card = screen.getByText("Bark Team").closest("li")!;
    expect(
      within(card).getByText(GROUP_STATUS_TOKENS.forming.label),
    ).toBeVisible();
    expect(within(card).getByText("หัวหน้า: Ada Leader")).toBeVisible();
  });

  it("explains a lost final-slot race and refetches without an error tone", async () => {
    let boardRequests = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "/api/groups" && init?.method === "POST") {
        return failure("GROUP_LIMIT_REACHED", 409);
      }
      if (isBoardRequest(input, init)) {
        boardRequests += 1;
        return envelope(limitReachedBoard);
      }
      throw new Error(`Unexpected request ${String(input)}`);
    });

    renderBoard(
      <GroupBoardScreen
        classId={classId}
        initialBoard={makeBoard()}
        initialErrorCode={null}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "สร้างกลุ่มของฉัน" }),
    );
    await userEvent.type(screen.getByLabelText("ชื่อกลุ่ม"), "Late Team");
    await userEvent.click(screen.getByRole("button", { name: "สร้างกลุ่ม" }));

    expect(
      await screen.findByText("กลุ่มสุดท้ายเพิ่งถูกสร้างพอดี"),
    ).toBeVisible();
    await waitFor(() => expect(boardRequests).toBeGreaterThan(0));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "สร้างกลุ่มของฉัน" }),
      ).toBeDisabled(),
    );
    expect(screen.queryByLabelText("ชื่อกลุ่ม")).not.toBeInTheDocument();
  });

  it("shows permission and network failures with a safe next action", async () => {
    let attempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (!isBoardRequest(input, init)) throw new Error("unexpected");
      attempts += 1;
      if (attempts === 1) throw new TypeError("Failed to fetch");
      return envelope(makeBoard());
    });

    renderBoard(
      <GroupBoardScreen
        classId={classId}
        initialBoard={null}
        initialErrorCode={null}
      />,
    );

    expect(await screen.findByText("เชื่อมต่อไม่สำเร็จ")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("Bark Team")).toBeVisible();
  });

  it("routes a forbidden board back to the class list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(failure("FORBIDDEN", 403));

    renderBoard(
      <GroupBoardScreen
        classId={classId}
        initialBoard={null}
        initialErrorCode="FORBIDDEN"
      />,
    );

    expect(await screen.findByText("คุณไม่มีสิทธิ์ทำรายการนี้")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "กลับรายการชั้นเรียน" }),
    ).toHaveAttribute("href", "/app");
  });

  it("disables creation while offline because cached data cannot reserve a slot", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    renderBoard(
      <GroupBoardScreen
        classId={classId}
        initialBoard={makeBoard()}
        initialErrorCode={null}
      />,
    );

    expect(await screen.findByText("ออฟไลน์อยู่")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "สร้างกลุ่มของฉัน" }),
    ).toBeDisabled();
    expect(
      screen.getByText("สร้างไม่ได้ขณะออฟไลน์ ต้องเชื่อมต่อเพื่อจองช่องกลุ่ม"),
    ).toBeVisible();
  });
});
