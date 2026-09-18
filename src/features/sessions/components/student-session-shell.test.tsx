import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIELD_LOCATION_NOTICE } from "../client/field-notice";
import {
  sessionParticipantViewSchema,
  type SessionParticipantView,
} from "../contracts";
import { StudentSessionShell } from "./student-session-shell";

// The real publisher and signal hooks run against this fake browser client,
// so the tests prove when geolocation is (and is not) touched.
type SubscribeStatus = "SUBSCRIBED" | "CHANNEL_ERROR";

const realtime = vi.hoisted(() => ({
  subscribeStatus: "SUBSCRIBED" as "SUBSCRIBED" | "CHANNEL_ERROR",
  topics: [] as string[],
  sent: [] as unknown[],
}));

vi.mock("@/lib/supabase/client", () => {
  function fakeChannel(topic: string) {
    const channel = {
      on: () => channel,
      subscribe: (callback?: (status: SubscribeStatus) => void) => {
        realtime.topics.push(topic);
        callback?.(
          topic.includes(":location:")
            ? "SUBSCRIBED"
            : realtime.subscribeStatus,
        );
        return channel;
      },
      send: async (message: unknown) => {
        realtime.sent.push(message);
        return "ok";
      },
    };
    return channel;
  }
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    realtime: { setAuth: async () => undefined },
    channel: (topic: string) => fakeChannel(topic),
    removeChannel: async () => "ok",
  };
  return { createSupabaseBrowserClient: () => client };
});

const userId = "10000000-0000-4000-8000-000000007401";
const peerId = "10000000-0000-4000-8000-000000007402";
const classId = "20000000-0000-4000-8000-000000007401";
const activityId = "60000000-0000-4000-8000-000000007401";
const groupId = "30000000-0000-4000-8000-000000007401";
const sessionGroupId = "63000000-0000-4000-8000-000000007401";
const requestId = "90000000-0000-4000-8000-000000007401";

let sessionCounter = 0;
function nextSessionId() {
  sessionCounter += 1;
  return `62000000-0000-4000-8000-${String(sessionCounter).padStart(12, "0")}`;
}

type Phase =
  | "waiting"
  | "ready"
  | "active"
  | "paused"
  | "group_completed"
  | "session_completed"
  | "participation_inactive";

