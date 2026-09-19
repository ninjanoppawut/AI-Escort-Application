import { z } from "zod";

// P15 redacted operational error intake. Flows and stages are low-cardinality
// slugs, codes are stable identifiers, and context carries only bounded
// numbers or category slugs (the database drops anything else).

export const TELEMETRY_FLOWS = [
  "auth",
  "class_join",
  "group_formation",
  "session_control",
  "observation",
  "upload",
  "ai",
  "submission_review",
  "realtime",
  "export",
  "offline_sync",
  "admin",
] as const;

export type TelemetryFlow = (typeof TELEMETRY_FLOWS)[number];

export const clientErrorReportSchema = z.object({
  flow: z.enum(TELEMETRY_FLOWS),
  stage: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  severity: z.enum(["info", "warning", "error", "critical"]),
  requestId: z.uuid().nullable().optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  context: z
    .object({
      http_status: z.number().int().min(0).max(999).optional(),
      attempt: z.number().int().min(0).max(1000).optional(),
      duration_ms: z.number().int().min(0).max(86_400_000).optional(),
      bytes: z.number().int().min(0).max(100_000_000).optional(),
      category: z
        .string()
        .regex(/^[a-z0-9_]{1,40}$/)
        .optional(),
    })
    .strict()
    .optional(),
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
