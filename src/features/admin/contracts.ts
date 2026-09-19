import { z } from "zod";

// P15 admin console views. Each one is opened through `open_admin_console`,
// which checks the active grant and aal2 and audits the view (ADM-001,
// ADM-009). A section appears in the navigation once it is built.
export const ADMIN_VIEWS = [
  "home",
  "health",
  "users",
  "schools",
  "errors",
  "audit",
  "incidents",
] as const;

export type AdminView = (typeof ADMIN_VIEWS)[number];

export interface AdminSection {
  view: Exclude<AdminView, "home">;
  href: string;
  title: string;
  description: string;
}

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    view: "schools",
    href: "/admin/schools",
    title: "โรงเรียน",
    description: "เพิ่มหรือเก็บโรงเรียนถาวร และเชิญครูด้วยอีเมลที่ยืนยันแล้ว",
  },
  {
    view: "users",
    href: "/admin/users",
    title: "ครูและนักเรียน",
    description:
      "รายชื่อบัญชี โรงเรียน และจำนวนห้องเรียน (อีเมลนักเรียนถูกปิดบางส่วน)",
  },
];

export const ADMIN_ERROR_CODES = [
  "ADMIN_REQUIRED",
  "MFA_REQUIRED",
  "VALIDATION_FAILED",
] as const;

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export const openAdminConsoleRowSchema = z.object({
  outcome: z.enum(["ok", "denied"]),
  error_code: z.string().nullable(),
  admin_user_id: z.uuid().nullable(),
});

export const ADMIN_ERROR_PRESENTATIONS: Record<
  AdminErrorCode,
  { title: string; description: string; action: string }
> = {
  ADMIN_REQUIRED: {
    title: "ไม่มีสิทธิ์ผู้ดูแลระบบ",
    description:
      "บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบที่ใช้งานอยู่ หากเคยมีสิทธิ์ อาจถูกยกเลิกแล้ว",
    action: "กลับหน้าหลัก",
  },
  MFA_REQUIRED: {
    title: "ต้องยืนยันตัวตนสองขั้นตอน",
    description:
      "ส่วนผู้ดูแลระบบต้องยืนยันด้วยรหัสจากแอปยืนยันตัวตนทุกครั้งที่เข้าสู่ระบบ",
    action: "ตั้งค่า/ยืนยัน MFA",
  },
  VALIDATION_FAILED: {
    title: "ไม่พบหน้านี้",
    description: "ลิงก์ไม่ถูกต้อง",
    action: "กลับหน้าผู้ดูแลระบบ",
  },
};

export function isAdminErrorCode(value: unknown): value is AdminErrorCode {
  return (ADMIN_ERROR_CODES as readonly unknown[]).includes(value);
}

const ADMIN_PATH =
  /^\/admin(\/(health|users|schools|errors|audit|incidents)(\/[0-9a-f-]{36})?)?$/i;

/** Where the MFA step returns to: an admin console path, never elsewhere. */
export function safeAdminReturnPath(value: string | null | undefined) {
  return value && ADMIN_PATH.test(value) ? value : "/admin";
}

export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "กรอกรหัส 6 หลักจากแอปยืนยันตัวตน"),
});