function makeView(
  sessionId: string,
  phase: Phase,
  overrides: { groupsAhead?: number; queuePosition?: number } = {},
): SessionParticipantView {
  const sessionStatus =
    phase === "paused"
      ? "paused"
      : phase === "session_completed"
        ? "completed"
        : "open";
  const groupStatus = {
    waiting: "waiting",
    ready: "ready",
    active: "active",
    paused: "paused",
    group_completed: "completed",
    session_completed: "completed",
    participation_inactive: "active",
  }[phase];
  const blockedReason = {
    waiting: "group_waiting",
    ready: "group_waiting",
    active: null,
    paused: "session_paused",
    group_completed: "group_completed",
    session_completed: "session_completed",
    participation_inactive: "participation_inactive",
  }[phase];
  return sessionParticipantViewSchema.parse({
    session: {
      id: sessionId,
      classId,
      title: "Morning round",
      status: sessionStatus,
      openedAt: "2026-09-19T01:00:00.000Z",
      completedAt:
        phase === "session_completed" ? "2026-09-19T03:00:00.000Z" : null,
    },
    className: "Field Class",
    activity: {
      id: activityId,
      title: "Garden survey",
      versionNumber: 1,
      instructions: "Stay inside the boundary.",
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
      route: {
        type: "LineString",
        coordinates: [
          [100.501, 13.751],
          [100.509, 13.759],
        ],
      },
      checkpoints: [
        {
          sequenceNumber: 1,
          title: "Start",
          instructions: "Meet here",
          location: { type: "Point", coordinates: [100.505, 13.755] },
          radiusM: 20,
        },
      ],
    },
    myGroup: {
      sessionGroupId,
      groupId,
      name: "Leaf",
      status: groupStatus,
      queuePosition: overrides.queuePosition ?? 2,
      roleAtStart: "member",
      members: [
        { userId: peerId, displayName: "Ada Leader", roleAtStart: "leader" },
        { userId, displayName: "Bo Member", roleAtStart: "member" },
      ],
    },
    groupsAhead: overrides.groupsAhead ?? 1,
    permissions: {
      canPublishLocation: phase === "active",
      canSubmitObservations: phase === "active",
      blockedReason,
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

function errorEnvelope(code: string, status: number) {
  return new Response(
    JSON.stringify({
      data: null,
      error: { code, message: code, retryable: false, details: {} },
      requestId,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

let refreshCounter = 0;
/** Each refetch returns a newer refreshedAt, as the database does. */
function freshCopy(view: SessionParticipantView) {
  refreshCounter += 1;
  return {
    ...view,
    refreshedAt: new Date(
      Date.parse(view.refreshedAt) + refreshCounter * 1000,
    ).toISOString(),
  };
}

function mockFetch(respond: (url: string) => Response | Promise<Response>) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => respond(String(input)));
}

function participantFetch(view: SessionParticipantView) {
  return mockFetch((url) => {
    if (url.endsWith("/participant")) return envelope(freshCopy(view));
    if (url.endsWith("/location-samples")) {
      return envelope({ outcome: "recorded", sampleId: requestId }, 201);
    }
    throw new Error(`unexpected request ${url}`);
  });
}

const geolocation = {
  watchPosition: vi.fn<Geolocation["watchPosition"]>(() => 7),
  clearWatch: vi.fn<Geolocation["clearWatch"]>(),
  getCurrentPosition: vi.fn<Geolocation["getCurrentPosition"]>(),
};

function renderShell(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function position(latitude: number, longitude: number, accuracy: number) {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as unknown as GeolocationPosition;
}

describe("StudentSessionShell", () => {
  beforeEach(() => {
    realtime.subscribeStatus = "SUBSCRIBED";
    realtime.topics = [];
    realtime.sent = [];
    geolocation.watchPosition.mockClear();
    geolocation.clearWatch.mockClear();
    geolocation.getCurrentPosition.mockClear();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: geolocation,
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it.each([
    ["waiting", "กลุ่มของคุณอยู่คิวที่ 3", "รออีก 2 กลุ่มก่อนถึงคิวของคุณ"],
    ["ready", "กลุ่มของคุณเป็นกลุ่มถัดไป", "เตรียมพร้อมสำรวจ"],
    ["paused", "ครูพักรอบสำรวจชั่วคราว", "หยุดส่งตำแหน่งแล้ว รอครูเปิดรอบต่อ"],
    [
      "group_completed",
      "กลุ่มของคุณสำรวจเสร็จแล้ว",
      "รอบสำรวจยังดำเนินต่อสำหรับกลุ่มอื่น",
    ],
    ["session_completed", "รอบสำรวจนี้จบแล้ว", "ครูจบรอบสำรวจแล้ว"],
    ["participation_inactive", "คุณไม่ได้อยู่ในรอบสำรวจนี้แล้ว", "แจ้งครู"],
  ] as const)(
    "renders the %s state and never touches geolocation",
    async (phase, title, detail) => {
      const sessionId = nextSessionId();
      const view = makeView(sessionId, phase, {
        groupsAhead: 2,
        queuePosition: 3,
      });
      const fetchMock = participantFetch(view);

      renderShell(
        <StudentSessionShell
          initialErrorCode={null}
          initialView={view}
          sessionId={sessionId}
          userId={userId}
        />,
      );

      expect(
        await screen.findByRole("heading", { name: title }),
      ).toBeInTheDocument();
      expect(screen.getByText(detail, { exact: false })).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "กิจกรรม: Garden survey" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Stay inside the boundary.")).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: /ภาพร่างพิกัด/ }),
      ).toBeInTheDocument();

      if (phase === "participation_inactive") {
        // A refused group topic is never joined for an inactive participant.
        expect(realtime.topics).toEqual([]);
      } else {
        // The group signal topic is joined and its SUBSCRIBED refetches the view.
        await waitFor(() =>
          expect(realtime.topics).toContain(
            `session:${sessionId}:group:${groupId}`,
          ),
        );
        await waitFor(() =>
          expect(fetchMock).toHaveBeenCalledWith(
            `/api/sessions/${sessionId}/participant`,
            { cache: "no-store" },
          ),
        );
      }

      expect(screen.queryByText(FIELD_LOCATION_NOTICE.title)).toBeNull();
      expect(geolocation.watchPosition).not.toHaveBeenCalled();
      expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
      expect(
        realtime.topics.some((topic) => topic.includes(":location:")),
      ).toBe(false);
    },
  );

  it("gates field-mode publishing on the location notice, then shows accuracy without coordinates", async () => {
    const user = userEvent.setup();
    const sessionId = nextSessionId();
    const view = makeView(sessionId, "active");
    const fetchMock = participantFetch(view);

    renderShell(
      <StudentSessionShell
        initialErrorCode={null}
        initialView={view}
        sessionId={sessionId}
        userId={userId}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "กลุ่มของคุณกำลังสำรวจ" }),
    ).toBeInTheDocument();
    const notice = screen.getByRole("region", {
      name: FIELD_LOCATION_NOTICE.title,
    });
    for (const point of FIELD_LOCATION_NOTICE.points) {
      expect(within(notice).getByText(point)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("region", { name: "สถานะโหมดสนาม" }),
    ).toHaveTextContent("ยังไม่แชร์ตำแหน่ง");

    // The view refetch after SUBSCRIBED lands, and still nothing is watched.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/sessions/${sessionId}/participant`,
        { cache: "no-store" },
      ),
    );
    expect(geolocation.watchPosition).not.toHaveBeenCalled();

    await user.click(
      within(notice).getByRole("button", {
        name: FIELD_LOCATION_NOTICE.action,
      }),
    );

    await waitFor(() => expect(geolocation.watchPosition).toHaveBeenCalled());
    expect(
      screen.queryByRole("region", { name: FIELD_LOCATION_NOTICE.title }),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(
        `ai-escort:field-location-notice:${sessionId}`,
      ),
    ).toBe("1");
    expect(await screen.findByText("กำลังหาตำแหน่ง...")).toBeInTheDocument();
    expect(realtime.topics).toContain(
      `session:${sessionId}:location:${userId}`,
    );

    const [onFix] = geolocation.watchPosition.mock.calls.at(-1)!;
    act(() => onFix(position(13.7551234, 100.5059876, 7.6)));

    const panel = await screen.findByRole("region", {
      name: /ส่งตำแหน่งให้ครูอยู่/,
    });
    expect(panel).toHaveTextContent("แม่นยำ ±8 ม.");
    expect(
      screen.getByRole("region", { name: "สถานะโหมดสนาม" }),
    ).toHaveTextContent("±8 ม.");
    // The fix travels on the private topic; no coordinate is rendered for
    // the student, and no peer position exists in the view at all.
    expect(realtime.sent).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/13\.755|100\.505/);
    expect(screen.getByText("Ada Leader")).toBeInTheDocument();
  });

  it("explains a denied location permission with a way out", async () => {
    const user = userEvent.setup();
    const sessionId = nextSessionId();
    const view = makeView(sessionId, "active");
    participantFetch(view);

    renderShell(
      <StudentSessionShell
        initialErrorCode={null}
        initialView={view}
        sessionId={sessionId}
        userId={userId}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: FIELD_LOCATION_NOTICE.action }),
    );
    await waitFor(() => expect(geolocation.watchPosition).toHaveBeenCalled());
    const onError = geolocation.watchPosition.mock.calls.at(-1)![1]!;
    act(() =>
      onError({
        code: 1,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: "denied",
      } as GeolocationPositionError),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("ไม่ได้รับสิทธิ์ตำแหน่ง");
    expect(alert).toHaveTextContent("เปิดสิทธิ์ตำแหน่งให้เว็บนี้");
    expect(
      within(alert).getByRole("button", { name: "โหลดหน้าใหม่" }),
    ).toBeInTheDocument();
  });

  it("keeps an acknowledged notice for the same session in this tab", async () => {
    const sessionId = nextSessionId();
    window.sessionStorage.setItem(
      `ai-escort:field-location-notice:${sessionId}`,
      "1",
    );
    const view = makeView(sessionId, "active");
    participantFetch(view);

    renderShell(
      <StudentSessionShell
        initialErrorCode={null}
        initialView={view}
        sessionId={sessionId}
        userId={userId}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "กลุ่มของคุณกำลังสำรวจ" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(FIELD_LOCATION_NOTICE.title)).toBeNull();
    await waitFor(() => expect(geolocation.watchPosition).toHaveBeenCalled());
  });

  it("shows loading, then permission denied without a stale view", async () => {
    const sessionId = nextSessionId();
    let respond: (value: Response) => void = () => undefined;
    mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );

    renderShell(
      <StudentSessionShell
        initialErrorCode={null}
        initialView={null}
        sessionId={sessionId}
        userId={userId}
      />,
    );

    expect(await screen.findByText("กำลังโหลดรอบสำรวจ...")).toBeInTheDocument();
    respond(errorEnvelope("FORBIDDEN", 403));

    expect(
      await screen.findByRole("heading", {
        name: "คุณไม่ได้อยู่ในรอบสำรวจนี้",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "กลับหน้าหลัก" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
  });

  it("renders the server permission denial immediately", () => {
    const sessionId = nextSessionId();
    mockFetch(() => errorEnvelope("FORBIDDEN", 403));

    renderShell(
      <StudentSessionShell
        initialErrorCode="FORBIDDEN"
        initialView={null}
        sessionId={sessionId}
        userId={userId}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "คุณไม่ได้อยู่ในรอบสำรวจนี้" }),
    ).toBeInTheDocument();
  });

  it("marks the view stale when a refresh fails and while reconnecting", async () => {
    realtime.subscribeStatus = "CHANNEL_ERROR";
    const sessionId = nextSessionId();
    const view = makeView(sessionId, "waiting");
    mockFetch(() => Promise.reject(new TypeError("network down")));

    renderShell(
      <StudentSessionShell
        initialErrorCode={null}
        initialView={view}
        sessionId={sessionId}
        userId={userId}
      />,
    );

    expect(await screen.findByText("กำลังเชื่อมต่อใหม่")).toBeInTheDocument();
    const stale = await screen.findByRole("alert");
    expect(stale).toHaveTextContent("อัปเดตสถานะไม่สำเร็จ");
    expect(
      within(stale).getByRole("button", { name: "ลองใหม่" }),
    ).toBeEnabled();
    // The last loaded state stays readable.
    expect(
      screen.getByRole("heading", { name: "กลุ่มของคุณอยู่คิวที่ 2" }),
    ).toBeInTheDocument();
  });

  it("shows the offline state and stops field publishing", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const sessionId = nextSessionId();
    window.sessionStorage.setItem(
      `ai-escort:field-location-notice:${sessionId}`,
      "1",
    );
    const view = makeView(sessionId, "active");
    participantFetch(view);

    renderShell(
      <StudentSessionShell
        initialErrorCode={null}
        initialView={view}
        sessionId={sessionId}
        userId={userId}
      />,
    );

    expect(await screen.findByText("ออฟไลน์อยู่")).toBeInTheDocument();
    expect(
      await screen.findByRole("region", {
        name: /ออฟไลน์ · หยุดส่งตำแหน่งชั่วคราว/,
      }),
    ).toBeInTheDocument();
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
  });
});
