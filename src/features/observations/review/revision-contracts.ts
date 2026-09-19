import { z } from "zod";

import {
  PLANT_TRAIT_KEYS,
  reviewTraitSchema,
  teacherReviewRecordSchema,
  teacherReviewViewSchema,
} from "./contracts";

// P12 teacher review, revision, additional topics, and issue reports
// (REV-007 to REV-012; API_AND_REALTIME.md §§18, 22, 24; D-065 to D-067).

/** Revision topics v1 (D-065); capture location and time are never a topic. */
export const REVISION_TOPICS = [
  "images",
  "common_name",
  "scientific_name",
  "traits",
  "evidence_note",
  "reference_note",
] as const;

export type RevisionTopic = (typeof REVISION_TOPICS)[number];

export const REVISION_TOPIC_LABELS: Record<RevisionTopic, string> = {
  images: "ภาพหลักฐาน",
  common_name: "ชื่อไทยหรือชื่อทั่วไป",
  scientific_name: "ชื่อวิทยาศาสตร์",
  traits: "การตรวจลักษณะ",
  evidence_note: "เหตุผลประกอบ",
  reference_note: "แหล่งอ้างอิง",
};

export const REVIEW_DECISIONS = [
  "verified",
  "revision_required",
  "unable_to_verify",
  "rejected",
] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const REVIEW_DECISION_LABELS: Record<ReviewDecision, string> = {
  verified: "รับรอง",
  revision_required: "ขอให้แก้ไข",
  unable_to_verify: "ตรวจสอบไม่ได้",
  rejected: "ไม่รับรายการ",
};

export const REPORT_TYPES = [
  "identity",
  "image",
  "location",
  "privacy",
  "other",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  image: "ภาพไม่ตรงกับพืช",
  location: "ตำแหน่งผิดพลาด",
  identity: "ข้อมูลชนิดไม่ถูกต้อง",
  privacy: "เนื้อหาไม่เหมาะสมหรือข้อมูลส่วนตัว",
  other: "อื่น ๆ",
};

export const FEEDBACK_MAX_CHARS = 500;
export const REPORT_REASON_MIN_CHARS = 10;

const topicListSchema = z
  .array(z.enum(REVISION_TOPICS))
  .max(REVISION_TOPICS.length)
  .refine((keys) => new Set(keys).size === keys.length, "duplicate topic");

const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    });

export const reviewDecisionRequestSchema = z
  .object({
    submissionId: z.uuid(),
    decision: z.enum(REVIEW_DECISIONS),
    verifiedCommonName: optionalTrimmed(120),
    verifiedScientificName: optionalTrimmed(160),
    correctedTraits: z
      .record(
        z.string().refine((key) => PLANT_TRAIT_KEYS.includes(key)),
        z.string().trim().min(1).max(120),
      )
      .default({}),
    feedback: optionalTrimmed(FEEDBACK_MAX_CHARS),
    topicKeys: topicListSchema.default([]),
  })
  .strict();

export type ReviewDecisionRequest = z.infer<typeof reviewDecisionRequestSchema>;

export const saveRevisionRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    commonName: optionalTrimmed(120),
    scientificName: optionalTrimmed(160),
    evidenceNote: optionalTrimmed(1000),
    referenceNote: optionalTrimmed(300),
    traits: z.array(reviewTraitSchema).max(40),
  })
  .strict();

export type SaveRevisionRequest = z.infer<typeof saveRevisionRequestSchema>;

export const unlockRequestSchema = z
  .object({
    fieldKeys: topicListSchema.min(1),
    reason: z.string().trim().min(5).max(300),
  })
  .strict();

export const unlockDecisionRequestSchema = z
  .object({
    decision: z.enum(["granted", "denied"]),
    fieldKeys: topicListSchema.min(1).nullable().default(null),
    note: optionalTrimmed(300),
  })
  .strict();

export const issueReportRequestSchema = z
  .object({
    type: z.enum(REPORT_TYPES),
    reason: z.string().trim().min(REPORT_REASON_MIN_CHARS).max(500),
  })
  .strict();

export const reportResolutionRequestSchema = z
  .object({
    status: z.enum(["reviewing", "resolved", "dismissed"]),
    note: optionalTrimmed(500),
  })
  .strict();

export const QUEUE_FILTERS = [
  "pending",
  "resubmitted",
  "same_species",
  "revision_required",
  "verified",
  "unable_to_verify",
  "rejected",
] as const;

