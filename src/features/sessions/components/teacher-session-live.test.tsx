import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionLiveSchema, type SessionLive } from "../contracts";
import type { LivePosition } from "../live-location/client/use-teacher-live-locations";
import type { SessionRealtimeStatus } from "../live-location/client/use-session-signals";
import type { SessionLiveLocations } from "../live-location/contracts";
import { TeacherSessionLive } from "./teacher-session-live";

const liveLocations = vi.hoisted(() => ({
  value: {
    snapshot: undefined as SessionLiveLocations | undefined,
    positions: {} as Record<string, LivePosition>,
    deviceStatuses: {} as Record<string, "denied" | "unavailable">,
    realtime: "live" as SessionRealtimeStatus,
    error: null as unknown,
  },
  onSignal: null as (() => void) | null,
}));

vi.mock("../live-location/client/use-teacher-live-locations", () => ({
  useTeacherLiveLocations: (
    _sessionId: string,
    options: { onSignal?: () => void } = {},
  ) => {
    liveLocations.onSignal = options.onSignal ?? null;
    return liveLocations.value;
  },
}));

const classId = "20000000-0000-4000-8000-000000007501";
const sessionId = "62000000-0000-4000-8000-000000007501";
const activityId = "60000000-0000-4000-8000-000000007501";
const leafGroup = "30000000-0000-4000-8000-000000007501";
const rootGroup = "30000000-0000-4000-8000-000000007502";
const stemGroup = "30000000-0000-4000-8000-000000007503";
const ada = "10000000-0000-4000-8000-000000007501";
const bo = "10000000-0000-4000-8000-000000007502";
const cy = "10000000-0000-4000-8000-000000007503";
const di = "10000000-0000-4000-8000-000000007504";
const requestId = "90000000-0000-4000-8000-000000007501";

type GroupStatus = SessionLive["queue"][number]["status"];

