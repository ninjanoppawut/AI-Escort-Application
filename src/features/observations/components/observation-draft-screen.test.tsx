import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CAPTURE_TIME_NOTICE } from "../capture";
import { observationDraftSchema, type ObservationDraft } from "../contracts";
import {
  DRAFT_PRIVACY_LABEL,
  ObservationDraftScreen,
} from "./observation-draft-screen";

const observationId = "81000000-0000-4000-8000-000000008601";
const sessionId = "62000000-0000-4000-8000-000000008601";
const classId = "20000000-0000-4000-8000-000000008601";
const activityId = "60000000-0000-4000-8000-000000008601";
const requestId = "90000000-0000-4000-8000-000000008601";

function makeDraft(overrides: Record<string, unknown> = {}): ObservationDraft {
  return observationDraftSchema.parse({
    id: observationId,
    clientGeneratedId: "82000000-0000-4000-8000-000000008601",
    status: "draft",
    version: 2,
    capture: {
      locationStatus: "captured",
      lat: 13.7551,
      lng: 100.5051,
      accuracyM: 8,
      capturedAt: "2026-09-19T02:00:00+00:00",
      unavailableReason: null,
    },
    draft: { commonName: "มะม่วง", scientificName: null, evidenceNote: null },
    session: { id: sessionId, classId, title: "Morning round", status: "open" },
    activity: { id: activityId, title: "Garden survey" },
    groupStatus: "active",
    permissions: { canEdit: true, blockedCode: null, blockedReason: null },
    createdAt: "2026-09-19T02:00:00+00:00",
    updatedAt: "2026-09-19T02:00:00+00:00",
    refreshedAt: "2026-09-19T02:10:00+00:00",
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

interface PutBody {
  expectedVersion: number;
  commonName: string | null;
  scientificName: string | null;
  evidenceNote: string | null;
}

function mockApi(handlers: {
  get?: () => Response | Promise<Response>;
  put?: (body: PutBody, call: number) => Response;
}) {
  const puts: PutBody[] = [];
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `/api/observations/${observationId}/draft`) {
        const body = JSON.parse(String(init?.body)) as PutBody;
        puts.push(body);
        if (!handlers.put) throw new Error("unexpected PUT");
        return handlers.put(body, puts.length);
      }
      if (url === `/api/observations/${observationId}`) {
        if (!handlers.get) throw new Error("unexpected GET");
        return handlers.get();
      }
      if (url === `/api/sessions/${sessionId}/observations`) {
        throw new Error("list is not mounted here");
      }
      throw new Error(`unexpected request ${url}`);
    });
  return { fetchMock, puts };
}

function renderScreen(
  props: Partial<Parameters<typeof ObservationDraftScreen>[0]> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ObservationDraftScreen
        initialDraft={makeDraft()}
        initialErrorCode={null}
        observationId={observationId}
        viewerRole="student"
        {...props}
      />
    </QueryClientProvider>,
  );
}

function field(name: string) {
  return screen.getByLabelText(name) as HTMLInputElement | HTMLTextAreaElement;
}

function saveButton() {
  return screen.getByRole("button", { name: /บันทึกร่าง|กำลังบันทึก/ });
}

function saveState() {
  return document.querySelector("[data-save-state]")!;
}

