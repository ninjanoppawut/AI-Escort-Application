import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  teacherReviewDetailViewSchema,
  type TeacherReviewDetail,
} from "../revision-contracts";
import { TeacherReviewScreen } from "./teacher-review-screen";

const observationId = "81000000-0000-4000-8000-000000008641";
const submissionId = "83000000-0000-4000-8000-000000008641";
const requestId = "86000000-0000-4000-8000-000000008641";
const envelopeRequestId = "90000000-0000-4000-8000-000000008641";

function makeReview(overrides: Partial<TeacherReviewDetail> = {}) {
  return teacherReviewDetailViewSchema.parse({
    observationId,
    classId: "20000000-0000-4000-8000-000000008641",
    status: "teacher_review",
    version: 4,
    latestSubmissionId: submissionId,
    verifiedIdentity: null,
    student: {
      id: "10000000-0000-4000-8000-000000008641",
      displayName: "Ada Leader",
    },
    groupName: "Leaf",
    session: {
      id: "62000000-0000-4000-8000-000000008641",
      title: "Morning round",
      status: "completed",
    },
    activity: {
      id: "60000000-0000-4000-8000-000000008641",
      title: "Garden survey",
    },
    capture: {
      locationStatus: "captured",
      lat: 13.7551,
      lng: 100.5051,
      accuracyM: 8,
      capturedAt: "2026-09-19T02:00:00+00:00",
      unavailableReason: null,
    },
    sameSpecies: { inSession: false, count: 0 },
    submissions: [
      {
        id: submissionId,
        submissionNumber: 1,
        submittedAt: "2026-09-19T02:30:00+00:00",
        commonName: "ชบา",
        scientificName: "Hibiscus rosa-sinensis",
        evidenceNote: "ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง",
        referenceNote: null,
        identitySource: "manual",
        verification: { traits: [] },
        sameSpeciesCount: 0,
        sameSpeciesAcknowledged: false,
        media: [],
      },
    ],
    relations: [],
    reviews: [],
    unlockRequests: [],
    history: [],
    reports: [],
    permissions: { canDecide: true, canBegin: false },
    refreshedAt: "2026-09-19T03:10:00+00:00",
    ...overrides,
  });
}

function envelope(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ data, error: null, requestId: envelopeRequestId }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function errorEnvelope(code: string, status: number) {
  return new Response(
    JSON.stringify({
      data: null,
      error: { code, message: code, retryable: false, details: {} },
      requestId: envelopeRequestId,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function renderScreen(review: TeacherReviewDetail, highlight?: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeacherReviewScreen
        highlightRequestId={highlight ?? null}
        initialErrorCode={null}
        initialReview={review}
        observationId={observationId}
      />
    </QueryClientProvider>,
  );
}

function mockApi(
  handler: (url: string, body: Record<string, unknown>) => Response,
) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : {};
    calls.push({ url, body });
    return handler(url, body);
  });
  return calls;
}