function makeLive(
  sessionStatus: SessionLive["session"]["status"],
  statuses: [GroupStatus, GroupStatus, GroupStatus],
): SessionLive {
  const groups = [
    { id: leafGroup, name: "Leaf", members: [ada, bo] },
    { id: rootGroup, name: "Root", members: [cy] },
    { id: stemGroup, name: "Stem", members: [di] },
  ];
  const names: Record<string, string> = {
    [ada]: "Ada Leader",
    [bo]: "Bo Member",
    [cy]: "Cy Leader",
    [di]: "Di Leader",
  };
  return sessionLiveSchema.parse({
    session: {
      id: sessionId,
      classId,
      title: "Morning round",
      status: sessionStatus,
      openedAt: "2026-09-19T01:00:00.000Z",
      pausedAt: sessionStatus === "paused" ? "2026-09-19T01:30:00.000Z" : null,
      completedAt:
        sessionStatus === "completed" ? "2026-09-19T03:00:00.000Z" : null,
    },
    className: "Field Class",
    activity: {
      id: activityId,
      title: "Garden survey",
      versionNumber: 1,
      instructions: null,
    },
    geometry: {
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [100.5, 13.75],
            [100.51, 13.75],
            [100.51, 13.76],
            [100.5, 13.75],
          ],
        ],
      },
      route: null,
      checkpoints: [],
    },
    queue: groups.map((group, index) => ({
      sessionGroupId: `63000000-0000-4000-8000-00000000750${index + 1}`,
      groupId: group.id,
      groupName: group.name,
      queuePosition: index + 1,
      status: statuses[index],
      activatedAt:
        statuses[index] === "active" || statuses[index] === "paused"
          ? "2026-09-19T01:05:00.000Z"
          : null,
      completedAt:
        statuses[index] === "completed" ? "2026-09-19T01:20:00.000Z" : null,
      participants: group.members.map((userId, memberIndex) => ({
        userId,
        displayName: names[userId],
        roleAtStart: memberIndex === 0 ? "leader" : "member",
        participationStatus: "active",
      })),
    })),
    counts: {
      groups: 3,
      completedGroups: statuses.filter((status) => status === "completed")
        .length,
      participants: 4,
    },
    allowedActions: {
      canActivate: sessionStatus === "open",
      canPause: sessionStatus === "open",
      canResume: sessionStatus === "paused",
      canComplete: sessionStatus === "open" || sessionStatus === "paused",
    },
    refreshedAt: "2026-09-19T02:00:00.000Z",
  });
}

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, error: null, requestId }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorEnvelope(
  code: string,
  status: number,
  details: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({
      data: null,
      error: { code, message: code, retryable: false, details },
      requestId,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function renderLive(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function snapshot(
  items: SessionLiveLocations["items"],
  overrides: Partial<SessionLiveLocations> = {},
): SessionLiveLocations {
  return {
    sessionStatus: "open",
    activeSessionGroupId: "63000000-0000-4000-8000-000000007501",
    activeGroupId: leafGroup,
    publishing: true,
    items,
    refreshedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("TeacherSessionLive", () => {
  beforeEach(() => {
    liveLocations.value = {
      snapshot: snapshot([]),
      positions: {},
      deviceStatuses: {},
      realtime: "live",
      error: null,
    };
    liveLocations.onSignal = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the queue with status badges and enables only valid controls while a group explores", () => {
    const live = makeLive("open", ["active", "ready", "waiting"]);
    renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode={null}
        initialLive={live}
        sessionId={sessionId}
      />,
    );

    expect(screen.getByRole("heading", { name: "รอบสำรวจสด" })).toBeVisible();
    const leaf = screen.getByRole("listitem", { name: "คิวที่ 1 Leaf" });
    const root = screen.getByRole("listitem", { name: "คิวที่ 2 Root" });
    const stem = screen.getByRole("listitem", { name: "คิวที่ 3 Stem" });
    expect(leaf).toHaveTextContent("กำลังสำรวจ");
    expect(root).toHaveTextContent("กลุ่มถัดไป");
    expect(stem).toHaveTextContent("กำลังรอ");
    // Badges carry a shape as well as text and color.
    expect(leaf.querySelector("[data-shape='pointed-circle']")).not.toBeNull();

    expect(screen.getByRole("button", { name: "พักรอบ" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "จบกลุ่มนี้" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "เปิดกลุ่มถัดไป" })).toBeNull();
    expect(screen.queryByRole("button", { name: "เปิดรอบต่อ" })).toBeNull();
    const startRoot = screen.getByRole("button", { name: "เปิดกลุ่ม Root" });
    expect(startRoot).toBeDisabled();
    expect(startRoot).toHaveAccessibleDescription(
      /จบกลุ่มที่กำลังสำรวจก่อน · สำรวจได้ทีละกลุ่ม/,
    );
    expect(screen.queryByRole("button", { name: "เปิดกลุ่ม Leaf" })).toBeNull();
    expect(screen.getByRole("button", { name: "จบรอบสำรวจ" })).toBeEnabled();
  });

  it("offers the next group once none is exploring, and resume while paused", () => {
    const { unmount } = renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode={null}
        initialLive={makeLive("open", ["completed", "ready", "waiting"])}
        sessionId={sessionId}
      />,
    );
    expect(
      screen.getByRole("button", { name: "เปิดกลุ่มถัดไป" }),
    ).toBeEnabled();
    expect(screen.getByText(/พร้อมเปิด: Root/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "เปิดกลุ่ม Stem" }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: "จบกลุ่มนี้" })).toBeNull();
    unmount();

    renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode={null}
        initialLive={makeLive("paused", ["paused", "ready", "waiting"])}
        sessionId={sessionId}
      />,
    );
    expect(screen.getByRole("button", { name: "เปิดรอบต่อ" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "พักรอบ" })).toBeNull();
    const next = screen.getByRole("button", { name: "เปิดกลุ่มถัดไป" });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription(
      /พักรอบอยู่ · เปิดรอบต่อก่อนเริ่มกลุ่ม/,
    );
    expect(screen.getByRole("button", { name: "จบกลุ่มนี้" })).toBeEnabled();
    expect(
      screen.getByText(
        "พักรอบอยู่ · นักเรียนหยุดส่งตำแหน่ง และไม่แสดงตำแหน่งล่าสุด",
      ),
    ).toBeInTheDocument();
  });

  it("shows no controls once the session is completed", () => {
    renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode={null}
        initialLive={makeLive("completed", [
          "completed",
          "completed",
          "completed",
        ])}
        sessionId={sessionId}
      />,
    );
    expect(screen.getByText(/รอบสำรวจนี้จบแล้ว/)).toBeInTheDocument();
    for (const name of [
      "พักรอบ",
      "เปิดรอบต่อ",
      "จบกลุ่มนี้",
      "เปิดกลุ่มถัดไป",
      "จบรอบสำรวจ",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(
      screen.getByText("รอบสำรวจจบแล้ว · ไม่แสดงตำแหน่ง"),
    ).toBeInTheDocument();
  });

  it("explains an activation conflict after refetching the queue", async () => {
    const user = userEvent.setup();
    const stale = makeLive("open", ["completed", "ready", "waiting"]);
    const current = makeLive("open", ["completed", "ready", "active"]);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith("/activate-group") && init?.method === "POST") {
          return errorEnvelope("ACTIVE_GROUP_CONFLICT", 409, {
            activeGroupId: stemGroup,
            activeSessionGroupId: "63000000-0000-4000-8000-000000007503",
          });
        }
        if (url.endsWith("/group-queue")) return envelope(current);
        throw new Error(`unexpected request ${url}`);
      });

    renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode={null}
        initialLive={stale}
        sessionId={sessionId}
      />,
    );

    await user.click(screen.getByRole("button", { name: "เปิดกลุ่มถัดไป" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("มีกลุ่มอื่นเริ่มสำรวจก่อนแล้ว");
    await waitFor(() =>
      expect(alert).toHaveTextContent(
        "Stem กำลังสำรวจอยู่ ดึงสถานะล่าสุดแล้ว · จบกลุ่มนั้นก่อนจึงเปิดกลุ่มใหม่ได้",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sessions/${sessionId}/activate-group`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ groupId: rootGroup }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sessions/${sessionId}/group-queue`,
      { cache: "no-store" },
    );
    // The refetched queue now shows Stem exploring and blocks activation.
    await waitFor(() =>
      expect(
        screen.getByRole("listitem", { name: "คิวที่ 3 Stem" }),
      ).toHaveTextContent("กำลังสำรวจ"),
    );
    expect(
      screen.getByRole("button", { name: "เปิดกลุ่ม Root" }),
    ).toBeDisabled();
  });

  it("confirms before completing the current group and names who is affected", async () => {
    const user = userEvent.setup();
    const live = makeLive("open", ["active", "ready", "waiting"]);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith(`/groups/${leafGroup}/complete`)) {
          return envelope({
            outcome: "completed",
            sessionId,
            groupId: leafGroup,
            sessionGroupId: "63000000-0000-4000-8000-000000007501",
            status: "completed",
            nextReadySessionGroupId: "63000000-0000-4000-8000-000000007502",
            nextReadyGroupId: rootGroup,
          });
        }
        if (url.endsWith("/group-queue")) {
          return envelope(makeLive("open", ["completed", "ready", "waiting"]));
        }
        throw new Error(`unexpected request ${url}`);
      });

    renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode={null}
        initialLive={live}
        sessionId={sessionId}
      />,
    );

    await user.click(screen.getByRole("button", { name: "จบกลุ่มนี้" }));
    let dialog = screen.getByRole("alertdialog", {
      name: "จบการสำรวจของ Leaf?",
    });
    expect(dialog).toHaveTextContent("ย้อนกลับไม่ได้");
    expect(dialog).toHaveTextContent(
      "นักเรียน 2 คนออกจากโหมดสนามและหยุดส่งตำแหน่งทันที",
    );
    await user.click(within(dialog).getByRole("button", { name: "ยกเลิก" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "จบกลุ่มนี้" }));
    dialog = screen.getByRole("alertdialog", { name: "จบการสำรวจของ Leaf?" });
    await user.click(
      within(dialog).getByRole("button", { name: "จบกลุ่มนี้" }),
    );

    expect(
      await screen.findByText("Leaf สำรวจเสร็จแล้ว · กลุ่มถัดไป: Root"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sessions/${sessionId}/groups/${leafGroup}/complete`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lists live positions with accuracy, age, and a stale marker on the sketch", () => {
    const now = Date.now();
    liveLocations.value = {
      snapshot: snapshot([
        {
          userId: ada,
          displayName: "Ada Leader",
          roleAtStart: "leader",
          latestSample: {
            lat: 13.7551,
            lng: 100.5051,
            accuracyM: 12,
            recordedAt: new Date(now - 20_000).toISOString(),
            receivedAt: new Date(now - 20_000).toISOString(),
          },
        },
        {
          userId: bo,
          displayName: "Bo Member",
          roleAtStart: "member",
          latestSample: {
            lat: 13.7561,
            lng: 100.5061,
            accuracyM: 9,
            recordedAt: new Date(now - 45_000).toISOString(),
            receivedAt: new Date(now - 45_000).toISOString(),
          },
        },
        {
          userId: cy,
          displayName: "Cy Waiting",
          roleAtStart: "member",
          latestSample: null,
        },
      ]),
      // A newer Broadcast fix replaces Ada's durable sample in memory.
      positions: {
        [ada]: {
          lat: 13.7552,
          lng: 100.5052,
          accuracyM: 4,
          recordedAt: new Date(now - 5_000).toISOString(),
          seq: 9,
        },
      },
      deviceStatuses: {},
      realtime: "reconnecting",
      error: null,
    };

    const { container } = renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode={null}
        initialLive={makeLive("open", ["active", "ready", "waiting"])}
        sessionId={sessionId}
      />,
    );

    const list = screen.getByRole("list", { name: "รายชื่อตำแหน่งนักเรียน" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent("Ada Leader");
    expect(rows[0]).toHaveTextContent("±4 ม.");
    expect(rows[0]).toHaveTextContent(/อัปเดต [56] วินาทีที่แล้ว/);
    expect(rows[0]).toHaveTextContent("สด");
    expect(rows[0]).toHaveAttribute("data-stale", "false");

    expect(rows[1]).toHaveTextContent("Bo Member");
    expect(rows[1]).toHaveTextContent("±9 ม.");
    expect(rows[1]).toHaveTextContent("ตำแหน่งเก่า");
    expect(rows[1]).toHaveAttribute("data-stale", "true");

    expect(rows[2]).toHaveTextContent("Cy Waiting");
    expect(rows[2]).toHaveTextContent("ยังไม่มีตำแหน่ง");

    const sketch = screen.getByRole("img", {
      name: /นักเรียน 2 คน · ตำแหน่งเก่า 1 คน/,
    });
    expect(sketch.querySelector(`[data-marker-id='${ada}']`)).toHaveAttribute(
      "data-stale",
      "false",
    );
    expect(sketch.querySelector(`[data-marker-id='${bo}']`)).toHaveAttribute(
      "data-stale",
      "true",
    );
    expect(sketch.querySelector(`[data-marker-id='${cy}']`)).toBeNull();
    expect(screen.getByText("กำลังเชื่อมต่อใหม่")).toBeInTheDocument();
    // Coordinates stay off the page; the list is the accessible equivalent.
    expect(container.textContent).not.toMatch(/13\.75|100\.50/);
  });

  it("shows device-reported location problems and flags low accuracy (P7-05)", () => {
    const now = Date.now();
    liveLocations.value = {
      snapshot: snapshot([
        {
          userId: ada,
          displayName: "Ada Leader",
          roleAtStart: "leader",
          latestSample: {
            lat: 13.7551,
            lng: 100.5051,
            accuracyM: 80,
            recordedAt: new Date(now - 3_000).toISOString(),
            receivedAt: new Date(now - 3_000).toISOString(),
          },
        },
        {
          userId: bo,
          displayName: "Bo Member",
          roleAtStart: "member",
          latestSample: null,
        },
        {
          userId: cy,
          displayName: "Cy Waiting",
          roleAtStart: "member",
          latestSample: null,
        },
      ]),
      positions: {},
      deviceStatuses: { [bo]: "denied", [cy]: "unavailable" },
      realtime: "live",
      error: null,
    };

    renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode={null}
        initialLive={makeLive("open", ["active", "ready", "waiting"])}
        sessionId={sessionId}
      />,
    );

    const rows = within(
      screen.getByRole("list", { name: "รายชื่อตำแหน่งนักเรียน" }),
    ).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("ความแม่นยำต่ำ");
    expect(rows[0]).toHaveTextContent("±80 ม.");
    expect(rows[1]).toHaveTextContent("ปิดสิทธิ์ตำแหน่ง");
    expect(rows[1]).toHaveTextContent("ให้นักเรียนเปิดสิทธิ์แล้วโหลดหน้าใหม่");
    expect(rows[2]).toHaveTextContent("หาตำแหน่งไม่ได้");
  });

  it("refetches the queue on a session signal from the teachers topic", async () => {
    const live = makeLive("open", ["active", "ready", "waiting"]);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        envelope(makeLive("open", ["completed", "active", "waiting"])),
      );

    renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode={null}
        initialLive={live}
        sessionId={sessionId}
      />,
    );

    expect(liveLocations.onSignal).toBeTypeOf("function");
    liveLocations.onSignal?.();

    await waitFor(() =>
      expect(
        screen.getByRole("listitem", { name: "คิวที่ 2 Root" }),
      ).toHaveTextContent("กำลังสำรวจ"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sessions/${sessionId}/group-queue`,
      { cache: "no-store" },
    );
  });

  it("renders a permission denial for a non-teacher", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      errorEnvelope("FORBIDDEN", 403),
    );
    renderLive(
      <TeacherSessionLive
        classId={classId}
        initialErrorCode="FORBIDDEN"
        initialLive={null}
        sessionId={sessionId}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "คุณไม่มีสิทธิ์ใช้กิจกรรมนี้" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "พักรอบ" })).toBeNull();
  });
});
