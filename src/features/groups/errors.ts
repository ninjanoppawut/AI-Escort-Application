import type { ApiErrorCode } from "@/lib/http/error-code";
import type { ApiError } from "@/lib/http/envelope";

export const GROUP_UI_ERROR_CODES = [
  "AUTH_REQUIRED",
  "EMAIL_NOT_CONFIRMED",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
  "CLASS_NOT_ACTIVE",
  "GROUP_FORMATION_CLOSED",
  "STUDENT_GROUP_CREATION_DISABLED",
  "GROUP_LIMIT_REACHED",
  "STUDENT_ALREADY_IN_GROUP",
  "STUDENT_GROUP_ALREADY_CREATED",
  "RATE_LIMITED",
] as const satisfies readonly ApiErrorCode[];

export type GroupUiErrorCode = (typeof GROUP_UI_ERROR_CODES)[number];

/** Denial codes returned as committed results by create_student_group. */
export const GROUP_CREATION_DENIAL_CODES = [
  "GROUP_FORMATION_CLOSED",
  "STUDENT_GROUP_CREATION_DISABLED",
  "GROUP_LIMIT_REACHED",
  "STUDENT_ALREADY_IN_GROUP",
  "STUDENT_GROUP_ALREADY_CREATED",
] as const satisfies readonly GroupUiErrorCode[];

export type GroupCreationDenialCode =
  (typeof GROUP_CREATION_DENIAL_CODES)[number];

// Titles and primary actions follow UI_CONTRACTS.md §5.
export const GROUP_ERROR_PRESENTATIONS: Record<
  GroupUiErrorCode,
  { title: string; description: string; action: string }
> = {
  AUTH_REQUIRED: {
    title: "กรุณาเข้าสู่ระบบ",
    description: "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ",
    action: "ไปหน้าเข้าสู่ระบบ",
  },
  EMAIL_NOT_CONFIRMED: {
    title: "กรุณายืนยันอีเมล",
    description: "ต้องยืนยันอีเมลก่อนจัดกลุ่ม",
    action: "ส่งอีเมลยืนยันอีกครั้ง",
  },
  ACCOUNT_DISABLED: {
    title: "บัญชีนี้ใช้งานไม่ได้",
    description: "บัญชีถูกปิดใช้งานหรือยังไม่พร้อม",
    action: "ติดต่อผู้ดูแลระบบ",
  },
  FORBIDDEN: {
    title: "คุณไม่มีสิทธิ์ทำรายการนี้",
    description: "ต้องเป็นนักเรียนในชั้นเรียนนี้จึงจะจัดกลุ่มได้",
    action: "กลับหน้าก่อนหน้า",
  },
  CLASS_NOT_ACTIVE: {
    title: "ชั้นเรียนนี้ปิดใช้งานแล้ว",
    description: "ไม่สามารถจัดกลุ่มในชั้นเรียนที่เก็บถาวร",
    action: "กลับรายการชั้นเรียน",
  },
  GROUP_FORMATION_CLOSED: {
    title: "ปิดการจัดกลุ่มแล้ว",
    description: "ครูปิดการจัดกลุ่มของชั้นเรียนนี้",
    action: "ดูกลุ่มปัจจุบัน",
  },
  STUDENT_GROUP_CREATION_DISABLED: {
    title: "ครูไม่อนุญาตให้นักเรียนสร้างกลุ่ม",
    description: "เข้าร่วมกลุ่มที่มีอยู่ผ่านคำเชิญจากหัวหน้ากลุ่ม",
    action: "เข้าร่วมกลุ่มที่มีอยู่",
  },
  GROUP_LIMIT_REACHED: {
    title: "กลุ่มครบจำนวนแล้ว",
    description: "ทุกช่องกลุ่มถูกใช้แล้ว เข้าร่วมกลุ่มที่มีอยู่หรือรอคำเชิญ",
    action: "เข้าร่วมหรือรอคำเชิญ",
  },
  STUDENT_ALREADY_IN_GROUP: {
    title: "คุณอยู่ในกลุ่มแล้ว",
    description: "นักเรียนอยู่ได้เพียงหนึ่งกลุ่มต่อชั้นเรียน",
    action: "เปิดกลุ่มของฉัน",
  },
  STUDENT_GROUP_ALREADY_CREATED: {
    title: "คุณใช้สิทธิ์สร้างกลุ่มแล้ว",
    description: "สร้างกลุ่มได้หนึ่งครั้งต่อชั้นเรียน ครูรีเซ็ตสิทธิ์ได้",
    action: "เปิดกลุ่ม / ติดต่อครู",
  },
  RATE_LIMITED: {
    title: "ทำรายการบ่อยเกินไป",
    description: "รอตามเวลาที่แสดงแล้วลองอีกครั้ง",
    action: "ลองใหม่",
  },
};

export function isGroupCreationDenialCode(
  value: unknown,
): value is GroupCreationDenialCode {
  return (
    typeof value === "string" &&
    GROUP_CREATION_DENIAL_CODES.includes(value as GroupCreationDenialCode)
  );
}

export function mapPostgresGroupError(message?: string): GroupUiErrorCode {
  const normalized = message?.toUpperCase();
  if (
    normalized &&
    GROUP_UI_ERROR_CODES.includes(normalized as GroupUiErrorCode)
  ) {
    return normalized as GroupUiErrorCode;
  }
  return "FORBIDDEN";
}

export function groupApiError(
  code: GroupUiErrorCode,
  details: Record<string, unknown> = {},
): ApiError {
  return {
    code,
    message: GROUP_ERROR_PRESENTATIONS[code].title,
    retryable: code === "RATE_LIMITED",
    details,
  };
}

export function httpStatusForGroupError(code: GroupUiErrorCode) {
  if (code === "AUTH_REQUIRED") return 401;
  if (code === "RATE_LIMITED") return 429;
  if (
    code === "CLASS_NOT_ACTIVE" ||
    code === "GROUP_FORMATION_CLOSED" ||
    code === "STUDENT_GROUP_CREATION_DISABLED" ||
    code === "GROUP_LIMIT_REACHED" ||
    code === "STUDENT_ALREADY_IN_GROUP" ||
    code === "STUDENT_GROUP_ALREADY_CREATED"
  )
    return 409;
  return 403;
}
