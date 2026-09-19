import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

import { teacherReviewViewSchema } from "../contracts";
import { TeacherReviewScreen } from "./teacher-review-screen";

const observationId = "81000000-0000-4000-8000-000000008621";
const otherId = "81000000-0000-4000-8000-000000008622";
const thirdId = "81000000-0000-4000-8000-000000008623";
const specimenRelationId = "84000000-0000-4000-8000-000000008621";
const speciesRelationId = "84000000-0000-4000-8000-000000008622";
const requestId = "90000000-0000-4000-8000-000000008621";

type Review = z.infer<typeof teacherReviewViewSchema>;

function makeReview(decision: "same_specimen" | null = null): Review {
  return teacherReviewViewSchema.parse({
    observationId,
    classId: "20000000-0000-4000-8000-000000008621",
    status: "submitted",
    student: {
      id: "10000000-0000-4000-8000-000000008621",
      displayName: "Ada Leader",
    },
    groupName: "Leaf",
    session: {
      id: "62000000-0000-4000-8000-000000008621",
      title: "Morning round",
      status: "open",
    },
    activity: {
      id: "60000000-0000-4000-8000-000000008621",
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
    sameSpecies: { inSession: true, count: 2 },
    submissions: [
      {
        id: "83000000-0000-4000-8000-000000008621",
        submissionNumber: 1,
        submittedAt: "2026-09-19T02:30:00+00:00",
        commonName: "ชบา",
        scientificName: "Hibiscus rosa-sinensis",
        evidenceNote: "ขอบใบหยักเฉพาะปลายใบ ดอกเดี่ยวสีแดง",
        referenceNote: "หนังสือพรรณไม้ หน้า 12",
        identitySource: "manual",
        verification: {
          schemaVersion: "student-review-v1",
          traits: [
            {
              traitKey: "leaf_margin",
              status: null,
              value: "หยักปลายใบ",
              note: null,
            },
            {
              traitKey: "bark",
              status: "not_visible",
              value: null,
              note: "มีเถาปกคลุม",
            },
          ],
        },
        sameSpeciesCount: 2,
        sameSpeciesAcknowledged: true,
        media: [
          {
            mediaId: "85000000-0000-4000-8000-000000008621",
            position: 1,
            category: "whole_plant",
            width: 1536,
            height: 2048,
            signedUrl: "https://storage.example/whole.jpg?token=x",
          },
          {
            mediaId: "85000000-0000-4000-8000-000000008622",
            position: 2,
            category: "leaf",
            width: 1600,
            height: 1200,
            signedUrl: null,
          },
        ],
      },
    ],
    relations: [
      {
        relationId: specimenRelationId,
        relationshipType: "possible_same_specimen",
        otherObservationId: otherId,
        otherStudentName: "Cy Leader",
        otherCommonName: "ชบา",
        otherScientificName: "Hibiscus rosa-sinensis",
        otherCapturedAt: "2026-09-19T02:10:00+00:00",
        distanceM: 8.4,
        timeGapSeconds: 1200,
        ruleVersion: "specimen-candidate-v1",
        decision,
        decidedAt: decision ? "2026-09-19T03:00:00+00:00" : null,
        canDecide: true,
      },
      {
        relationId: speciesRelationId,
        relationshipType: "same_species",
        otherObservationId: thirdId,
        otherStudentName: "Bo",
        otherCommonName: "ชบาแดง",
        otherScientificName: "Hibiscus rosa-sinensis",
        otherCapturedAt: "2026-09-19T01:10:00+00:00",
        distanceM: 240,
        timeGapSeconds: 4800,
        ruleVersion: "specimen-candidate-v1",
        decision: null,
        decidedAt: null,
        canDecide: false,
      },
    ],
    refreshedAt: "2026-09-19T03:10:00+00:00",
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

function renderScreen(
  props: Partial<Parameters<typeof TeacherReviewScreen>[0]> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeacherReviewScreen
        initialErrorCode={null}
        initialReview={makeReview()}
        observationId={observationId}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("TeacherReviewScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the submission, images, trait checks, and relation tags", () => {
    renderScreen();

    expect(
      screen.getByRole("heading", { level: 1, name: "ชบา" }),
    ).toBeVisible();
    expect(
      document.querySelector('[data-tag="same_species"]'),
    ).toHaveTextContent("ชนิดซ้ำในรอบนี้ · อีก 2 รายการ");
    expect(
      document.querySelector('[data-tag="possible_same_specimen"]'),
    ).toHaveTextContent("อาจเป็นต้นเดียวกัน 1 รายการ");

    const latest = screen.getByRole("region", {
      name: "ฉบับล่าสุด (ส่งครั้งที่ 1)",
    });
    expect(
      within(latest).getByRole("img", { name: "ภาพที่ 1 · ทั้งต้น" }),
    ).toHaveAttribute("src", "https://storage.example/whole.jpg?token=x");
    expect(within(latest).getByText("โหลดภาพไม่ได้ ลองรีเฟรช")).toBeVisible();
    expect(within(latest).getByText("(นักเรียนกรอกเอง)")).toBeVisible();
    const traits = latest.querySelector("[data-traits]")!;
    expect(
      [...traits.querySelectorAll("li")].map((item) => item.textContent),
    ).toEqual(["ขอบใบ: “หยักปลายใบ”", "เปลือก: ◌ ไม่เห็น · มีเถาปกคลุม"]);
    expect(
      within(latest).getByText(/นักเรียนรับทราบว่าพบชนิดเดียวกัน/),
    ).toBeVisible();
    // No storage path reaches the page.
    expect(document.body.innerHTML).not.toContain("observation-images");
  });

  it("confirms a possible same specimen with the loaded decision as precondition", async () => {
    const posts: unknown[] = [];
    let review = makeReview();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith(`/related/${specimenRelationId}/decision`)) {
        posts.push(JSON.parse(String(init?.body)));
        review = makeReview("same_specimen");
        return envelope({
          outcome: "decided",
          relationId: specimenRelationId,
          decision: "same_specimen",
        });
      }
      if (url === `/api/reviews/${observationId}`) return envelope(review);
      throw new Error(`unexpected request ${url}`);
    });
    renderScreen();

    const row = document.querySelector(
      '[data-relation="possible_same_specimen"]',
    ) as HTMLElement;
    expect(row).toHaveTextContent("ห่าง 8 ม. · ห่างกัน 20 นาที");
    expect(within(row).getByText("ยังไม่ได้ยืนยัน")).toBeVisible();
    // Same-species rows are information only.
    const speciesRow = document.querySelector(
      '[data-relation="same_species"]',
    ) as HTMLElement;
    expect(within(speciesRow).queryByRole("button")).toBeNull();

    await userEvent.click(
      within(row).getByRole("button", { name: "ต้นเดียวกัน" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "ยืนยันว่าเป็น “ต้นเดียวกัน”?",
    });
    expect(dialog).toHaveTextContent("ไม่มีการรวมหรือลบ");
    expect(
      within(dialog).getByRole("button", { name: "ยกเลิก" }),
    ).toHaveFocus();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "ยืนยัน" }),
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-relation="possible_same_specimen"]'),
      ).toHaveAttribute("data-relation-decision", "same_specimen"),
    );
    expect(posts).toEqual([
      { decision: "same_specimen", expectedDecision: null },
    ]);
    expect(screen.getByText("ครูยืนยันแล้ว: ต้นเดียวกัน")).toBeVisible();
  });

  it("reports a decision another teacher changed and reloads it", async () => {
    let reads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/decision")) {
        return errorEnvelope("INVALID_STATUS_TRANSITION", 409);
      }
      if (url === `/api/reviews/${observationId}`) {
        reads += 1;
        return envelope(makeReview("same_specimen"));
      }
      throw new Error(`unexpected request ${url}`);
    });
    renderScreen();

    const row = document.querySelector(
      '[data-relation="possible_same_specimen"]',
    ) as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "คนละต้น" }));
    await userEvent.click(screen.getByRole("button", { name: "ยืนยัน" }));

    expect(
      await screen.findByText(/มีครูท่านอื่นเปลี่ยนการยืนยันแล้ว/),
    ).toBeVisible();
    await waitFor(() => expect(reads).toBe(1));
    expect(await screen.findByText("ครูยืนยันแล้ว: ต้นเดียวกัน")).toBeVisible();
  });

  it("refuses a student or an unsubmitted record without showing any data", () => {
    renderScreen({ initialReview: null, initialErrorCode: "FORBIDDEN" });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("คุณไม่มีสิทธิ์ทำรายการนี้");
    expect(alert).toHaveTextContent("รายการนี้ยังไม่ได้ส่ง");
    expect(within(alert).queryByRole("button", { name: "ลองใหม่" })).toBeNull();
  });
});
