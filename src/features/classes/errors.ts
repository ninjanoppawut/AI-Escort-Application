import type { ApiErrorCode } from "@/lib/http/error-code";
import type { ApiError } from "@/lib/http/envelope";

export const CLASS_UI_ERROR_CODES = [
  "AUTH_REQUIRED",
  "EMAIL_NOT_CONFIRMED",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
  "CLASS_NOT_ACTIVE",
  "INVITE_INVALID",
  "INVITE_EXPIRED",
  "INVITE_DISABLED",
  "INVALID_CURSOR",
  "RATE_LIMITED",
] as const satisfies readonly ApiErrorCode[];

export type ClassUiErrorCode = (typeof CLASS_UI_ERROR_CODES)[number];

export const CLASS_ERROR_PRESENTATIONS: Record<
  ClassUiErrorCode,
  { title: string; description: string; action: string }
> = {
  AUTH_REQUIRED: {
    title: "กรุณาเข้าสู่ระบบ",
    description: "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ",
    action: "เข้าสู่ระบบอีกครั้ง",
  },
  EMAIL_NOT_CONFIRMED: {
    title: "กรุณายืนยันอีเมล",
    description: "ต้องยืนยันอีเมลก่อนจัดการชั้นเรียน",
    action: "ส่งอีเมลยืนยันอีกครั้ง",
  },
  ACCOUNT_DISABLED: {
    title: "บัญชีนี้ใช้งานไม่ได้",
    description: "บัญชีถูกปิดใช้งานหรือยังไม่พร้อม",
    action: "ติดต่อผู้ดูแลระบบ",
  },
  FORBIDDEN: {
    title: "คุณไม่มีสิทธิ์ทำรายการนี้",
    description: "ต้องเป็นครูที่ได้รับสิทธิ์ในโรงเรียนหรือชั้นเรียนนี้",
    action: "กลับหน้าก่อนหน้า",
  },
  CLASS_NOT_ACTIVE: {
    title: "ชั้นเรียนนี้ปิดใช้งานแล้ว",
    description: "ไม่สามารถแก้ไขการตั้งค่าหรือคำเชิญของชั้นเรียนที่เก็บถาวร",
    action: "กลับรายการชั้นเรียน",
  },
  INVITE_INVALID: {
    title: "คำเชิญไม่ถูกต้อง",
    description: "ตรวจสอบวันหมดอายุ จำนวนครั้ง หรือรีเฟรชข้อมูลคำเชิญ",
    action: "รีเฟรชข้อมูล",
  },
  INVITE_EXPIRED: {
    title: "คำเชิญหมดอายุ",
    description: "คำเชิญนี้เลยกำหนดเวลาแล้ว ขอรหัสหรือลิงก์ใหม่จากครู",
    action: "กรอกรหัสใหม่",
  },
  INVITE_DISABLED: {
    title: "คำเชิญถูกปิดแล้ว",
    description: "คำเชิญเดิมถูกปิดไปแล้ว ใช้คำเชิญที่ใช้งานอยู่แทน",
    action: "รีเฟรชข้อมูล",
  },
  INVALID_CURSOR: {
    title: "หน้าข้อมูลสมาชิกไม่ถูกต้อง",
    description: "รายการสมาชิกมีการเปลี่ยนแปลง โหลดรายการใหม่จากหน้าแรก",
    action: "โหลดใหม่",
  },
  RATE_LIMITED: {
    title: "ทำรายการบ่อยเกินไป",
    description: "รอตามเวลาที่แสดงแล้วลองอีกครั้ง",
    action: "ลองใหม่",
  },
};

export function mapPostgresClassError(message?: string): ClassUiErrorCode {
  const normalized = message?.toUpperCase();
  if (
    normalized &&
    CLASS_UI_ERROR_CODES.includes(normalized as ClassUiErrorCode)
  ) {
    return normalized as ClassUiErrorCode;
  }
  return "FORBIDDEN";
}

export function classApiError(code: ClassUiErrorCode): ApiError {
  return {
    code,
    message: CLASS_ERROR_PRESENTATIONS[code].title,
    retryable: code === "RATE_LIMITED",
    details: {},
  };
}

export function httpStatusForClassError(code: ClassUiErrorCode) {
  if (code === "AUTH_REQUIRED") return 401;
  if (code === "INVITE_INVALID") return 422;
  if (code === "INVALID_CURSOR") return 422;
  if (
    code === "INVITE_DISABLED" ||
    code === "INVITE_EXPIRED" ||
    code === "CLASS_NOT_ACTIVE"
  )
    return 409;
  if (code === "RATE_LIMITED") return 429;
  return 403;
}