export type QueueFilter = (typeof QUEUE_FILTERS)[number];

export const QUEUE_FILTER_LABELS: Record<QueueFilter, string> = {
  pending: "รอตรวจ",
  resubmitted: "ส่งซ้ำ",
  same_species: "ชนิดซ้ำ",
  revision_required: "รอแก้ไข",
  verified: "รับรองแล้ว",
  unable_to_verify: "ตรวจสอบไม่ได้",
  rejected: "ไม่รับ",
};

export const reviewQueueQuerySchema = z.object({
  classId: z.uuid(),
  sessionId: z.uuid().optional(),
  filter: z.enum(QUEUE_FILTERS).default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursorSubmittedAt: z.string().min(1).optional(),
  cursorId: z.uuid().optional(),
});

// Read models (non-strict: additive fields must not break clients) ------------------

const queueItemRecordSchema = z.object({
  observationId: z.uuid(),
  status: z.string(),
  studentName: z.string().nullable(),
  groupName: z.string().nullable(),
  sessionId: z.uuid(),
  sessionTitle: z.string(),
  commonName: z.string(),
  scientificName: z.string(),
  submissionNumber: z.number().int(),
  latestSubmittedAt: z.string(),
  sameSpeciesInSession: z.boolean(),
  pendingUnlockRequest: z.boolean(),
  openReportCount: z.number().int(),
  thumbnailPath: z.string().nullable(),
});

export const reviewQueueRecordSchema = z.object({
  items: z.array(queueItemRecordSchema),
  nextCursor: z
    .object({ submittedAt: z.string(), observationId: z.uuid() })
    .nullable(),
  counts: z.object({
    pending: z.number().int(),
    resubmitted: z.number().int(),
    sameSpecies: z.number().int(),
    verified: z.number().int(),
    revisionRequired: z.number().int(),
  }),
  refreshedAt: z.string(),
});

/** What the browser receives: a signed thumbnail, never a storage path. */
export const reviewQueueViewSchema = reviewQueueRecordSchema.extend({
  items: z.array(
    queueItemRecordSchema
      .omit({ thumbnailPath: true })
      .extend({ thumbnailUrl: z.string().nullable() }),
  ),
});

export type ReviewQueueView = z.infer<typeof reviewQueueViewSchema>;

export const reviewEntrySchema = z.object({
  id: z.uuid(),
  submissionId: z.uuid(),
  submissionNumber: z.number().int(),
  decision: z.enum(REVIEW_DECISIONS),
  reviewerName: z.string().nullable(),
  verifiedCommonName: z.string().nullable(),
  verifiedScientificName: z.string().nullable(),
  correctedTraits: z.record(z.string(), z.string()),
  feedback: z.string().nullable(),
  topics: z.array(
    z.object({ fieldKey: z.enum(REVISION_TOPICS), source: z.string() }),
  ),
  reviewedAt: z.string(),
});

export type ReviewEntry = z.infer<typeof reviewEntrySchema>;

export const unlockRequestEntrySchema = z.object({
  id: z.uuid(),
  reviewId: z.uuid(),
  requestedFields: z.array(z.enum(REVISION_TOPICS)),
  reason: z.string(),
  status: z.enum(["pending", "granted", "denied", "cancelled"]),
  grantedFields: z.array(z.enum(REVISION_TOPICS)).nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});

export type UnlockRequestEntry = z.infer<typeof unlockRequestEntrySchema>;

export const historyEntrySchema = z.object({
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  reason: z.string(),
  changedAt: z.string(),
});

export const reportEntrySchema = z.object({
  id: z.uuid(),
  type: z.enum(REPORT_TYPES),
  reason: z.string(),
  status: z.enum(["open", "reviewing", "resolved", "dismissed"]),
  reporterName: z.string().nullable(),
  createdAt: z.string(),
});

