import { z } from "zod";

import { TELEMETRY_FLOWS } from "@/lib/telemetry/contracts";

// P15-05 incident contracts (ADM-008): acknowledge, append-only notes with a
// client note ID for safe retry, and resolution with a written outcome.

export const INCIDENT_SEVERITIES = ["sev1", "sev2", "sev3", "sev4"] as const;

export const SEVERITY_LABELS: Record<
  (typeof INCIDENT_SEVERITIES)[number],
  string
> = {
  sev1: "SEV1 · ใช้งานไม่ได้ทั้งระบบ",
  sev2: "SEV2 · ขั้นตอนหลักล้มเหลว",
  sev3: "SEV3 · บางส่วนมีปัญหา",
  sev4: "SEV4 · เล็กน้อย",
};

export const INCIDENT_STATUS_LABELS = {
  open: "เปิดอยู่",
  acknowledged: "รับทราบแล้ว",
  resolved: "แก้ไขแล้ว",
} as const;

export const incidentNoteSchema = z.object({
  id: z.uuid(),
  note: z.string(),
  createdAt: z.string(),
  byMe: z.boolean(),
});

export const incidentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  severity: z.enum(INCIDENT_SEVERITIES),
  status: z.enum(["open", "acknowledged", "resolved"]),
  flow: z.string().nullable(),
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolution: z.string().nullable(),
  notes: z.array(incidentNoteSchema),
});
export type Incident = z.infer<typeof incidentSchema>;

export const incidentSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  severity: z.enum(INCIDENT_SEVERITIES),
  status: z.enum(["open", "acknowledged", "resolved"]),
  flow: z.string().nullable(),
  createdAt: z.string(),
  noteCount: z.number().int(),
});
export type IncidentSummary = z.infer<typeof incidentSummarySchema>;

export const openIncidentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "ชื่อเหตุการณ์อย่างน้อย 3 ตัวอักษร")
    .max(160, "ชื่อยาวได้ไม่เกิน 160 ตัวอักษร"),
  severity: z.enum(INCIDENT_SEVERITIES),
  flow: z.enum(TELEMETRY_FLOWS).nullable(),
});

export const incidentNoteInputSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, "เขียนบันทึก")
    .max(2000, "ยาวได้ไม่เกิน 2,000 ตัวอักษร"),
  clientNoteId: z.uuid(),
});

export const resolveIncidentSchema = z.object({
  resolution: z
    .string()
    .trim()
    .min(3, "อธิบายการแก้ไขอย่างน้อย 3 ตัวอักษร")
    .max(2000, "ยาวได้ไม่เกิน 2,000 ตัวอักษร"),
});

/** ENVIRONMENTS_AND_OPERATIONS.md §9, shown beside every incident. */
export const INCIDENT_RUNBOOK = [
  "กำหนดระดับความรุนแรงและผู้รับผิดชอบ",
  "ปกป้องผู้ใช้และหยุดการรั่วไหลของข้อมูลก่อน",
  "เก็บหลักฐานที่ปิดบังแล้วและ Request ID ที่เกี่ยวข้อง",
  "แจ้งส่วนที่ได้รับผลกระทบและทางเลือกชั่วคราว",
  "กู้คืนและตรวจว่าใช้งานได้จริง",
  "บันทึกลำดับเหตุการณ์และสาเหตุ",
  "เพิ่มการทดสอบหรือปรับคู่มือเพื่อป้องกันซ้ำ",
] as const;

export const incidentKeys = {
  list: (status: string | null) => ["admin", "incidents", status] as const,
  detail: (id: string) => ["admin", "incident", id] as const,
};
