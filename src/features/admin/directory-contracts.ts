import { z } from "zod";

import type { ApiErrorCode } from "@/lib/http/error-code";

// P15-02 contracts: school provisioning, teacher invitations, and the
// directory. Pages use an opaque keyset cursor (ADM-012): 50 rows by
// default, never more than 100.

export const ADMIN_PAGE_SIZE = 50;
export const ADMIN_PAGE_SIZE_MAX = 100;

const cursorSchema = z.object({
  c: z.iso.datetime({ offset: true }),
  i: z.uuid(),
});
export type AdminCursor = z.infer<typeof cursorSchema>;

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0)),
  );
}

export function encodeAdminCursor(createdAt: string, id: string) {
  return toBase64Url(JSON.stringify({ c: createdAt, i: id }));
}

/** undefined when absent, null when present but invalid. */
export function decodeAdminCursor(
  value: string | null | undefined,
): AdminCursor | null | undefined {
  if (!value) return undefined;
  if (value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(fromBase64Url(value)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parsePageSize(value: string | null) {
  if (!value) return ADMIN_PAGE_SIZE;
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1) return ADMIN_PAGE_SIZE;
  return Math.min(size, ADMIN_PAGE_SIZE_MAX);
}

export function adminPageOf<T extends { createdAt: string; id: string }>(
  items: T[],
  pageSize: number,
) {
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      last && items.length >= pageSize
        ? encodeAdminCursor(last.createdAt, last.id)
        : null,
  };
}

export const adminSchoolSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(["active", "archived"]),
  createdAt: z.string(),
  teacherCount: z.number().int(),
  studentCount: z.number().int(),
  classCount: z.number().int(),
  pendingInvitationCount: z.number().int(),
});
export type AdminSchool = z.infer<typeof adminSchoolSchema>;

export const adminInvitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.string(),
  createdAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type AdminInvitation = z.infer<typeof adminInvitationSchema>;

export const adminUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  accountType: z.enum(["student", "teacher"]),
  status: z.enum(["active", "deactivated"]),
  createdAt: z.string(),
  isAdmin: z.boolean(),
  schoolNames: z.array(z.string()),
  classCount: z.number().int(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export function adminPageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const createSchoolSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "กรอกชื่อโรงเรียน")
    .max(160, "ชื่อยาวได้ไม่เกิน 160 ตัวอักษร"),
});

export const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "ระบุเหตุผล")
    .max(500, "เหตุผลยาวได้ไม่เกิน 500 ตัวอักษร"),
});

export const issueInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("กรอกอีเมลให้ถูกต้อง")),
  expiresInDays: z.coerce.number().int().min(1).max(30),
});

export const issuedInvitationSchema = z.object({
  invitationId: z.uuid(),
  token: z.string().min(20),
  expiresAt: z.string(),
});
export type IssuedInvitation = z.infer<typeof issuedInvitationSchema>;

export const archivedSchoolSchema = z.object({
  id: z.uuid(),
  status: z.literal("archived"),
  changed: z.boolean(),
});

export const revokedInvitationSchema = z.object({
  id: z.uuid(),
  status: z.literal("revoked"),
});

export const userFilterSchema = z.object({
  type: z.enum(["student", "teacher"]).nullable(),
  q: z.string().trim().max(120).nullable(),
});

export const ADMIN_DIRECTORY_ERROR_CODES = [
  "AUTH_REQUIRED",
  "ADMIN_REQUIRED",
  "MFA_REQUIRED",
  "VALIDATION_FAILED",
  "INVALID_CURSOR",
  "SCHOOL_NAME_TAKEN",
  "EMAIL_REQUIRED",
  "EMAIL_NOT_CONFIRMED",
  "ACCOUNT_DISABLED",
  "TEACHER_INVITE_INVALID",
  "TEACHER_INVITE_EXPIRED",
  "FORBIDDEN",
] as const satisfies readonly ApiErrorCode[];

export type AdminDirectoryErrorCode =
  (typeof ADMIN_DIRECTORY_ERROR_CODES)[number];

export const ADMIN_DIRECTORY_ERRORS: Record<
  AdminDirectoryErrorCode,
  { message: string; status: number }
> = {
  AUTH_REQUIRED: { message: "กรุณาเข้าสู่ระบบอีกครั้ง", status: 401 },
  ADMIN_REQUIRED: { message: "ไม่มีสิทธิ์ผู้ดูแลระบบ", status: 403 },
  MFA_REQUIRED: { message: "ต้องยืนยันตัวตนสองขั้นตอน", status: 403 },
  VALIDATION_FAILED: { message: "ข้อมูลไม่ถูกต้อง", status: 400 },
  INVALID_CURSOR: {
    message: "ตำแหน่งหน้าไม่ถูกต้อง เริ่มจากหน้าแรกอีกครั้ง",
    status: 400,
  },
  SCHOOL_NAME_TAKEN: {
    message: "มีโรงเรียนที่ใช้ชื่อนี้อยู่แล้ว",
    status: 409,
  },
  EMAIL_REQUIRED: { message: "กรอกอีเมลครู", status: 400 },
  EMAIL_NOT_CONFIRMED: {
    message: "บัญชีที่ใช้อีเมลนี้ยังไม่ได้ยืนยันอีเมล",
    status: 409,
  },
  ACCOUNT_DISABLED: {
    message: "บัญชีที่ใช้อีเมลนี้ถูกปิดใช้งาน",
    status: 409,
  },
  TEACHER_INVITE_INVALID: {
    message:
      "ส่งคำเชิญไม่ได้ · อีเมลนี้เป็นครูของโรงเรียนนี้แล้ว มีคำเชิญที่รออยู่ หรือโรงเรียนถูกเก็บถาวร",
    status: 409,
  },
  TEACHER_INVITE_EXPIRED: { message: "คำเชิญหมดอายุแล้ว", status: 410 },
  FORBIDDEN: { message: "ไม่พบรายการนี้", status: 404 },
};

export function isAdminDirectoryErrorCode(
  value: unknown,
): value is AdminDirectoryErrorCode {
  return (ADMIN_DIRECTORY_ERROR_CODES as readonly unknown[]).includes(value);
}

export const adminDirectoryKeys = {
  schools: (status: string | null) => ["admin", "schools", status] as const,
  school: (id: string) => ["admin", "school", id] as const,
  invitations: (schoolId: string) =>
    ["admin", "school", schoolId, "invitations"] as const,
  users: (type: string | null, q: string | null) =>
    ["admin", "users", type, q] as const,
};
