import { describe, expect, it } from "vitest";

import {
  PLANT_TRAIT_KEYS,
  SUBMIT_BLOCKERS,
  SUBMIT_BLOCKER_LABELS,
  isUnknownPlantName,
  ownerRelatedSchema,
  studentReviewRequestSchema,
  submitObservationRequestSchema,
} from "./contracts";
import {
  REVIEW_UI_ERROR_CODES,
  httpStatusForReviewError,
  reviewErrorPresentation,
} from "./errors";
import {
  interpretDecisionRow,
  interpretSaveReviewRow,
  interpretSubmitRow,
} from "./results";

const review = {
  expectedVersion: 2,
  identitySource: "manual",
  commonName: " ราชพฤกษ์ ",
  scientificName: "Cassia fistula",
  evidenceNote: "ดอกสีเหลืองห้อยเป็นช่อยาว ใบประกอบแบบขนนก",
  referenceNote: "",
  traits: [
    { traitKey: "leaf_arrangement", value: "เรียงสลับ" },
    { traitKey: "flower_color", status: "not_visible" },
  ],
};

describe("student review request", () => {
  it("accepts a manual review and trims text", () => {
    const parsed = studentReviewRequestSchema.parse(review);
    expect(parsed.commonName).toBe("ราชพฤกษ์");
    expect(parsed.referenceNote).toBeNull();
  });

  it("refuses AI identity, unknown or duplicate traits, and mixed trait rows", () => {
    for (const patch of [
      { identitySource: "ai_candidate" },
      { traits: [{ traitKey: "root_color", value: "x" }] },
      {
        traits: [
          { traitKey: "leaf_type", value: "ใบเดี่ยว" },
          { traitKey: "leaf_type", value: "ใบประกอบ" },
        ],
      },
      {
        traits: [
          { traitKey: "leaf_type", value: "ใบเดี่ยว", status: "unsure" },
        ],
      },
      { evidenceNote: "x".repeat(1001) },
    ]) {
      expect(
        studentReviewRequestSchema.safeParse({ ...review, ...patch }).success,
      ).toBe(false);
    }
  });

  it("uses snake_case trait keys the database accepts", () => {
    for (const key of PLANT_TRAIT_KEYS) {
      expect(key).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });
});

describe("unknown plant names", () => {
  it("mirrors the server list", () => {
    for (const value of ["ไม่ทราบ", " Unknown ", "?", "...", "", null]) {
      expect(isUnknownPlantName(value)).toBe(true);
    }
    for (const value of ["มะม่วง", "Mangifera indica"]) {
      expect(isUnknownPlantName(value)).toBe(false);
    }
  });
});

describe("submit request and results", () => {
  it("requires a client submission ID and explicit acknowledgement flag", () => {
    expect(
      submitObservationRequestSchema.safeParse({
        clientSubmissionId: "a1000000-0000-4000-8000-000000000001",
        expectedVersion: 4,
        acknowledgeSameSpecies: false,
      }).success,
    ).toBe(true);
    expect(
      submitObservationRequestSchema.safeParse({
        clientSubmissionId: "a1000000-0000-4000-8000-000000000001",
        expectedVersion: 4,
      }).success,
    ).toBe(false);
  });

  it("returns submitted and existing outcomes", () => {
    const row = {
      error_code: null,
      error_details: null,
      submission_id: "b1000000-0000-4000-8000-000000000001",
      submission_number: 1,
      observation_version: 5,
    };
    expect(interpretSubmitRow({ ...row, outcome: "submitted" }).data).toEqual({
      outcome: "submitted",
      submissionId: row.submission_id,
      submissionNumber: 1,
      version: 5,
    });
    expect(
      interpretSubmitRow({ ...row, outcome: "existing" }).data?.outcome,
    ).toBe("existing");
  });

  it("keeps blockers and counts but drops identifiers from denials", () => {
    const blocked = interpretSubmitRow({
      outcome: "denied",
      error_code: "PLANT_NAME_REQUIRED",
      error_details: {
        blockers: ["common_name", "evidence_note", "someone_elses_id"],
        reason: "unknown_not_accepted",
        fields: [],
        minChars: 20,
      },
      submission_id: null,
      submission_number: null,
      observation_version: 2,
    });
    expect(blocked.status).toBe(422);
    expect(blocked.error?.details).toEqual({
      blockers: ["common_name", "evidence_note"],
      reason: "unknown_not_accepted",
      minChars: 20,
    });

    const sameSpecies = interpretSubmitRow({
      outcome: "denied",
      error_code: "SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED",
      error_details: {
        sameSpeciesCount: 2,
        possibleSameSpecimenCount: 1,
        otherObservationId: "c1000000-0000-4000-8000-000000000001",
      },
      submission_id: null,
      submission_number: null,
      observation_version: 2,
    });
    expect(sameSpecies.status).toBe(409);
    expect(sameSpecies.error?.details).toEqual({
      sameSpeciesCount: 2,
      possibleSameSpecimenCount: 1,
    });

    expect(
      interpretSubmitRow({
        outcome: "denied",
        error_code: "SOMETHING_NEW",
        error_details: null,
        submission_id: null,
        submission_number: null,
        observation_version: null,
      }).status,
    ).toBe(403);
  });

  it("interprets review saves and relation decisions", () => {
    expect(
      interpretSaveReviewRow({
        outcome: "updated",
        error_code: null,
        error_details: null,
        observation_version: 2,
        observation_status: "student_review",
      }).data,
    ).toEqual({ outcome: "updated", version: 2, status: "student_review" });
    expect(
      interpretDecisionRow({
        outcome: "denied",
        error_code: "INVALID_STATUS_TRANSITION",
        error_details: { reason: "decision_changed", relation: { x: 1 } },
        relation: null,
      }).error?.details,
    ).toEqual({ reason: "decision_changed" });
  });
});

describe("review errors and read models", () => {
  it("presents every code and labels every blocker", () => {
    for (const code of REVIEW_UI_ERROR_CODES) {
      expect(reviewErrorPresentation(code).title).toBeTruthy();
    }
    for (const blocker of SUBMIT_BLOCKERS) {
      expect(SUBMIT_BLOCKER_LABELS[blocker]).toBeTruthy();
    }
    expect(reviewErrorPresentation("SCIENTIFIC_NAME_REQUIRED").title).toBe(
      "ต้องกรอกชื่อวิทยาศาสตร์",
    );
    expect(httpStatusForReviewError("STUDENT_REVIEW_REQUIRED")).toBe(422);
    expect(
      httpStatusForReviewError("SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED"),
    ).toBe(409);
  });

  it("keeps the owner related view to counts", () => {
    const parsed = ownerRelatedSchema.parse({
      basis: "submitted",
      sameSpeciesInSession: true,
      sameSpeciesCount: 1,
      possibleSameSpecimenCount: 1,
      visibility: "restricted",
      refreshedAt: "2026-09-19T10:00:00+00:00",
      relations: [{ otherStudentName: "leak" }],
    });
    expect(parsed).not.toHaveProperty("relations");
  });
});
