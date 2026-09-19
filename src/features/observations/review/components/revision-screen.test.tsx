import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { revisionStateSchema, type RevisionState } from "../revision-contracts";
import { ReportIssueSheet } from "./report-issue-sheet";
import { RevisionScreen } from "./revision-screen";

const observationId = "81000000-0000-4000-8000-000000008651";
const requestId = "90000000-0000-4000-8000-000000008651";

function makeState(overrides: Partial<RevisionState> = {}): RevisionState {
  return revisionStateSchema.parse({
    observationId,
    status: "revision_required",
    version: 7,
    submissionCount: 1,
    current: {
      commonName: "ชบา",
      scientificName: "Hibiscus rosa-sinensis",
      evidenceNote: "ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง",
      referenceNote: null,
      traits: [],
    },
    verifiedIdentity: null,
    latestReview: {
      id: "87000000-0000-4000-8000-000000008651",
      decision: "revision_required",
      feedback: "ตรวจชื่อวิทยาศาสตร์อีกครั้ง",
      verifiedCommonName: null,
      verifiedScientificName: null,
      correctedTraits: {},
      reviewedAt: "2026-09-19T05:00:00+00:00",
      submissionNumber: 1,
    },
    openTopics: ["scientific_name"],
    changedTopics: [],
    readiness: { blockers: [] },
    unlockRequests: [],
    permissions: {
      canEdit: true,
      canResubmit: true,
      canRequestTopics: true,
      blockedCode: null,
      blockedReason: null,
    },
    refreshedAt: "2026-09-19T05:10:00+00:00",
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

function renderWith(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("RevisionScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the feedback and lets only open topics change", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      envelope(makeState()),
    );
    renderWith(
      <RevisionScreen
        initialErrorCode={null}
        initialState={makeState()}
        observationId={observationId}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "ครูขอให้แก้ไข 1 หัวข้อ" }),
    ).toBeVisible();
    expect(screen.getByText("“ตรวจชื่อวิทยาศาสตร์อีกครั้ง”")).toBeVisible();
    const form = screen.getByRole("region", { name: "แก้ไขและส่งใหม่" });
    expect(within(form).getByLabelText(/ชื่อวิทยาศาสตร์/)).not.toHaveAttribute(
      "readonly",
    );
    expect(
      within(form).getByLabelText(/ชื่อไทยหรือชื่อทั่วไป/),
    ).toHaveAttribute("readonly");
    expect(
      document.querySelector('[data-revision-field="commonName"]'),
    ).toHaveTextContent("ครูยังไม่เปิด");
    const resubmit = screen.getByRole("region", { name: "ส่งฉบับแก้ไข" });
    expect(
      within(resubmit).getByRole("button", { name: "ส่งใหม่" }),
    ).toBeDisabled();
    expect(
      within(resubmit).getByText("ยังไม่มีอะไรเปลี่ยนจากฉบับที่ส่งไป"),
    ).toBeVisible();
  });

  it("saves the revision, then resubmits once with one client submission ID", async () => {
    let state = makeState();
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });
      if (method === "PUT") {
        state = makeState({
          version: 8,
          current: {
            ...state.current,
            scientificName: "Hibiscus schizopetalus",
          },
          changedTopics: ["scientific_name"],
        });
        return envelope({
          outcome: "updated",
          version: 8,
          status: "revision_required",
        });
      }
      if (url.endsWith("/resubmit")) {
        state = makeState({
          status: "resubmitted",
          version: 9,
          submissionCount: 2,
        });
        return envelope(
          {
            outcome: "resubmitted",
            submissionId: "83000000-0000-4000-8000-000000008652",
            submissionNumber: 2,
            version: 9,
          },
          201,
        );
      }
      return envelope(state);
    });
    renderWith(
      <RevisionScreen
        initialErrorCode={null}
        initialState={state}
        observationId={observationId}
      />,
    );

    const scientific = screen.getByLabelText(/ชื่อวิทยาศาสตร์/);
    await userEvent.clear(scientific);
    await userEvent.type(scientific, "Hibiscus schizopetalus");
    const resubmit = screen.getByRole("region", { name: "ส่งฉบับแก้ไข" });
    expect(
      within(resubmit).getByText("บันทึกการแก้ไขก่อน แล้วค่อยส่งใหม่"),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "บันทึกการแก้ไข" }),
    );

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        expectedVersion: 7,
        commonName: "ชบา",
        scientificName: "Hibiscus schizopetalus",
        evidenceNote: "ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง",
        referenceNote: null,
        traits: [],
      }),
    );
    expect(
      await within(resubmit).findByText(/ที่แก้แล้ว: ชื่อวิทยาศาสตร์/),
    ).toBeVisible();
    await userEvent.click(
      within(resubmit).getByRole("button", { name: "ส่งใหม่" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "ยืนยันส่งใหม่" }),
    );

    await waitFor(() =>
      expect(calls.some((call) => call.url.endsWith("/resubmit"))).toBe(true),
    );
    expect(calls.find((call) => call.url.endsWith("/resubmit"))?.body).toEqual({
      clientSubmissionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      expectedVersion: 8,
      acknowledgeSameSpecies: false,
    });
    expect(
      await screen.findByText(/ส่งฉบับแก้ไขแล้ว · รอครูตรวจ/),
    ).toBeVisible();
  });

  it("asks the teacher for more topics and shows the pending request", async () => {
    let state = makeState();
    const posts: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        state = makeState({
          unlockRequests: [
            {
              id: "86000000-0000-4000-8000-000000008651",
              reviewId: "87000000-0000-4000-8000-000000008651",
              requestedFields: ["common_name"],
              reason: "พบชื่อท้องถิ่นเพิ่ม",
              status: "pending",
              grantedFields: null,
              decisionNote: null,
              createdAt: "2026-09-19T05:20:00+00:00",
              decidedAt: null,
            },
          ],
          permissions: { ...state.permissions, canRequestTopics: false },
        });
        return envelope(
          {
            outcome: "requested",
            requestId: "86000000-0000-4000-8000-000000008651",
          },
          201,
        );
      }
      return envelope(state);
    });
    renderWith(
      <RevisionScreen
        initialErrorCode={null}
        initialState={state}
        observationId={observationId}
      />,
    );

    const panel = screen.getByRole("region", { name: "ขอแก้เพิ่ม" });
    await userEvent.click(
      within(panel).getByRole("checkbox", { name: "ชื่อไทยหรือชื่อทั่วไป" }),
    );
    await userEvent.type(
      within(panel).getByLabelText("เหตุผลถึงครู"),
      "พบชื่อท้องถิ่นเพิ่ม",
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "ส่งคำขอแก้เพิ่ม" }),
    );

    await waitFor(() =>
      expect(posts).toEqual([
        { fieldKeys: ["common_name"], reason: "พบชื่อท้องถิ่นเพิ่ม" },
      ]),
    );
    expect(
      await within(panel).findByText("ชื่อไทยหรือชื่อทั่วไป · รอครูตัดสิน"),
    ).toBeVisible();
    expect(
      within(panel).queryByRole("button", { name: "ส่งคำขอแก้เพิ่ม" }),
    ).toBeNull();
  });

  it("refuses anyone but the owner without showing data", () => {
    renderWith(
      <RevisionScreen
        initialErrorCode="FORBIDDEN"
        initialState={null}
        observationId={observationId}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "คุณไม่มีสิทธิ์ทำรายการนี้",
    );
  });
});

