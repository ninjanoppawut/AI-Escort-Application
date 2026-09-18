import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  observationDraftSchema,
  sessionObservationsSchema,
  type SessionObservations,
} from "../contracts";
import { OBSERVATION_BLOCKED_REASON_LABELS } from "../errors";
import {
  SessionObservationsPanel,
  startBlockedMessage,
} from "./session-observations-panel";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const sessionId = "62000000-0000-4000-8000-000000008501";
const classId = "20000000-0000-4000-8000-000000008501";
const activityId = "60000000-0000-4000-8000-000000008501";
const firstId = "81000000-0000-4000-8000-000000008501";
const secondId = "81000000-0000-4000-8000-000000008502";
const requestId = "90000000-0000-4000-8000-000000008501";

function draft(id: string, overrides: Record<string, unknown> = {}) {
  return observationDraftSchema.parse({
    id,
    clientGeneratedId: id.replace(/^81/, "82"),
    status: "draft",
    version: 1,
    capture: {
      locationStatus: "captured",
      lat: 13.7551,
      lng: 100.5051,
      accuracyM: 8,
      capturedAt: "2026-09-19T02:00:00+00:00",
      unavailableReason: null,
    },
    draft: {
      commonName: "มะม่วง",
      scientificName: "Mangifera indica",
      evidenceNote: null,
    },
    session: { id: sessionId, classId, title: "Morning round", status: "open" },
    activity: { id: activityId, title: "Garden survey" },
    groupStatus: "active",
    permissions: { canEdit: true, blockedCode: null, blockedReason: null },
    createdAt: "2026-09-19T02:00:00+00:00",
    updatedAt: "2026-09-19T02:00:00+00:00",
    ...overrides,
  });
}

function list(
  overrides: Partial<SessionObservations> = {},
): SessionObservations {
  return sessionObservationsSchema.parse({
    sessionId,
    sessionStatus: "open",
    canStart: true,
    startBlockedCode: null,
    startBlockedReason: null,
    items: [],
    hasMore: false,
    refreshedAt: "2026-09-19T02:00:00+00:00",
    ...overrides,
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

function mockApi(handlers: {
  list: () => SessionObservations;
  start?: () => Response | Promise<Response>;
}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === `/api/sessions/${sessionId}/observations`) {
      return envelope(handlers.list());
    }
    if (url === "/api/observations/start" && handlers.start) {
      return handlers.start();
    }
    throw new Error(`unexpected request ${url}`);
  });
}

function listCalls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.filter(
    ([input]) => String(input) === `/api/sessions/${sessionId}/observations`,
  ).length;
}

const geolocation = {
  watchPosition: vi.fn<Geolocation["watchPosition"]>(() => 1),
  clearWatch: vi.fn<Geolocation["clearWatch"]>(),
  getCurrentPosition: vi.fn<Geolocation["getCurrentPosition"]>(),
};

function renderPanel(viewRefreshedAt = "2026-09-19T02:00:00.000Z") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const wrap = (ui: ReactNode) => (
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
  const view = render(
    wrap(
      <SessionObservationsPanel
        activityId={activityId}
        sessionId={sessionId}
        viewRefreshedAt={viewRefreshedAt}
      />,
    ),
  );
  return {
    ...view,
    queryClient,
    rerenderWith: (next: string) =>
      view.rerender(
        wrap(
          <SessionObservationsPanel
            activityId={activityId}
            sessionId={sessionId}
            viewRefreshedAt={next}
          />,
        ),
      ),
  };
}

