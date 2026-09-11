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
  "GROUP_FULL",
  "GROUP_LOCKED",
  "NOT_GROUP_LEADER",
  "LEADER_SUCCESSOR_REQUIRED",
  "INVITATION_NOT_PENDING",
  "INVITATION_EXPIRED",
  "DESTINATION_GROUP_INVALID",
  "INVALID_STATUS_TRANSITION",
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

/** Denial codes returned as committed results by invitation operations. */
export const GROUP_INVITATION_DENIAL_CODES = [
  "GROUP_FORMATION_CLOSED",
  "STUDENT_ALREADY_IN_GROUP",
  "GROUP_FULL",
  "GROUP_LOCKED",
  "INVITATION_NOT_PENDING",
  "INVITATION_EXPIRED",
  "DESTINATION_GROUP_INVALID",
] as const satisfies readonly GroupUiErrorCode[];

export type GroupInvitationDenialCode =
  (typeof GROUP_INVITATION_DENIAL_CODES)[number];

/** Denial codes returned by readiness, leadership transfer, and removal. */
export const GROUP_LEADERSHIP_DENIAL_CODES = [
  "GROUP_FORMATION_CLOSED",
  "GROUP_LOCKED",
  "INVALID_STATUS_TRANSITION",
  "LEADER_SUCCESSOR_REQUIRED",
] as const satisfies readonly GroupUiErrorCode[];

export type GroupLeadershipDenialCode =
  (typeof GROUP_LEADERSHIP_DENIAL_CODES)[number];

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
  GROUP_FULL: {
    title: "กลุ่มนี้เต็มแล้ว",
    description: "ที่นั่งในกลุ่มถูกใช้หรือถูกเชิญไว้ครบแล้ว",
    action: "เลือกกลุ่มอื่น",
  },
  GROUP_LOCKED: {
    title: "กลุ่มถูกล็อกแล้ว",
    description: "ครูล็อกกลุ่มนี้ จึงเปลี่ยนสมาชิกไม่ได้",
    action: "กลับหน้ากลุ่ม",
  },
  NOT_GROUP_LEADER: {
    title: "เฉพาะหัวหน้ากลุ่มทำรายการนี้ได้",
    description: "หัวหน้ากลุ่มอาจเปลี่ยนไปแล้ว รีเฟรชข้อมูลกลุ่ม",
    action: "กลับหน้ากลุ่ม",
  },
  LEADER_SUCCESSOR_REQUIRED: {
    title: "ต้องเลือกหัวหน้าคนใหม่ก่อน",
    description: "โอนหัวหน้ากลุ่มให้สมาชิกคนอื่นก่อนนำหัวหน้าออกจากกลุ่ม",
    action: "เลือกผู้สืบทอด",
  },
  INVITATION_NOT_PENDING: {
    title: "คำเชิญนี้ดำเนินการแล้ว",
    description: "คำเชิญถูกตอบรับ ปฏิเสธ หรือยกเลิกไปแล้ว",
    action: "รีเฟรชข้อมูล",
  },
  INVITATION_EXPIRED: {
    title: "คำเชิญเข้ากลุ่มหมดอายุ",
    description: "คำเชิญมีอายุ 24 ชั่วโมง ขอให้หัวหน้ากลุ่มเชิญใหม่",
    action: "กลับหน้ากลุ่ม",
  },
  DESTINATION_GROUP_INVALID: {
    title: "ย้ายไปกลุ่มนี้ไม่ได้",
    description: "กลุ่มนี้ถูกลบหรือเก็บถาวรแล้ว",
    action: "เลือกกลุ่มใหม่",
  },
  INVALID_STATUS_TRANSITION: {
    title: "สถานะเปลี่ยนไปแล้ว",
    description:
      "ข้อมูลกลุ่มเปลี่ยนไปแล้วหรือยังไม่ครบเงื่อนไข รีเฟรชแล้วลองอีกครั้ง",
    action: "รีเฟรชข้อมูล",
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

export function isGroupInvitationDenialCode(
  value: unknown,
): value is GroupInvitationDenialCode {
  return (
    typeof value === "string" &&
    GROUP_INVITATION_DENIAL_CODES.includes(value as GroupInvitationDenialCode)
  );
}

export function isGroupLeadershipDenialCode(
  value: unknown,
): value is GroupLeadershipDenialCode {
  return (
    typeof value === "string" &&
    GROUP_LEADERSHIP_DENIAL_CODES.includes(value as GroupLeadershipDenialCode)
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

const CONFLICT_CODES = new Set<GroupUiErrorCode>([
  "CLASS_NOT_ACTIVE",
  "GROUP_FORMATION_CLOSED",
  "STUDENT_GROUP_CREATION_DISABLED",
  "GROUP_LIMIT_REACHED",
  "STUDENT_ALREADY_IN_GROUP",
  "STUDENT_GROUP_ALREADY_CREATED",
  "GROUP_FULL",
  "GROUP_LOCKED",
  "LEADER_SUCCESSOR_REQUIRED",
  "INVITATION_NOT_PENDING",
  "INVITATION_EXPIRED",
  "DESTINATION_GROUP_INVALID",
  "INVALID_STATUS_TRANSITION",
]);

export function httpStatusForGroupError(code: GroupUiErrorCode) {
  if (code === "AUTH_REQUIRED") return 401;
  if (code === "RATE_LIMITED") return 429;
  if (CONFLICT_CODES.has(code)) return 409;
  return 403;
}
