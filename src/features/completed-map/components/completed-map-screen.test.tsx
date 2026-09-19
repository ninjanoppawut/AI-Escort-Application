import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completedMapViewSchema,
  mapDetailViewSchema,
  type CompletedMapView,
} from "../contracts";
import { CompletedMapScreen } from "./completed-map-screen";

const sessionId = "62000000-0000-4000-8000-000000008661";
const mine = "81000000-0000-4000-8000-000000008661";
const peer = "81000000-0000-4000-8000-000000008662";
const noFix = "81000000-0000-4000-8000-000000008663";
const requestId = "90000000-0000-4000-8000-000000008661";

function item(overrides: Record<string, unknown>) {
  return {
    observationId: mine,
    status: "verified",
    lat: 13.7551,
    lng: 100.5051,
    accuracyM: 8,
    locationStatus: "captured",
    capturedAt: "2026-09-19T02:00:00+00:00",
    commonName: "พู่ระหง",
    scientificName: "Hibiscus schizopetalus",
    verified: true,
    recorderName: "Ada Leader",
    groupName: "Leaf",
    isMine: true,
    sameSpeciesInSession: false,
    thumbnailUrl: null,
    ...overrides,
  };
}

function makeMap(role: "teacher" | "participant"): CompletedMapView {
  return completedMapViewSchema.parse({
    sessionId,
    classId: "20000000-0000-4000-8000-000000008661",
    viewerRole: role,
    available: true,
    session: {
      title: "Morning round",
      status: "completed",
      completedAt: "2026-09-19T04:00:00+00:00",
    },
    activity: {
      id: "60000000-0000-4000-8000-000000008661",
      title: "Garden survey",
    },
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [100.5, 13.75],
          [100.51, 13.75],
          [100.51, 13.76],
          [100.5, 13.76],
          [100.5, 13.75],
        ],
      ],
    },
    items: [
      item({}),
      item({
        observationId: peer,
        status: "submitted",
        lat: 13.7557,
        lng: 100.5057,
        commonName: "มะม่วง",
        scientificName: "Mangifera indica",
        verified: false,
        recorderName: "Bo",
        isMine: false,
      }),
      item({
        observationId: noFix,
        status: "revision_required",
        lat: null,
        lng: null,
        locationStatus: "unavailable",
        commonName: "เฟิน",
        scientificName: "Nephrolepis cordifolia",
        verified: false,
        recorderName: "Bo",
        isMine: false,
      }),
    ],
    total: 3,
    truncated: false,
    pendingReviewCount: role === "teacher" ? 1 : null,
    refreshedAt: "2026-09-19T05:00:00+00:00",
  });
}

function detail(canReport: boolean) {
  return mapDetailViewSchema.parse({
    observationId: peer,
    sessionId,
    status: "submitted",
    viewer: { role: "participant", isOwner: false, canReport },
    verified: null,
    student: {
      commonName: "มะม่วง",
      scientificName: "Mangifera indica",
      evidenceNote: "ใบเดี่ยว เรียงสลับ ขยี้แล้วมีกลิ่นหอม",
      referenceNote: null,
      traits: [{ traitKey: "leaf_type", status: null, value: "ใบเดี่ยว" }],
      submissionNumber: 1,
      submittedAt: "2026-09-19T02:30:00+00:00",
    },
    recorder: { name: "Bo", groupName: "Leaf" },
    capture: {
      locationStatus: "captured",
      lat: 13.7557,
      lng: 100.5057,
      accuracyM: 6,
      capturedAt: "2026-09-19T02:10:00+00:00",
    },
    feedback: null,
    relations: {
      sameSpeciesInSession: false,
      sameSpeciesCount: 0,
      possibleSameSpecimenCount: null,
    },
    media: [
      {
        mediaId: "85000000-0000-4000-8000-000000008661",
        position: 1,
        category: "whole_plant",
        width: 1536,
        height: 2048,
        signedUrl: "https://storage.example/peer.jpg?token=x",
      },
    ],
    refreshedAt: "2026-09-19T05:00:00+00:00",
  });
}