describe("startBlockedMessage", () => {
  it("names the documented reason and a way forward", () => {
    expect(startBlockedMessage(list())).toBeNull();
    expect(
      startBlockedMessage(
        list({
          canStart: false,
          startBlockedCode: "GROUP_NOT_ACTIVE",
          startBlockedReason: "group_waiting",
        }),
      ),
    ).toEqual({
      code: "GROUP_NOT_ACTIVE",
      title: OBSERVATION_BLOCKED_REASON_LABELS.group_waiting,
      description: "เริ่มบันทึกได้เมื่อครูเริ่มรอบสำรวจของกลุ่มคุณ",
    });
    expect(
      startBlockedMessage(
        list({
          canStart: false,
          startBlockedCode: "SESSION_PAUSED",
          startBlockedReason: null,
        }),
      ),
    ).toMatchObject({ code: "SESSION_PAUSED", title: "กิจกรรมหยุดชั่วคราว" });
    expect(
      startBlockedMessage(
        list({
          canStart: false,
          startBlockedCode: "SOMETHING_NEW",
          startBlockedReason: null,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("SessionObservationsPanel", () => {
  beforeEach(() => {
    router.push.mockReset();
    geolocation.watchPosition.mockClear();
    geolocation.clearWatch.mockClear();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: geolocation,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a start and lists the student's own drafts", async () => {
    mockApi({
      list: () =>
        list({
          items: [
            draft(firstId),
            draft(secondId, {
              capture: {
                locationStatus: "unavailable",
                lat: null,
                lng: null,
                accuracyM: null,
                capturedAt: "2026-09-19T02:05:00+00:00",
                unavailableReason: "timeout",
              },
              draft: {
                commonName: null,
                scientificName: null,
                evidenceNote: null,
              },
            }),
          ],
        }),
    });
    renderPanel();

    expect(
      await screen.findByRole("heading", { name: "การสังเกตของฉัน (2)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "เพิ่มการสังเกต" }),
    ).toBeEnabled();

    const items = within(
      screen.getByRole("list", { name: "การสังเกตของฉันในรอบนี้" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("ฉบับร่าง");
    expect(items[0]).toHaveTextContent("มะม่วง");
    expect(within(items[0]!).getByText("Mangifera indica")).toHaveClass(
      "italic",
    );
    expect(items[0]).toHaveTextContent("±8 ม.");
    expect(within(items[0]!).getByRole("link")).toHaveAttribute(
      "href",
      `/observations/${firstId}`,
    );
    expect(items[1]).toHaveTextContent("ยังไม่ได้ตั้งชื่อ");
    expect(items[1]).toHaveTextContent("⚑ ไม่มีพิกัด");
    // Capture coordinates are not repeated in the list.
    expect(screen.queryByText(/13\.755/)).toBeNull();
  });

  it("shows start disabled with the reason while the group waits", async () => {
    mockApi({
      list: () =>
        list({
          canStart: false,
          startBlockedCode: "GROUP_NOT_ACTIVE",
          startBlockedReason: "group_waiting",
        }),
    });
    renderPanel();

    const start = await screen.findByRole("button", { name: "เพิ่มการสังเกต" });
    await waitFor(() => expect(start).toBeDisabled());
    const reason = document.getElementById(
      start.getAttribute("aria-describedby")!,
    )!;
    expect(reason).toHaveTextContent("กลุ่มของคุณยังไม่ถึงรอบสำรวจ");
    expect(reason).toHaveTextContent(
      "เริ่มบันทึกได้เมื่อครูเริ่มรอบสำรวจของกลุ่มคุณ",
    );
    expect(screen.getByText("ยังไม่มีการสังเกตในรอบนี้")).toBeVisible();
  });

  it("keeps drafts reachable while paused but refuses a new start", async () => {
    mockApi({
      list: () =>
        list({
          sessionStatus: "paused",
          canStart: false,
          startBlockedCode: "SESSION_PAUSED",
          startBlockedReason: null,
          items: [draft(firstId, { groupStatus: "active" })],
        }),
    });
    renderPanel();

    const start = await screen.findByRole("button", { name: "เพิ่มการสังเกต" });
    await waitFor(() => expect(start).toBeDisabled());
    expect(screen.getByText("กิจกรรมหยุดชั่วคราว")).toBeVisible();
    expect(
      screen.getByText(
        "· ร่างที่บันทึกไว้ยังแก้ไขได้ แต่เริ่มบันทึกใหม่ไม่ได้จนกว่าครูจะเปิดต่อ",
        { exact: false },
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /มะม่วง/ })).toHaveAttribute(
      "href",
      `/observations/${firstId}`,
    );
  });

  it("disables the start offline with the reason", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mockApi({ list: () => list() });
    renderPanel();

    const start = await screen.findByRole("button", { name: "เพิ่มการสังเกต" });
    await waitFor(() => expect(start).toBeDisabled());
    expect(
      document.getElementById(start.getAttribute("aria-describedby")!),
    ).toHaveTextContent("ออฟไลน์ · เริ่มบันทึกใหม่ได้เมื่อกลับมาออนไลน์");
  });

  it("refetches when the shell's participant view refreshes", async () => {
    const fetchMock = mockApi({ list: () => list() });
    const { rerenderWith } = renderPanel();

    await screen.findByRole("button", { name: "เพิ่มการสังเกต" });
    expect(listCalls(fetchMock)).toBe(1);

    rerenderWith("2026-09-19T02:00:00.000Z");
    expect(listCalls(fetchMock)).toBe(1);

    rerenderWith("2026-09-19T02:01:00.000Z");
    await waitFor(() => expect(listCalls(fetchMock)).toBe(2));
  });

  it("opens the capture sheet and goes to the new draft", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      list: () => list(),
      start: () =>
        envelope({ outcome: "created", observation: draft(firstId) }, 201),
    });
    const { queryClient } = renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "เพิ่มการสังเกต" }),
    );
    expect(
      screen.getByRole("dialog", { name: "เพิ่มการสังเกต" }),
    ).toBeVisible();

    const [onFix] = geolocation.watchPosition.mock.calls.at(-1)!;
    act(() =>
      onFix({
        coords: {
          latitude: 13.7551,
          longitude: 100.5051,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as unknown as GeolocationPosition),
    );
    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/observations/${firstId}`),
    );
    expect(
      queryClient.getQueryData(["observations", "detail", firstId]),
    ).toMatchObject({ id: firstId, status: "draft" });
    await waitFor(() => expect(listCalls(fetchMock)).toBe(2));
  });

  it("closes the sheet on a server denial, refetches, and explains it", async () => {
    const user = userEvent.setup();
    let paused = false;
    const fetchMock = mockApi({
      list: () =>
        paused
          ? list({
              sessionStatus: "paused",
              canStart: false,
              startBlockedCode: "SESSION_PAUSED",
            })
          : list(),
      start: () => {
        paused = true;
        return errorEnvelope("SESSION_PAUSED", 409);
      },
    });
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "เพิ่มการสังเกต" }),
    );
    const [onFix] = geolocation.watchPosition.mock.calls.at(-1)!;
    act(() =>
      onFix({
        coords: {
          latitude: 13.7551,
          longitude: 100.5051,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as unknown as GeolocationPosition),
    );
    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(listCalls(fetchMock)).toBe(2));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "เพิ่มการสังเกต" }),
      ).toBeDisabled(),
    );
    expect(screen.getByText("กิจกรรมหยุดชั่วคราว")).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
    expect(geolocation.clearWatch).toHaveBeenCalled();
  });

  it("does not navigate when the sheet was closed before the start finished", async () => {
    const user = userEvent.setup();
    let finish: (response: Response) => void = () => undefined;
    let items: ReturnType<typeof draft>[] = [];
    const fetchMock = mockApi({
      list: () => list({ items }),
      start: () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "เพิ่มการสังเกต" }),
    );
    const [onFix] = geolocation.watchPosition.mock.calls.at(-1)!;
    act(() =>
      onFix({
        coords: {
          latitude: 13.7551,
          longitude: 100.5051,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as unknown as GeolocationPosition),
    );
    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));
    expect(await screen.findByText("กำลังสร้างร่าง...")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "ปิด" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    items = [draft(firstId)];
    await act(async () => {
      finish(
        envelope({ outcome: "created", observation: draft(firstId) }, 201),
      );
    });

    await waitFor(() => expect(listCalls(fetchMock)).toBeGreaterThanOrEqual(3));
    expect(
      await screen.findByRole("heading", { name: "การสังเกตของฉัน (1)" }),
    ).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("explains a start refusal the list does not yet reflect", async () => {
    const user = userEvent.setup();
    mockApi({
      list: () => list(),
      start: () =>
        errorEnvelope("GROUP_NOT_ACTIVE", 409, { reason: "group_completed" }),
    });
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "เพิ่มการสังเกต" }),
    );
    const [onFix] = geolocation.watchPosition.mock.calls.at(-1)!;
    act(() =>
      onFix({
        coords: {
          latitude: 13.7551,
          longitude: 100.5051,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as unknown as GeolocationPosition),
    );
    await user.click(screen.getByRole("button", { name: "ใช้ตำแหน่งนี้" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "เริ่มบันทึกไม่ได้ · ยังไม่ถึงรอบกลุ่มของคุณ",
    );
  });

  it("shows a load failure with retry, then the list", async () => {
    const user = userEvent.setup();
    let fail = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (fail) throw new TypeError("Failed to fetch");
      return envelope(list());
    });
    renderPanel();

    expect(await screen.findByText("โหลดการสังเกตไม่สำเร็จ")).toBeVisible();
    fail = false;
    await user.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(
      await screen.findByRole("button", { name: "เพิ่มการสังเกต" }),
    ).toBeEnabled();
  });
});
