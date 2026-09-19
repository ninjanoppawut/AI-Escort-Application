import { describe, expect, it } from "vitest";

import { httpStatusForReviewError, reviewErrorPresentation } from "./errors";
import { reviewDenial } from "./results";
import {
  issueReportRequestSchema,
  reviewDecisionRequestSchema,
  reviewQueueQuerySchema,
  saveRevisionRequestSchema,
  unlockDecisionRequestSchema,
  unlockRequestSchema,
} from "./revision-contracts";

const submissionId = "83000000-0000-4000-8000-000000008631";

describe("P12 request schemas", () => {
  it("accepts a verify-with-correction decision and trims text", () => {
    const parsed = reviewDecisionRequestSchema.parse({
      submissionId,
      decision: "verified",
      verifiedCommonName: "  พู่ระหง ",
      verifiedScientificName: "Hibiscus schizopetalus",
      correctedTraits: { leaf_margin: "หยักฟันเลื่อย" },
      feedback: "  ",
    });
    expect(parsed).toEqual({
      submissionId,
      decision: "verified",
      verifiedCommonName: "พู่ระหง",
      verifiedScientificName: "Hibiscus schizopetalus",
      correctedTraits: { leaf_margin: "หยักฟันเลื่อย" },
      feedback: null,
      topicKeys: [],
    });
  });

  it("refuses unknown traits, the location topic, duplicates, and extra fields", () => {
    const base = { submissionId, decision: "revision_required" };
    expect(
      reviewDecisionRequestSchema.safeParse({
        ...base,
        correctedTraits: { leaf_color_of_moon: "x" },
      }).success,
    ).toBe(false);
    expect(
      reviewDecisionRequestSchema.safeParse({
        ...base,
        topicKeys: ["location"],
      }).success,
    ).toBe(false);
    expect(
      reviewDecisionRequestSchema.safeParse({
        ...base,
        topicKeys: ["images", "images"],
      }).success,
    ).toBe(false);
    expect(
      reviewDecisionRequestSchema.safeParse({ ...base, reviewerId: "x" })
        .success,
    ).toBe(false);
  });

  it("bounds unlock requests, grants, reports, and revision saves", () => {
    expect(
      unlockRequestSchema.safeParse({ fieldKeys: [], reason: "พบหลักฐาน" })
        .success,
    ).toBe(false);
    expect(
      unlockRequestSchema.safeParse({ fieldKeys: ["traits"], reason: "สั้น" })
        .success,
    ).toBe(false);
    expect(unlockDecisionRequestSchema.parse({ decision: "denied" })).toEqual({
      decision: "denied",
      fieldKeys: null,
      note: null,
    });
    expect(
      issueReportRequestSchema.safeParse({ type: "identity", reason: "ไม่ตรง" })
        .success,
    ).toBe(false);
    expect(
      issueReportRequestSchema.safeParse({
        type: "location",
        reason: "ตำแหน่งอยู่นอกโรงเรียน",
      }).success,
    ).toBe(true);
    expect(
      saveRevisionRequestSchema.safeParse({
        expectedVersion: 4,
        commonName: "ชบา",
        scientificName: null,
        evidenceNote: null,
        referenceNote: null,
        traits: [{ traitKey: "bark", status: "not_visible", note: null }],
      }).success,
    ).toBe(true);
  });

  it("coerces queue query strings and defaults to the pending filter", () => {
    expect(
      reviewQueueQuerySchema.parse({
        classId: "20000000-0000-4000-8000-000000008631",
        limit: "20",
      }),
    ).toMatchObject({ filter: "pending", limit: 20 });
    expect(
      reviewQueueQuerySchema.safeParse({
        classId: "20000000-0000-4000-8000-000000008631",
        limit: "500",
      }).success,
    ).toBe(false);
  });
});

describe("P12 denials", () => {
  it("passes only documented, identifier-free details", () => {
    const rateLimited = reviewDenial({
      error_code: "RATE_LIMITED",
      error_details: { retryAfterSeconds: 3600, reporterId: "secret" },
    });
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.error?.details).toEqual({ retryAfterSeconds: 3600 });

    const locked = reviewDenial({
      error_code: "FIELD_NOT_UNLOCKED_FOR_REVISION",
      error_details: { fields: ["common_name", "capture_location"] },
    });
    expect(locked.status).toBe(409);
    expect(locked.error?.details).toEqual({ fields: ["common_name"] });

    const conflict = reviewDenial({
      error_code: "OBSERVATION_VERSION_CONFLICT",
      error_details: {
        reason: "submission_changed",
        currentSubmissionId: submissionId,
        currentStatus: "resubmitted",
        reviewerName: "Teacher Tam",
      },
    });
    expect(conflict.error?.details).toEqual({
      reason: "submission_changed",
      currentSubmissionId: submissionId,
      currentStatus: "resubmitted",
    });
  });

  it("presents the new codes with the UI_CONTRACTS titles", () => {
    expect(
      reviewErrorPresentation("FIELD_NOT_UNLOCKED_FOR_REVISION"),
    ).toMatchObject({
      title: "ครูยังไม่เปิดหัวข้อนี้ให้แก้",
      action: "ส่งคำขอแก้เพิ่ม",
    });
    expect(reviewErrorPresentation("RATE_LIMITED").title).toBe(
      "ทำรายการบ่อยเกินไป",
    );
    expect(httpStatusForReviewError("RATE_LIMITED")).toBe(429);
  });
});