describe("ObservationDraftScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // The offline test flips TanStack's shared online state.
    onlineManager.setOnline(true);
  });

  it("shows the private draft with its capture metadata to the owner", () => {
    mockApi({ get: () => envelope(makeDraft()) });
    renderScreen();

    expect(screen.getByRole("heading", { name: "มะม่วง" })).toBeVisible();
    expect(
      screen.getByText("ฉบับร่าง").closest("[data-status]"),
    ).toHaveAttribute("data-status", "draft");
    expect(screen.getByText(DRAFT_PRIVACY_LABEL)).toBeVisible();

    const capture = screen.getByRole("region", { name: "ตำแหน่งที่ปักหมุด" });
    expect(capture).toHaveTextContent("±8 ม.");
    expect(capture).toHaveTextContent("แม่นยำดี");
    expect(capture).toHaveTextContent("13.75510, 100.50510");
    expect(capture).toHaveTextContent(CAPTURE_TIME_NOTICE);
    expect(
      within(capture).getByText("±8 ม.").closest("[data-location-quality]"),
    ).toHaveAttribute("data-location-quality", "good");

    expect(field("ชื่อไทยหรือชื่อทั่วไป")).toHaveValue("มะม่วง");
    expect(field("ชื่อวิทยาศาสตร์")).toHaveClass("italic");
    expect(saveButton()).toBeDisabled();
    expect(saveState()).toHaveAttribute("data-save-state", "clean");
    const back = screen.getAllByRole("link", { name: "กลับรอบสำรวจ" });
    expect(back).toHaveLength(2);
    for (const link of back) {
      expect(link).toHaveAttribute(
        "href",
        `/activities/${activityId}/sessions/${sessionId}`,
      );
    }
  });

  it("marks a poor capture in amber text without blocking anything", () => {
    mockApi({});
    renderScreen({
      initialDraft: makeDraft({
        capture: {
          locationStatus: "captured",
          lat: 13.7551,
          lng: 100.5051,
          accuracyM: 150,
          capturedAt: "2026-09-19T02:00:00+00:00",
          unavailableReason: null,
        },
      }),
    });

    const chip = screen.getByText("สัญญาณตำแหน่งอ่อน (±150 ม.)");
    expect(chip.closest("[data-location-quality]")).toHaveAttribute(
      "data-location-quality",
      "poor",
    );
    expect(field("ชื่อไทยหรือชื่อทั่วไป")).not.toHaveAttribute("readonly");
  });

  it("shows the flagged missing-location card without coordinates", () => {
    mockApi({});
    renderScreen({
      initialDraft: makeDraft({
        capture: {
          locationStatus: "unavailable",
          lat: null,
          lng: null,
          accuracyM: null,
          capturedAt: "2026-09-19T02:00:00+00:00",
          unavailableReason: "timeout",
        },
      }),
    });

    expect(
      screen.getByRole("heading", {
        name: "⚑ ไม่มีพิกัด — ครูจะจัดการเมื่อส่งงาน",
      }),
    ).toBeVisible();
    expect(screen.getByText("สาเหตุ: รอตำแหน่งนานเกินไป")).toBeVisible();
    expect(screen.queryByText(/13\.755/)).toBeNull();
  });

  it("saves with the loaded version and then the saved one", async () => {
    const user = userEvent.setup();
    const { puts } = mockApi({
      get: () => envelope(makeDraft()),
      put: (body) =>
        envelope({ outcome: "updated", version: body.expectedVersion + 1 }),
    });
    renderScreen();

    await user.type(field("ชื่อวิทยาศาสตร์"), "Mangifera indica");
    expect(saveState()).toHaveAttribute("data-save-state", "dirty");
    await user.click(saveButton());

    await waitFor(() =>
      expect(saveState()).toHaveAttribute("data-save-state", "updated"),
    );
    expect(saveState()).toHaveTextContent("บันทึกแล้ว");
    expect(puts[0]).toEqual({
      expectedVersion: 2,
      commonName: "มะม่วง",
      scientificName: "Mangifera indica",
      evidenceNote: null,
    });

    await user.type(field("หลักฐานสั้น ๆ"), "ใบเดี่ยว เรียงสลับ");
    await user.click(saveButton());
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toMatchObject({
      expectedVersion: 3,
      evidenceNote: "ใบเดี่ยว เรียงสลับ",
    });
  });

  it("reports an identical retry as unchanged", async () => {
    const user = userEvent.setup();
    const { puts } = mockApi({
      get: () => envelope(makeDraft()),
      put: () => envelope({ outcome: "unchanged", version: 2 }),
    });
    renderScreen();

    await user.type(field("ชื่อไทยหรือชื่อทั่วไป"), "  ");
    await user.click(saveButton());

    await waitFor(() =>
      expect(saveState()).toHaveAttribute("data-save-state", "unchanged"),
    );
    expect(saveState()).toHaveTextContent(
      "ไม่มีอะไรเปลี่ยน · ร่างในระบบเป็นฉบับล่าสุดแล้ว",
    );
    expect(puts[0]).toMatchObject({ expectedVersion: 2, commonName: "มะม่วง" });
    expect(saveButton()).toBeDisabled();
  });

  it("opens the conflict dialog, keeps the student's text, and re-applies it onto the latest version", async () => {
    const user = userEvent.setup();
    const latest = makeDraft({
      version: 3,
      draft: {
        commonName: "มะม่วงป่า",
        scientificName: "Mangifera caloneura",
        evidenceNote: null,
      },
      refreshedAt: undefined,
    });
    const { puts } = mockApi({
      get: () =>
        envelope({ ...latest, refreshedAt: "2026-09-19T02:11:00+00:00" }),
      put: (body, call) =>
        call === 1
          ? errorEnvelope("OBSERVATION_VERSION_CONFLICT", 409, {
              currentVersion: 3,
              observation: latest,
            })
          : envelope({ outcome: "updated", version: body.expectedVersion + 1 }),
    });
    renderScreen();

    await user.type(field("หลักฐานสั้น ๆ"), "ใบเดี่ยว");
    await user.click(saveButton());

    const dialog = await screen.findByRole("alertdialog", {
      name: "ข้อมูลมีการเปลี่ยนแปลงแล้ว",
    });
    const common = within(dialog)
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("data-field") === "commonName")!;
    expect(common).toHaveTextContent("มะม่วงป่า");
    expect(common).toHaveTextContent(
      "คุณไม่ได้แก้ช่องนี้ จะใช้ค่าล่าสุดในระบบ",
    );
    const note = within(dialog)
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("data-field") === "evidenceNote")!;
    expect(note).toHaveTextContent("ของคุณ (ยังไม่บันทึก)");
    expect(note).toHaveTextContent("ใบเดี่ยว");
    expect(note).toHaveTextContent("ถ้าทำซ้ำ จะใส่ข้อความที่คุณแก้กลับเข้าไป");
    // Nothing was overwritten: the form still holds the student's values.
    expect(field("ชื่อไทยหรือชื่อทั่วไป")).toHaveValue("มะม่วง");
    expect(field("หลักฐานสั้น ๆ")).toHaveValue("ใบเดี่ยว");

    await user.click(
      within(dialog).getByRole("button", { name: "ดูข้อมูลล่าสุดและทำซ้ำ" }),
    );

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(field("ชื่อไทยหรือชื่อทั่วไป")).toHaveValue("มะม่วงป่า");
    expect(field("ชื่อวิทยาศาสตร์")).toHaveValue("Mangifera caloneura");
    expect(field("หลักฐานสั้น ๆ")).toHaveValue("ใบเดี่ยว");
    expect(saveState()).toHaveTextContent("โหลดฉบับที่ 3 แล้ว");
    expect(puts).toHaveLength(1);

    await user.click(saveButton());
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toEqual({
      expectedVersion: 3,
      commonName: "มะม่วงป่า",
      scientificName: "Mangifera caloneura",
      evidenceNote: "ใบเดี่ยว",
    });
  });

  it("can drop the student's edits for the latest version instead", async () => {
    const user = userEvent.setup();
    const latest = makeDraft({
      version: 3,
      draft: { commonName: "มะปราง", scientificName: null, evidenceNote: null },
    });
    mockApi({
      get: () => envelope(latest),
      put: () =>
        errorEnvelope("OBSERVATION_VERSION_CONFLICT", 409, {
          currentVersion: 3,
          observation: latest,
        }),
    });
    renderScreen();

    await user.clear(field("ชื่อไทยหรือชื่อทั่วไป"));
    await user.type(field("ชื่อไทยหรือชื่อทั่วไป"), "มะม่วงหิมพานต์");
    await user.click(saveButton());
    await user.click(
      await screen.findByRole("button", {
        name: "ใช้ฉบับล่าสุด ทิ้งที่แก้",
      }),
    );

    expect(field("ชื่อไทยหรือชื่อทั่วไป")).toHaveValue("มะปราง");
    expect(saveButton()).toBeDisabled();
  });

  it("is read-only with the reason once the group has completed", () => {
    mockApi({});
    renderScreen({
      initialDraft: makeDraft({
        groupStatus: "completed",
        permissions: {
          canEdit: false,
          blockedCode: "INVALID_STATUS_TRANSITION",
          blockedReason: "group_completed",
        },
      }),
    });

    expect(screen.getByText("กลุ่มของคุณสำรวจเสร็จแล้ว")).toBeVisible();
    expect(field("ชื่อไทยหรือชื่อทั่วไป")).toHaveAttribute("readonly");
    expect(field("หลักฐานสั้น ๆ")).toHaveAttribute("readonly");
    expect(saveButton()).toBeDisabled();
    expect(saveState()).toHaveTextContent(
      "แก้ไขไม่ได้ · กลุ่มของคุณสำรวจเสร็จแล้ว",
    );
  });

  it("stays editable while the session is paused", async () => {
    const user = userEvent.setup();
    mockApi({});
    renderScreen({
      initialDraft: makeDraft({
        session: {
          id: sessionId,
          classId,
          title: "Morning round",
          status: "paused",
        },
      }),
    });

    expect(screen.getByText("กิจกรรมหยุดชั่วคราว")).toBeVisible();
    await user.type(field("หลักฐานสั้น ๆ"), "ดอกสีขาว");
    expect(saveButton()).toBeEnabled();
  });

  it("disables saving offline but keeps what the student typed", async () => {
    const user = userEvent.setup();
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { puts } = mockApi({});
    renderScreen();

    await user.type(field("หลักฐานสั้น ๆ"), "เปลือกแตกเป็นร่อง");
    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() =>
      expect(saveState()).toHaveAttribute("data-save-state", "offline"),
    );
    expect(saveButton()).toBeDisabled();
    expect(field("หลักฐานสั้น ๆ")).toHaveValue("เปลือกแตกเป็นร่อง");
    expect(puts).toHaveLength(0);
  });

  it("keeps the text and offers a resave after a dropped connection", async () => {
    const user = userEvent.setup();
    let fail = true;
    const { puts } = mockApi({
      get: () => envelope(makeDraft()),
      put: (body) => {
        if (fail) throw new TypeError("Failed to fetch");
        return envelope({
          outcome: "updated",
          version: body.expectedVersion + 1,
        });
      },
    });
    renderScreen();

    await user.type(field("หลักฐานสั้น ๆ"), "ผลกลม");
    await user.click(saveButton());
    await waitFor(() =>
      expect(saveState()).toHaveAttribute("data-save-state", "failed"),
    );
    expect(saveState()).toHaveTextContent("ข้อความของคุณยังอยู่");
    expect(field("หลักฐานสั้น ๆ")).toHaveValue("ผลกลม");

    fail = false;
    await user.click(saveButton());
    await waitFor(() =>
      expect(saveState()).toHaveAttribute("data-save-state", "updated"),
    );
    expect(puts.map((body) => body.expectedVersion)).toEqual([2, 2]);
  });

  it("shows the permission-denied state to a teacher without reading the draft", () => {
    const { fetchMock } = mockApi({});
    renderScreen({
      initialDraft: null,
      initialErrorCode: "FORBIDDEN",
      viewerRole: "teacher",
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("คุณไม่มีสิทธิ์ทำรายการนี้");
    expect(alert).toHaveTextContent(
      "ร่างการสังเกตเป็นข้อมูลส่วนตัวของนักเรียน",
    );
    expect(
      within(alert).getByRole("link", { name: "กลับรายการชั้นเรียน" }),
    ).toHaveAttribute("href", "/teacher/classes");
    expect(within(alert).queryByRole("button", { name: "ลองใหม่" })).toBeNull();
    expect(screen.queryByLabelText("ชื่อไทยหรือชื่อทั่วไป")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replaces a loaded draft with the denial when a refetch is refused", async () => {
    mockApi({ get: () => errorEnvelope("FORBIDDEN", 403) });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ObservationDraftScreen
          initialDraft={makeDraft()}
          initialErrorCode={null}
          observationId={observationId}
          viewerRole="student"
        />
      </QueryClientProvider>,
    );
    await act(() =>
      queryClient.invalidateQueries({ queryKey: ["observations"] }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "คุณไม่มีสิทธิ์ทำรายการนี้",
    );
    expect(screen.queryByText("13.75510, 100.50510")).toBeNull();
  });

  it("loads, fails, and recovers with a retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    mockApi({
      get: () => {
        if (fail) throw new TypeError("Failed to fetch");
        return envelope(makeDraft());
      },
    });
    renderScreen({ initialDraft: null });

    expect(screen.getByText("กำลังโหลดร่างการสังเกต...")).toBeVisible();
    expect(await screen.findByText("โหลดร่างการสังเกตไม่สำเร็จ")).toBeVisible();
    fail = false;
    await user.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(
      await screen.findByRole("heading", { name: "มะม่วง" }),
    ).toBeVisible();
  });
});
