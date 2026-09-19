import { z } from "zod";

import { TELEMETRY_FLOWS } from "@/lib/telemetry/contracts";

// P15-03/P15-04 contracts: flow health, the audit explorer, and the error
// explorer. Searches default to the last 24 hours and never span more than
// 31 days (API_AND_REALTIME.md); flow health windows are 1 hour to 7 days.

export const HEALTH_WINDOWS = [1, 24, 168] as const;

export const auditEventSchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  actorId: z.uuid().nullable(),
  actorKind: z.string(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.uuid().nullable(),
  schoolId: z.uuid().nullable(),
  classId: z.uuid().nullable(),
  outcome: z.enum(["succeeded", "denied", "failed"]),
  requestId: z.uuid().nullable(),
  traceId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const errorEventSchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  receivedAt: z.string(),
  environment: z.string(),
  releaseVersion: z.string().nullable(),
  flow: z.string(),
  stage: z.string(),
  errorCode: z.string(),
  severity: z.enum(["info", "warning", "error", "critical"]),
  source: z.enum(["client", "server", "database"]),
  fingerprint: z.string(),
  requestId: z.uuid().nullable(),
  traceId: z.string().nullable(),
  context: z.record(z.string(), z.unknown()),
});
export type ErrorEvent = z.infer<typeof errorEventSchema>;

const flowHealthSchema = z.object({
  flow: z.string(),
  errorCount: z.number(),
  criticalCount: z.number(),
  lastErrorAt: z.string().nullable(),
  topErrorCodes: z.array(
    z.object({ code: z.string(), stage: z.string(), count: z.number() }),
  ),
  telemetry: z.enum(["errors_only", "unavailable"]),
});

export const flowHealthReportSchema = z.object({
  window: z.object({ from: z.string(), to: z.string() }),
  freshAt: z.string(),
  flows: z.array(flowHealthSchema),
  queues: z.object({
    export: z.object({
      queued: z.number(),
      running: z.number(),
      oldestQueuedAgeSeconds: z.number(),
      stuckRunning: z.number(),
      failedInWindow: z.number(),
      readyInWindow: z.number(),
    }),
    upload: z.object({
      pending: z.number(),
      stalePending: z.number(),
      uploadedInWindow: z.number(),
    }),
    ai: z.object({ status: z.string() }),
  }),
  sessions: z.object({ open: z.number(), paused: z.number() }),
});
export type FlowHealthReport = z.infer<typeof flowHealthReportSchema>;
export type FlowHealth = z.infer<typeof flowHealthSchema>;

const optionalUuid = z.uuid().nullable();
const optionalDate = z.iso.datetime({ offset: true }).nullable();

export const auditFilterSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  actorId: optionalUuid,
  action: z
    .string()
    .regex(/^[a-z_.]{1,80}$/)
    .nullable(),
  resourceType: z
    .string()
    .regex(/^[a-z_]{1,64}$/)
    .nullable(),
  outcome: z.enum(["succeeded", "denied", "failed"]).nullable(),
  requestId: optionalUuid,
});
export type AuditFilter = z.infer<typeof auditFilterSchema>;

export const errorFilterSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  flow: z.enum(TELEMETRY_FLOWS).nullable(),
  stage: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,40}$/)
    .nullable(),
  code: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{2,63}$/)
    .nullable(),
  release: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,64}$/)
    .nullable(),
  environment: z
    .enum(["local", "development", "preview", "staging", "production"])
    .nullable(),
  requestId: optionalUuid,
  traceId: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,64}$/)
    .nullable(),
});
export type ErrorFilter = z.infer<typeof errorFilterSchema>;

/** Query-string values, blank as null, validated by the schema. */
export function filterFromParams<T extends z.ZodObject>(
  schema: T,
  params: URLSearchParams,
): z.infer<T> | null {
  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((key) => {
      const value = params.get(key)?.trim();
      return [key, value ? value : null];
    }),
  );
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const FLOW_LABELS: Record<string, string> = {
  auth: "เข้าสู่ระบบ",
  class_join: "เข้าห้องเรียน",
  group_formation: "จัดกลุ่ม",
  session_control: "ควบคุมรอบสำรวจ",
  observation: "บันทึกการสังเกต",
  upload: "อัปโหลดภาพ",
  ai: "AI วิเคราะห์",
  submission_review: "ส่งงานและตรวจ",
  realtime: "เรียลไทม์",
  export: "ส่งออกข้อมูล",
  offline_sync: "ซิงก์ออฟไลน์",
  admin: "ผู้ดูแลระบบ",
};

export const operationsKeys = {
  health: (hours: number) => ["admin", "health", hours] as const,
  audit: (filter: AuditFilter) => ["admin", "audit", filter] as const,
  errors: (filter: ErrorFilter) => ["admin", "errors", filter] as const,
};
