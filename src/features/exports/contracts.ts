import { z } from "zod";

// P14-03/P14-04 exports (MAP-007, MAP-008; API_AND_REALTIME.md §24; D-069).

export const EXPORT_TYPES = ["csv", "geojson"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const EXPORT_STATUS_FILTERS = [
  "submitted",
  "teacher_review",
  "revision_required",
  "resubmitted",
  "verified",
  "unable_to_verify",
  "rejected",
] as const;

/** Small exports finish in the request; larger ones are queued (API §24). */
export const SYNC_EXPORT_ROW_LIMIT = 1000;

export const exportRequestSchema = z
  .object({
    classId: z.uuid(),
    sessionId: z.uuid(),
    type: z.enum(EXPORT_TYPES),
    filters: z
      .object({
        statuses: z
          .array(z.enum(EXPORT_STATUS_FILTERS))
          .min(1)
          .max(EXPORT_STATUS_FILTERS.length)
          .refine((values) => new Set(values).size === values.length)
          .optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export type ExportRequest = z.infer<typeof exportRequestSchema>;

/** export-v1 column order (D-069). Changing it is a new schema version. */
export const EXPORT_V1_COLUMNS = [
  "schema_version",
  "observation_id",
  "status",
  "submission_number",
  "submitted_at",
  "captured_at",
  "location_status",
  "latitude",
  "longitude",
  "accuracy_m",
  "location_source",
  "student_common_name",
  "student_scientific_name",
  "identity_source",
  "evidence_note",
  "verified_common_name",
  "verified_scientific_name",
  "review_decision",
  "reviewed_at",
  "same_species_in_session",
  "recorder_name",
  "group_name",
  "image_count",
] as const;

export type ExportColumn = (typeof EXPORT_V1_COLUMNS)[number];

export const exportRowSchema = z.object(
  Object.fromEntries(
    EXPORT_V1_COLUMNS.map((column) => [
      column,
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ]),
  ) as unknown as Record<
    ExportColumn,
    z.ZodType<string | number | boolean | null>
  >,
);

export type ExportRow = z.infer<typeof exportRowSchema>;

export const exportRowsSchema = z.object({
  exportId: z.uuid(),
  type: z.enum(["csv", "geojson", "research_csv"]),
  schemaVersion: z.string(),
  rows: z.array(exportRowSchema),
  truncated: z.boolean(),
});

export const EXPORT_STATUSES = [
  "queued",
  "running",
  "ready",
  "failed",
  "expired",
] as const;

export const exportViewSchema = z.object({
  id: z.uuid(),
  classId: z.uuid(),
  sessionId: z.uuid(),
  sessionTitle: z.string().nullable(),
  type: z.enum(["csv", "geojson", "research_csv"]),
  schemaVersion: z.string(),
  status: z.enum(EXPORT_STATUSES),
  filters: z.object({ statuses: z.array(z.string()).optional() }).nullable(),
  rowCount: z.number().int().nullable(),
  byteSize: z.number().int().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  expiresAt: z.string(),
  refreshedAt: z.string(),
});

export type ExportView = z.infer<typeof exportViewSchema>;

export const exportRequestResponseSchema = z
  .object({
    outcome: z.enum(["requested", "existing"]),
    exportId: z.uuid(),
    status: z.enum(EXPORT_STATUSES),
  })
  .strict();

export const EXPORT_STATUS_LABELS: Record<ExportView["status"], string> = {
  queued: "อยู่ในคิว",
  running: "กำลังสร้างไฟล์",
  ready: "พร้อมดาวน์โหลด",
  failed: "สร้างไฟล์ไม่สำเร็จ",
  expired: "หมดอายุแล้ว",
};

export const exportQueryKeys = {
  detail: (exportId: string) => ["exports", exportId] as const,
};
