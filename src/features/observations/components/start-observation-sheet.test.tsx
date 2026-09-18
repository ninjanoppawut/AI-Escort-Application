import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAPTURE_TIME_NOTICE } from "../capture";
import { observationDraftSchema } from "../contracts";
import {
  START_RETRY_POLICY,
  StartObservationSheet,
} from "./start-observation-sheet";

const sessionId = "62000000-0000-4000-8000-000000008401";
const classId = "20000000-0000-4000-8000-000000008401";
const activityId = "60000000-0000-4000-8000-000000008401";
const observationId = "81000000-0000-4000-8000-000000008401";
const requestId = "90000000-0000-4000-8000-000000008401";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const geolocation = {
  watchPosition: vi.fn<Geolocation["watchPosition"]>(),
  clearWatch: vi.fn<Geolocation["clearWatch"]>(),
  getCurrentPosition: vi.fn<Geolocation["getCurrentPosition"]>(),
};

let nextWatchId = 0;

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

function positionError(code: 1 | 2 | 3) {
  return {
    code,
    message: "",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

function lastWatch() {
  const call = geolocation.watchPosition.mock.calls.at(-1);
  if (!call) throw new Error("no watch started");
  return { onFix: call[0], onError: call[1]!, options: call[2] };
}

function draftResponse(capture: Record<string, unknown>) {
  return observationDraftSchema.parse({
    id: observationId,
    clientGeneratedId: "82000000-0000-4000-8000-000000008401",
    status: "draft",
    version: 1,
    capture: {
      lat: null,
      lng: null,
      accuracyM: null,
      unavailableReason: null,
      capturedAt: "2026-09-19T02:00:00+00:00",
      ...capture,
    },
    draft: { commonName: null, scientificName: null, evidenceNote: null },
    session: { id: sessionId, classId, title: "Morning round", status: "open" },
    activity: { id: activityId, title: "Garden survey" },
    groupStatus: "active",
    permissions: { canEdit: true, blockedCode: null, blockedReason: null },
    createdAt: "2026-09-19T02:00:00+00:00",
    updatedAt: "2026-09-19T02:00:00+00:00",
    refreshedAt: "2026-09-19T02:00:01+00:00",
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

type StartBody = {
  clientGeneratedId: string;
  sessionId: string;
  capture: Record<string, unknown>;
};

function mockStart(
  respond: (body: StartBody, call: number) => Response | Promise<Response>,
) {
  const bodies: StartBody[] = [];
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url !== "/api/observations/start") {
        throw new Error(`unexpected request ${url}`);
      }
      const body = JSON.parse(String(init?.body)) as StartBody;
      bodies.push(body);
      return respond(body, bodies.length);
    });
  return { fetchMock, bodies };
}

function renderSheet(
  handlers: {
    onClose?: () => void;
    onStarted?: (observation: unknown) => void;
    onDenied?: (error: unknown) => void;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const props = {
    onClose: handlers.onClose ?? vi.fn(),
    onStarted: handlers.onStarted ?? vi.fn(),
    onDenied: handlers.onDenied ?? vi.fn(),
  };
  const wrap = (ui: ReactNode) => (
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
  const view = render(
    wrap(<StartObservationSheet sessionId={sessionId} {...props} />),
  );
  return { ...view, ...props };
}

describe("StartObservationSheet", () => {
  const originalDelay = START_RETRY_POLICY.baseDelayMs;

  beforeEach(() => {
    START_RETRY_POLICY.baseDelayMs = 1;
    nextWatchId = 0;
    geolocation.watchPosition.mockReset();
    geolocation.watchPosition.mockImplementation(() => {
      nextWatchId += 1;
      return nextWatchId;
    });
    geolocation.clearWatch.mockReset();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: geolocation,
    });
  });

  afterEach(() => {
    START_RETRY_POLICY.baseDelayMs = originalDelay;
    vi.restoreAllMocks();
  });

  it("asks for a fresh high-accuracy fix and shows the locating state", () => {
    renderSheet();

    expect(
      screen.getByRole("dialog", { name: "เพิ่มการสังเกต" }),
    ).toBeVisible();
    expect(lastWatch().options).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    });
    expect(screen.getByText("กำลังหาตำแหน่ง...")).toBeVisible();
    expect(screen.getByText("0 วินาที")).toBeInTheDocument();
    expect(screen.getByText(CAPTURE_TIME_NOTICE)).toBeVisible();
    expect(screen.queryByRole("button", { name: "บันทึกแบบมีธง" })).toBeNull();
  });

  it("shows a good fix and starts a captured draft with its coordinates", async () => {
    const user = userEvent.setup();
    const onStarted = vi.fn();
    const { bodies } = mockStart(() =>
      envelope(
        {
          outcome: "created",
          observation: draftResponse({
            locationStatus: "captured",
            lat: 13.7551,
            lng: 100.5051,
            accuracyM: 8,
          }),
        },
        201,
      ),
    );
    renderSheet({ onStarted });

    act(() => lastWatch().onFix(position(13.75510012, 100.50510049, 8)));

    const indicator = screen.getByText("· แม่นยำดี").closest("p")!;
    expect(indicator).toHaveTextContent("±8 ม.");
    expect(indicator).toHaveAttribute("data-location-quality", "good");
    expect(screen.getByText("13.75510, 100.50510")).toBeVisible();
    expect(screen.queryByRole("button", { name: "รอสัญญาณดีขึ้น" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.sessionId).toBe(sessionId);
    expect(bodies[0]!.clientGeneratedId).toMatch(uuidPattern);
    expect(bodies[0]!.capture).toEqual({
      locationStatus: "captured",
      lat: 13.7551,
      lng: 100.5051,
      accuracyM: 8,
      capturedAt: expect.stringMatching(/Z$/),
    });
    // The capture watch stops once the capture is sent.
    expect(geolocation.clearWatch).toHaveBeenCalledWith(1);
  });

  it("warns about poor accuracy but never blocks using it", async () => {
    const user = userEvent.setup();
    const { bodies } = mockStart(() =>
      envelope(
        {
          outcome: "created",
          observation: draftResponse({
            locationStatus: "captured",
            lat: 13.7551,
            lng: 100.5051,
            accuracyM: 38,
          }),
        },
        201,
      ),
    );
    renderSheet();

    act(() => lastWatch().onFix(position(13.7551, 100.5051, 38)));

    expect(
      screen.getByText("สัญญาณตำแหน่งอ่อน (±38 ม.) — รอสักครู่ให้แม่นขึ้น"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "รอสัญญาณดีขึ้น" }));
    expect(
      screen.getByText("กำลังรอสัญญาณที่แม่นขึ้น · ใช้ตำแหน่งนี้ได้ทุกเมื่อ"),
    ).toBeVisible();
    // Waiting keeps the same watch; a better fix replaces the warning.
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);
    act(() => lastWatch().onFix(position(13.7551, 100.5051, 45)));
    expect(
      screen.getByText("สัญญาณตำแหน่งอ่อน (±45 ม.) — รอสักครู่ให้แม่นขึ้น"),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]!.capture).toMatchObject({
      locationStatus: "captured",
      accuracyM: 45,
    });
  });

  it("blocks a denied permission with steps and never offers the flagged save", async () => {
    const user = userEvent.setup();
    renderSheet();

    act(() => lastWatch().onError!(positionError(1)));

    const denied = screen.getByRole("alert");
    expect(denied).toHaveTextContent("ไม่ได้รับสิทธิ์ตำแหน่ง");
    expect(denied).toHaveTextContent("Chrome (Android)");
    expect(denied).toHaveTextContent("Safari (iPhone)");
    expect(geolocation.clearWatch).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("button", { name: "บันทึกแบบมีธง" })).toBeNull();

    await user.click(
      within(denied).getByRole("button", { name: "ลองอีกครั้ง" }),
    );
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2);
    expect(screen.getByText("กำลังหาตำแหน่ง...")).toBeVisible();

    // Still denied after a retry: still no flagged save (owner item 36).
    act(() => lastWatch().onError!(positionError(1)));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "ไม่ได้รับสิทธิ์ตำแหน่ง",
    );
    expect(screen.queryByRole("button", { name: "บันทึกแบบมีธง" })).toBeNull();
  });

  it("offers the flagged save for an unavailable position only after a retry", async () => {
    const user = userEvent.setup();
    const { bodies } = mockStart(() =>
      envelope(
        {
          outcome: "created",
          observation: draftResponse({
            locationStatus: "unavailable",
            unavailableReason: "position_unavailable",
          }),
        },
        201,
      ),
    );
    renderSheet();

    act(() => lastWatch().onError!(positionError(2)));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("ยังหาตำแหน่งไม่ได้");
    expect(
      within(alert).getByRole("button", { name: "รอสัญญาณต่อ" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "บันทึกแบบมีธง" })).toBeNull();

    await user.click(
      within(alert).getByRole("button", { name: "ลองหาตำแหน่งใหม่" }),
    );
    expect(geolocation.clearWatch).toHaveBeenCalledWith(1);
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2);

    act(() => lastWatch().onError!(positionError(2)));
    await user.click(screen.getByRole("button", { name: "บันทึกแบบมีธง" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]!.capture).toEqual({
      locationStatus: "unavailable",
      unavailableReason: "position_unavailable",
      capturedAt: expect.stringMatching(/Z$/),
    });
    // Never a coordinate next to an unavailable flag (D-020).
    expect(bodies[0]!.capture).not.toHaveProperty("lat");
    expect(bodies[0]!.capture).not.toHaveProperty("lng");
    expect(bodies[0]!.capture).not.toHaveProperty("accuracyM");
  });

  it("offers the flagged save at once after a timeout", async () => {
    const user = userEvent.setup();
    const { bodies } = mockStart(() =>
      envelope(
        {
          outcome: "created",
          observation: draftResponse({
            locationStatus: "unavailable",
            unavailableReason: "timeout",
          }),
        },
        201,
      ),
    );
    renderSheet();

    act(() => lastWatch().onError!(positionError(3)));
    expect(screen.getByRole("alert")).toHaveAttribute("data-reason", "timeout");
    await user.click(screen.getByRole("button", { name: "บันทึกแบบมีธง" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]!.capture).toMatchObject({
      locationStatus: "unavailable",
      unavailableReason: "timeout",
    });
  });

  it("keeps the same watch while waiting after a failure and recovers with a fix", async () => {
    const user = userEvent.setup();
    renderSheet();

    act(() => lastWatch().onError!(positionError(2)));
    await user.click(screen.getByRole("button", { name: "รอสัญญาณต่อ" }));

    expect(screen.getByText("กำลังหาตำแหน่ง...")).toBeVisible();
    expect(
      screen.getByText("กำลังรอสัญญาณต่อ ถ้าได้ตำแหน่งจะแสดงทันที"),
    ).toBeVisible();
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(geolocation.clearWatch).not.toHaveBeenCalled();

    act(() => lastWatch().onFix(position(13.7551, 100.5051, 12)));
    expect(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" })).toBeEnabled();
  });

  it("treats a browser without geolocation as unsupported", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
    const { bodies } = mockStart(() =>
      envelope(
        {
          outcome: "created",
          observation: draftResponse({
            locationStatus: "unavailable",
            unavailableReason: "unsupported",
          }),
        },
        201,
      ),
    );
    renderSheet();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-reason", "unsupported");
    expect(
      within(alert).queryByRole("button", { name: "รอสัญญาณต่อ" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "บันทึกแบบมีธง" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "ลองหาตำแหน่งใหม่" }));
    await user.click(screen.getByRole("button", { name: "บันทึกแบบมีธง" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]!.capture).toMatchObject({
      locationStatus: "unavailable",
      unavailableReason: "unsupported",
    });
  });

  it("resends the same capture with the same ID after a dropped connection", async () => {
    const user = userEvent.setup();
    const { bodies } = mockStart((_, call) => {
      if (call <= 3) throw new TypeError("Failed to fetch");
      return envelope(
        {
          outcome: "existing",
          observation: draftResponse({
            locationStatus: "captured",
            lat: 13.7551,
            lng: 100.5051,
            accuracyM: 9,
          }),
        },
        200,
      );
    });
    const onStarted = vi.fn();
    renderSheet({ onStarted });

    act(() => lastWatch().onFix(position(13.7551, 100.5051, 9)));
    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));

    // One request and two automatic retries, then a manual resend.
    expect(
      await screen.findByText("สร้างร่างไม่สำเร็จ เพราะเชื่อมต่อไม่ได้"),
    ).toBeVisible();
    expect(bodies).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "ส่งอีกครั้ง" }));

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(4);
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });

  it("mints a new ID and captures again after IDEMPOTENCY_KEY_REUSE", async () => {
    const user = userEvent.setup();
    const { bodies } = mockStart((_, call) =>
      call === 1
        ? errorEnvelope("IDEMPOTENCY_KEY_REUSE", 409)
        : envelope(
            {
              outcome: "created",
              observation: draftResponse({
                locationStatus: "captured",
                lat: 13.7552,
                lng: 100.5052,
                accuracyM: 7,
              }),
            },
            201,
          ),
    );
    const onStarted = vi.fn();
    renderSheet({ onStarted });

    act(() => lastWatch().onFix(position(13.7551, 100.5051, 9)));
    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));

    expect(await screen.findByText("คำขอนี้ไม่ตรงกับรายการเดิม")).toBeVisible();
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2);
    act(() => lastWatch().onFix(position(13.7552, 100.5052, 7)));
    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.clientGeneratedId).toMatch(uuidPattern);
    expect(bodies[1]!.clientGeneratedId).not.toBe(bodies[0]!.clientGeneratedId);
  });

  it("hands a server denial to the caller without retrying", async () => {
    const user = userEvent.setup();
    const { bodies } = mockStart(() => errorEnvelope("SESSION_PAUSED", 409));
    const onDenied = vi.fn();
    renderSheet({ onDenied });

    act(() => lastWatch().onFix(position(13.7551, 100.5051, 9)));
    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));

    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(1);
    expect(onDenied.mock.calls[0]![0]).toMatchObject({
      apiError: { code: "SESSION_PAUSED" },
    });
  });

  it("closes from the header and stops watching on unmount", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = renderSheet({ onClose });

    await user.click(screen.getByRole("button", { name: "ปิด" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(geolocation.clearWatch).toHaveBeenCalledWith(1);
  });
});
