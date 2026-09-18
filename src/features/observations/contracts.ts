import { z } from "zod";

// Observation status tokens follow UI_CONTRACTS.md §2; only `draft` is
// reachable in the P8 foundation.
export const OBSERVATION_STATUSES = [
  "draft",
  "images_uploading",
  "analysis_queued",
  "analysis_running",
  "student_review",
  "submitted",
  "teacher_review",
  "revision_required",
  "resubmitted",
  "verified",
  "unable_to_verify",
  "rejected",
] as const;

export const observationStatusSchema = z.enum(OBSERVATION_STATUSES);
export type ObservationStatus = z.infer<typeof observationStatusSchema>;

export const LOCATION_STATUSES = [
  "captured",
  "unavailable",
  "teacher_accepted_missing",
] as const;

export const LOCATION_UNAVAILABLE_REASONS = [
  "position_unavailable",
  "timeout",
  "unsupported",
] as const;

export type LocationUnavailableReason =
  (typeof LOCATION_UNAVAILABLE_REASONS)[number];

/** Fixes worse than this show the weak-signal warning; they never block (D-051). */
export const POOR_ACCURACY_M = 20;

export const DRAFT_FIELD_LIMITS = {
  commonName: 120,
  scientificName: 160,
  evidenceNote: 1000,
} as const;

const latitude = z.number().finite().min(-90).max(90);
const longitude = z.number().finite().min(-180).max(180);
const accuracyMeters = z.number().finite().positive().max(100_000);
const isoDateTime = z.iso.datetime({ offset: true });

export const captureRequestSchema = z.discriminatedUnion("locationStatus", [
  z
    .object({
      locationStatus: z.literal("captured"),
      lat: latitude,
      lng: longitude,
      accuracyM: accuracyMeters,
      capturedAt: isoDateTime,
    })
    .strict(),
  z
    .object({
      locationStatus: z.literal("unavailable"),
      unavailableReason: z.enum(LOCATION_UNAVAILABLE_REASONS),
      capturedAt: isoDateTime,
    })
    .strict(),
]);

export type CaptureRequest = z.infer<typeof captureRequestSchema>;

export const startObservationRequestSchema = z
  .object({
    clientGeneratedId: z.uuid(),
    sessionId: z.uuid(),
    capture: captureRequestSchema,
  })
  .strict();

export type StartObservationRequest = z.infer<
  typeof startObservationRequestSchema
>;

const optionalDraftText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    });

export const updateObservationDraftRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    commonName: optionalDraftText(DRAFT_FIELD_LIMITS.commonName),
    scientificName: optionalDraftText(DRAFT_FIELD_LIMITS.scientificName),
    evidenceNote: optionalDraftText(DRAFT_FIELD_LIMITS.evidenceNote),
  })
  .strict();

export type UpdateObservationDraftRequest = z.infer<
  typeof updateObservationDraftRequestSchema
>;

export const observationIdParamSchema = z.object({ id: z.uuid() });

export const startObservationRowSchema = z.object({
  outcome: z.enum(["created", "existing", "denied"]),
  error_code: z.string().nullable(),
  error_details: z.unknown().nullable(),
  observation_id: z.uuid().nullable(),
  observation_version: z.number().int().nullable(),
});

export const updateObservationDraftRowSchema = z.object({
  outcome: z.enum(["updated", "unchanged", "denied"]),
  error_code: z.string().nullable(),
  error_details: z.unknown().nullable(),
  observation_version: z.number().int().nullable(),
});

export const observationDraftSchema = z
  .object({
    id: z.uuid(),
    clientGeneratedId: z.uuid(),
    status: observationStatusSchema,
    version: z.number().int().min(1),
    capture: z
      .object({
        locationStatus: z.enum(LOCATION_STATUSES),
        lat: latitude.nullable(),
        lng: longitude.nullable(),
        accuracyM: accuracyMeters.nullable(),
        capturedAt: z.string(),
        unavailableReason: z.enum(LOCATION_UNAVAILABLE_REASONS).nullable(),
      })
      .strict(),
    draft: z
      .object({
        commonName: z.string().nullable(),
        scientificName: z.string().nullable(),
        evidenceNote: z.string().nullable(),
      })
      .strict(),
    session: z
      .object({
        id: z.uuid(),
        classId: z.uuid(),
        title: z.string(),
        status: z.enum(["scheduled", "open", "paused", "completed"]),
      })
      .strict(),
    activity: z.object({ id: z.uuid(), title: z.string() }).strict(),
    groupStatus: z.enum(["waiting", "ready", "active", "paused", "completed"]),
    permissions: z
      .object({
        canEdit: z.boolean(),
        blockedCode: z.string().nullable(),
        blockedReason: z.string().nullable(),
      })
      .strict(),
    createdAt: z.string(),
    updatedAt: z.string(),
    refreshedAt: z.string().optional(),
  })
  .strict();

export type ObservationDraft = z.infer<typeof observationDraftSchema>;

export const sessionObservationsSchema = z
  .object({
    sessionId: z.uuid(),
    sessionStatus: z.enum(["scheduled", "open", "paused", "completed"]),
    canStart: z.boolean(),
    startBlockedCode: z.string().nullable(),
    startBlockedReason: z.string().nullable(),
    items: z.array(observationDraftSchema),
    hasMore: z.boolean(),
    refreshedAt: z.string(),
  })
  .strict();

export type SessionObservations = z.infer<typeof sessionObservationsSchema>;

export const observationQueryKeys = {
  all: ["observations"] as const,
  detail: (observationId: string) =>
    [...observationQueryKeys.all, "detail", observationId] as const,
  session: (sessionId: string) =>
    [...observationQueryKeys.all, "session", sessionId] as const,
};

export const OBSERVATION_STATUS_LABELS: Record<ObservationStatus, string> = {
  draft: "ฉบับร่าง",
  images_uploading: "กำลังอัปโหลดรูป",
  analysis_queued: "รอ AI วิเคราะห์",
  analysis_running: "AI กำลังวิเคราะห์",
  student_review: "รอนักเรียนตรวจสอบ",
  submitted: "ส่งให้ครูแล้ว",
  teacher_review: "ครูกำลังตรวจ",
  revision_required: "ครูขอให้แก้ไข",
  resubmitted: "ส่งแก้ไขแล้ว",
  verified: "ครูยืนยันแล้ว",
  unable_to_verify: "ยังยืนยันไม่ได้",
  rejected: "ไม่รับรายการ",
};