describe("ReportIssueSheet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("needs a type and ten characters, then reports anonymously", async () => {
    const posts: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return envelope(
        {
          outcome: "reported",
          reportId: "88000000-0000-4000-8000-000000008651",
        },
        201,
      );
    });
    renderWith(
      <ReportIssueSheet observationId={observationId} onClose={() => {}} />,
    );

    const send = screen.getByRole("button", { name: "ส่งรายงาน" });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByLabelText("ตำแหน่งผิดพลาด"));
    await userEvent.type(screen.getByLabelText("รายละเอียด"), "สั้น");
    expect(send).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText("รายละเอียด"),
      "ไป หมุดอยู่นอกโรงเรียน",
    );
    await userEvent.click(send);

    expect(await screen.findByText(/ส่งรายงานให้ครูแล้ว/)).toBeVisible();
    expect(posts).toEqual([
      { type: "location", reason: "สั้นไป หมุดอยู่นอกโรงเรียน" },
    ]);
  });

  it("shows how long to wait when the daily limit is reached", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      errorEnvelope("RATE_LIMITED", 429, { retryAfterSeconds: 7_260 }),
    );
    renderWith(
      <ReportIssueSheet observationId={observationId} onClose={() => {}} />,
    );

    await userEvent.click(screen.getByLabelText("ข้อมูลชนิดไม่ถูกต้อง"));
    await userEvent.type(
      screen.getByLabelText("รายละเอียด"),
      "ชื่อพืชอาจไม่ตรงกับรูป",
    );
    await userEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));

    expect(
      await screen.findByText(/รายงานได้อีกครั้งในอีก 2 ชั่วโมง 1 นาที/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "ส่งรายงาน" })).toBeDisabled();
  });
});