export const revisionStateSchema = z.object({
  observationId: z.uuid(),
  status: z.string(),
  version: z.number().int(),
  submissionCount: z.number().int(),
  current: z.object({
    commonName: z.string().nullable(),
    scientificName: z.string().nullable(),
    evidenceNote: z.string().nullable(),
    referenceNote: z.string().nullable(),
    traits: z.array(
      z.object({
        traitKey: z.string(),
        status: z.string().nullable(),
        value: z.string().nullable(),
        note: z.string().nullable(),
      }),
    ),
  }),
  verifiedIdentity: z
    .object({ commonName: z.string(), scientificName: z.string() })
    .nullable(),
  latestReview: z
    .object({
      id: z.uuid(),
      decision: z.enum(REVIEW_DECISIONS),
      feedback: z.string().nullable(),
      verifiedCommonName: z.string().nullable(),
      verifiedScientificName: z.string().nullable(),
      correctedTraits: z.record(z.string(), z.string()),
      reviewedAt: z.string(),
      submissionNumber: z.number().int(),
    })
    .nullable(),
  openTopics: z.array(z.enum(REVISION_TOPICS)),
  changedTopics: z.array(z.enum(REVISION_TOPICS)),
  readiness: z.object({ blockers: z.array(z.string()) }),
  unlockRequests: z.array(unlockRequestEntrySchema),
  permissions: z.object({
    canEdit: z.boolean(),
    canResubmit: z.boolean(),
    canRequestTopics: z.boolean(),
    blockedCode: z.string().nullable(),
    blockedReason: z.string().nullable(),
  }),
  refreshedAt: z.string(),
});

export type RevisionState = z.infer<typeof revisionStateSchema>;

export const issueReportViewSchema = z.object({
  id: z.uuid(),
  observationId: z.uuid(),
  classId: z.uuid(),
  type: z.enum(REPORT_TYPES),
  reason: z.string(),
  status: z.enum(["open", "reviewing", "resolved", "dismissed"]),
  reporterName: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  observation: z
    .object({
      status: z.string(),
      commonName: z.string().nullable(),
      scientificName: z.string().nullable(),
      studentName: z.string().nullable(),
    })
    .nullable(),
  refreshedAt: z.string(),
});

export type IssueReportView = z.infer<typeof issueReportViewSchema>;

const teacherReviewDetailFields = {
  version: z.number().int(),
  latestSubmissionId: z.uuid().nullable(),
  verifiedIdentity: z
    .object({ commonName: z.string(), scientificName: z.string() })
    .nullable(),
  reviews: z.array(reviewEntrySchema),
  unlockRequests: z.array(unlockRequestEntrySchema),
  history: z.array(historyEntrySchema),
  reports: z.array(reportEntrySchema),
  permissions: z.object({ canDecide: z.boolean(), canBegin: z.boolean() }),
};

/** The P12 teacher read model: P11 evidence plus reviews and requests. */
export const teacherReviewDetailRecordSchema = teacherReviewRecordSchema.extend(
  teacherReviewDetailFields,
);

export const teacherReviewDetailViewSchema = teacherReviewViewSchema.extend(
  teacherReviewDetailFields,
);

export type TeacherReviewDetail = z.infer<typeof teacherReviewDetailViewSchema>;

// Mutation responses ----------------------------------------------------------------

export const beginReviewResponseSchema = z
  .object({
    outcome: z.enum(["started", "unchanged"]),
    status: z.string(),
    version: z.number().int(),
  })
  .strict();

export const reviewDecisionResponseSchema = z
  .object({
    outcome: z.enum(["decided", "existing"]),
    reviewId: z.uuid(),
    status: z.string(),
    version: z.number().int(),
  })
  .strict();

export const saveRevisionResponseSchema = z
  .object({
    outcome: z.enum(["updated", "unchanged"]),
    version: z.number().int().min(1),
    status: z.string(),
  })
  .strict();

export const resubmitResponseSchema = z
  .object({
    outcome: z.enum(["resubmitted", "existing"]),
    submissionId: z.uuid(),
    submissionNumber: z.number().int().min(1),
    version: z.number().int().min(1),
  })
  .strict();

export const unlockRequestResponseSchema = z
  .object({
    outcome: z.enum(["requested", "existing"]),
    requestId: z.uuid(),
  })
  .strict();

export const unlockDecisionResponseSchema = z
  .object({
    outcome: z.enum(["decided", "unchanged"]),
    status: z.string(),
  })
  .strict();

export const issueReportResponseSchema = z
  .object({ outcome: z.literal("reported"), reportId: z.uuid() })
  .strict();

export const reportResolutionResponseSchema = z
  .object({
    outcome: z.enum(["updated", "unchanged"]),
    status: z.string(),
  })
  .strict();

export const revisionQueryKeys = {
  state: (observationId: string) =>
    ["observations", "revision", observationId] as const,
  queue: (classId: string, filter: string, sessionId: string | null) =>
    ["reviews", "queue", classId, filter, sessionId] as const,
  report: (reportId: string) => ["reviews", "report", reportId] as const,
};