describe("teacher decisions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("begins the review once when a submitted record is opened", async () => {
    const calls = mockApi((url) =>
      url.endsWith("/review/start")
        ? envelope({ outcome: "started", status: "teacher_review", version: 5 })
        : envelope(makeReview()),
    );
    renderScreen(
      makeReview({
        status: "submitted",
        permissions: { canDecide: true, canBegin: true },
      }),
    );

    await waitFor(() =>
      expect(
        calls.filter((call) => call.url.endsWith("/review/start")),
      ).toHaveLength(1),
    );
  });

  it("requires a topic and feedback before requesting a revision", async () => {
    const calls = mockApi(() =>
      envelope({
        outcome: "decided",
        reviewId: "87000000-0000-4000-8000-000000008641",
        status: "revision_required",
        version: 5,
      }),
    );
    renderScreen(makeReview());

    await userEvent.click(screen.getByRole("button", { name: "ขอให้แก้ไข" }));
    const dialog = screen.getByRole("dialog", { name: "ขอให้แก้ไข" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "ส่งคำขอแก้ไข" }),
    );
    expect(
      await within(dialog).findByText("เลือกอย่างน้อย 1 หัวข้อ"),
    ).toBeVisible();
    expect(within(dialog).getByText("เขียนคำแนะนำถึงนักเรียน")).toBeVisible();
    expect(calls).toHaveLength(0);

    await userEvent.click(within(dialog).getByLabelText("ชื่อวิทยาศาสตร์"));
    await userEvent.click(within(dialog).getByLabelText("ภาพหลักฐาน"));
    await userEvent.type(
      within(dialog).getByLabelText(/คำแนะนำถึงนักเรียน/),
      "ถ่ายภาพใบให้ชัดขึ้น",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "ส่งคำขอแก้ไข" }),
    );

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toEqual({
      url: `/api/observations/${observationId}/review`,
      body: {
        submissionId,
        decision: "revision_required",
        verifiedCommonName: null,
        verifiedScientificName: null,
        correctedTraits: {},
        feedback: "ถ่ายภาพใบให้ชัดขึ้น",
        topicKeys: ["images", "scientific_name"],
      },
    });
  });

  it("verifies with a correction while keeping the student's values visible", async () => {
    const calls = mockApi(() =>
      envelope({
        outcome: "decided",
        reviewId: "87000000-0000-4000-8000-000000008641",
        status: "verified",
        version: 5,
      }),
    );
    renderScreen(makeReview());

    await userEvent.click(
      screen.getByRole("button", { name: "แก้แล้วรับรอง" }),
    );
    const dialog = screen.getByRole("dialog", { name: "แก้ไขและรับรอง" });
    const common = within(dialog).getByLabelText(
      "ชื่อไทยหรือชื่อทั่วไปที่ถูกต้อง",
    );
    expect(common).toHaveValue("ชบา");
    expect(within(dialog).getByText(/นักเรียนกรอก: ชบา/)).toBeVisible();
    await userEvent.clear(common);
    await userEvent.type(common, "พู่ระหง");
    await userEvent.click(within(dialog).getByText("แก้ลักษณะ (ถ้ามี)"));
    await userEvent.type(
      within(dialog).getByLabelText("ขอบใบ"),
      "หยักฟันเลื่อย",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "บันทึกและรับรอง" }),
    );

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]!.body).toMatchObject({
      decision: "verified",
      verifiedCommonName: "พู่ระหง",
      verifiedScientificName: "Hibiscus rosa-sinensis",
      correctedTraits: { leaf_margin: "หยักฟันเลื่อย" },
    });
  });

  it("reports a decision that lost to another teacher or a new version", async () => {
    mockApi((url) =>
      url.endsWith("/review")
        ? errorEnvelope("OBSERVATION_VERSION_CONFLICT", 409)
        : envelope(makeReview()),
    );
    renderScreen(makeReview());

    await userEvent.click(screen.getByRole("button", { name: "รับรอง" }));
    await userEvent.click(
      within(
        screen.getByRole("dialog", { name: "รับรองรายการนี้?" }),
      ).getByRole("button", { name: "รับรอง" }),
    );

    expect(
      await screen.findByText(
        /รายการนี้มีการตัดสินหรือนักเรียนส่งฉบับใหม่แล้ว/,
      ),
    ).toBeVisible();
  });

  it("needs a reason to reject", async () => {
    const calls = mockApi(() => envelope(makeReview()));
    renderScreen(makeReview());

    await userEvent.click(screen.getByRole("button", { name: "ไม่รับรายการ" }));
    const dialog = screen.getByRole("dialog", { name: "ไม่รับรายการ" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "ยืนยันไม่รับรายการ" }),
    );
    expect(
      await within(dialog).findByText("ต้องพิมพ์เหตุผลก่อนยืนยัน"),
    ).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  it("grants only the requested topics the teacher keeps", async () => {
    const calls = mockApi((url) =>
      url.endsWith("/decision")
        ? envelope({ outcome: "decided", status: "granted" })
        : envelope(makeReview()),
    );
    renderScreen(
      makeReview({
        status: "revision_required",
        permissions: { canDecide: false, canBegin: false },
        unlockRequests: [
          {
            id: requestId,
            reviewId: "87000000-0000-4000-8000-000000008641",
            requestedFields: ["common_name", "traits"],
            reason: "พบหลักฐานเพิ่มจากต้นจริง",
            status: "pending",
            grantedFields: null,
            decisionNote: null,
            createdAt: "2026-09-19T04:00:00+00:00",
            decidedAt: null,
          },
        ],
      }),
      requestId,
    );

    expect(screen.queryByRole("button", { name: "รับรอง" })).toBeNull();
    const row = document.querySelector(
      '[data-unlock-request="pending"]',
    ) as HTMLElement;
    await userEvent.click(within(row).getByLabelText("การตรวจลักษณะ"));
    await userEvent.click(within(row).getByRole("button", { name: "อนุญาต" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url.endsWith("/decision"))).toBe(true),
    );
    expect(calls.find((call) => call.url.endsWith("/decision"))).toEqual({
      url: `/api/observations/${observationId}/unlock-request/${requestId}/decision`,
      body: { decision: "granted", fieldKeys: ["common_name"], note: "" },
    });
  });
});