function envelope(data: unknown) {
  return new Response(JSON.stringify({ data, error: null, requestId }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderMap(
  map: CompletedMapView | null,
  errorCode: string | null = null,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CompletedMapScreen
        initialErrorCode={errorCode}
        initialMap={map}
        sessionId={sessionId}
      />
    </QueryClientProvider>,
  );
}

describe("CompletedMapScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws located records as status-shaped markers and lists the rest", () => {
    renderMap(makeMap("participant"));

    const markers = document.querySelectorAll("[data-map-marker]");
    expect(
      [...markers].map((marker) => marker.getAttribute("data-marker-shape")),
    ).toEqual(["checked-circle", "circle"]);
    expect(
      screen.getByRole("button", {
        name: "พู่ระหง · ครูยืนยันแล้ว · ของฉัน · บันทึกโดย Ada Leader",
      }),
    ).toBeInTheDocument();
    const legend = screen.getByRole("list", { name: "สัญลักษณ์สถานะ" });
    expect(legend).toHaveTextContent("ครูยืนยันแล้ว");
    expect(legend).toHaveTextContent("ของฉัน");
    expect(screen.getByText(/ไม่มีพิกัด \(1\)/)).toBeVisible();
    expect(
      document.querySelector(`[data-map-list-item="${noFix}"]`),
    ).not.toBeNull();
    expect(screen.getByText(/ไม่แสดงเส้นทางเดินย้อนหลัง/)).toBeVisible();
  });

  it("filters by keeping other markers dimmed and offers a list view", async () => {
    renderMap(makeMap("participant"));

    await userEvent.click(screen.getByRole("button", { name: "ของฉัน 1" }));
    expect(document.querySelector(`[data-map-marker="${peer}"]`)).toHaveClass(
      "opacity-30",
    );
    expect(
      document.querySelector(`[data-map-marker="${mine}"]`),
    ).not.toHaveClass("opacity-30");

    await userEvent.click(screen.getByRole("button", { name: "รายการ" }));
    const list = document.querySelector(
      '[data-map-list="list"]',
    ) as HTMLElement;
    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });

  it("opens a peer's detail beside the map with images and the report action", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      envelope(detail(true)),
    );
    renderMap(makeMap("participant"));

    await userEvent.click(
      screen.getByRole("button", { name: /มะม่วง · ส่งให้ครูแล้ว/ }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "รายละเอียดพืช",
    });
    expect(
      await within(panel).findByRole("img", { name: "ภาพที่ 1 · ทั้งต้น" }),
    ).toBeVisible();
    expect(within(panel).getByText(/บันทึกโดย/).nextSibling).toHaveTextContent(
      /Bo · Leaf/,
    );
    expect(within(panel).queryByText("ความเห็นครู")).toBeNull();
    await userEvent.click(
      within(panel).getByRole("button", { name: "รายงานปัญหา" }),
    );
    expect(
      screen.getByRole("dialog", { name: "รายงานปัญหาของรายการ" }),
    ).toBeVisible();
    // The map stays on the page behind the detail.
    expect(document.querySelector("[data-completed-map]")).not.toBeNull();
  });

  it("shows the teacher the pending-review banner and no report action", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      envelope({
        ...detail(false),
        viewer: { role: "teacher", isOwner: false, canReport: false },
      }),
    );
    renderMap(makeMap("teacher"));

    expect(document.querySelector("[data-pending-review]")).toHaveTextContent(
      "ยังมี 1 รายการรอตรวจ",
    );
    await userEvent.click(screen.getByRole("button", { name: /มะม่วง/ }));
    const panel = await screen.findByRole("complementary", {
      name: "รายละเอียดพืช",
    });
    await waitFor(() =>
      expect(
        within(panel).getByRole("link", { name: "เปิดหน้าตรวจ" }),
      ).toHaveAttribute("href", `/teacher/reviews/${peer}`),
    );
    expect(
      within(panel).queryByRole("button", { name: "รายงานปัญหา" }),
    ).toBeNull();
  });

  it("waits for completion and refuses outsiders", () => {
    const { unmount } = renderMap(
      completedMapViewSchema.parse({
        sessionId,
        viewerRole: "participant",
        available: false,
        session: { title: "Morning round", status: "open" },
        refreshedAt: "2026-09-19T05:00:00+00:00",
      }),
    );
    expect(screen.getByText("แผนที่ผลลัพธ์ยังไม่เปิด")).toBeVisible();
    unmount();

    renderMap(null, "FORBIDDEN");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "คุณไม่มีสิทธิ์ทำรายการนี้",
    );
  });
});
