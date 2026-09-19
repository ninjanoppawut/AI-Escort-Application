import type { ApiErrorCode } from "@/lib/http/error-code";
import type { ApiError } from "@/lib/http/envelope";

export const OBSERVATION_UI_ERROR_CODES = [
  "AUTH_REQUIRED",
  "EMAIL_NOT_CONFIRMED",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
  "CLASS_NOT_ACTIVE",
  "VALIDATION_FAILED",
  "SESSION_NOT_OPEN",
  "SESSION_PAUSED",
  "GROUP_NOT_ACTIVE",
  "OBSERVATION_VERSION_CONFLICT",
  "IDEMPOTENCY_KEY_REUSE",
  "INVALID_STATUS_TRANSITION",
  "LOCATION_UNAVAILABLE",
] as const satisfies readonly ApiErrorCode[];

export type ObservationUiErrorCode =
  (typeof OBSERVATION_UI_ERROR_CODES)[number];

/** Committed denial codes returned as rows by the observation RPCs. */
export const OBSERVATION_DENIAL_CODES = [
  "CLASS_NOT_ACTIVE",
  "VALIDATION_FAILED",
  "SESSION_NOT_OPEN",
  "SESSION_PAUSED",
  "GROUP_NOT_ACTIVE",
  "OBSERVATION_VERSION_CONFLICT",
  "IDEMPOTENCY_KEY_REUSE",
  "INVALID_STATUS_TRANSITION",
] as const satisfies readonly ObservationUiErrorCode[];

export type ObservationDenialCode = (typeof OBSERVATION_DENIAL_CODES)[number];

// Titles and primary actions follow UI_CONTRACTS.md §5.
export const OBSERVATION_ERROR_PRESENTATIONS: Record<
  ObservationUiErrorCode,
  { title: string; description: string; action: string }
> = {
  AUTH_REQUIRED: {
    title: "กรุณาเข้าสู่ระบบ",
    description: "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ",
    action: "ไปหน้าเข้าสู่ระบบ",
  },
  EMAIL_NOT_CONFIRMED: {
    title: "กรุณายืนยันอีเมล",
    description: "ต้องยืนยันอีเมลก่อนบันทึกการสำรวจ",
    action: "ส่งอีเมลยืนยันอีกครั้ง",
  },
  ACCOUNT_DISABLED: {
    title: "บัญชีนี้ใช้งานไม่ได้",
    description: "บัญชีถูกปิดใช้งานหรือยังไม่พร้อม",
    action: "ติดต่อผู้ดูแลระบบ",
  },
  FORBIDDEN: {
    title: "คุณไม่มีสิทธิ์ทำรายการนี้",
    description:
      "รายการนี้เป็นของนักเรียนคนอื่น หรือคุณไม่ได้อยู่ในรอบสำรวจนี้",
    action: "กลับหน้าก่อนหน้า",
  },
  CLASS_NOT_ACTIVE: {
    title: "ชั้นเรียนนี้ปิดใช้งานแล้ว",
    description: "เริ่มบันทึกใหม่ในชั้นเรียนที่เก็บถาวรไม่ได้",
    action: "กลับรายการชั้นเรียน",
  },
  VALIDATION_FAILED: {
    title: "ข้อมูลยังไม่ถูกต้อง",
    description: "ตรวจช่องที่แจ้งเตือนแล้วลองอีกครั้ง ข้อมูลในฟอร์มยังอยู่",
    action: "แก้ไขข้อมูล",
  },
  SESSION_NOT_OPEN: {
    title: "กิจกรรมยังไม่เปิด",
    description: "รอบสำรวจยังไม่เปิดหรือจบไปแล้ว",
    action: "กลับหน้ารอ",
  },
  SESSION_PAUSED: {
    title: "กิจกรรมหยุดชั่วคราว",
    description:
      "ร่างที่บันทึกไว้ยังแก้ไขได้ แต่เริ่มบันทึกใหม่ไม่ได้จนกว่าครูจะเปิดต่อ",
    action: "บันทึกร่างและรอครู",
  },
  GROUP_NOT_ACTIVE: {
    title: "ยังไม่ถึงรอบกลุ่มของคุณ",
    description: "เริ่มบันทึกได้เมื่อครูเริ่มรอบสำรวจของกลุ่มคุณ",
    action: "กลับหน้ารอ",
  },
  OBSERVATION_VERSION_CONFLICT: {
    title: "ข้อมูลมีการเปลี่ยนแปลงแล้ว",
    description:
      "ร่างนี้ถูกบันทึกจากอีกหน้าจอหนึ่ง ดูข้อมูลล่าสุดก่อนบันทึกซ้ำ ข้อความของคุณยังอยู่",
    action: "ดูข้อมูลล่าสุดและทำซ้ำ",
  },
  IDEMPOTENCY_KEY_REUSE: {
    title: "คำขอนี้ไม่ตรงกับรายการเดิม",
    description: "เริ่มจับตำแหน่งใหม่เพื่อสร้างรายการใหม่",
    action: "เริ่มรายการใหม่",
  },
  INVALID_STATUS_TRANSITION: {
    title: "สถานะเปลี่ยนไปแล้ว",
    description: "ข้อมูลเปลี่ยนไปแล้ว รีเฟรชแล้วลองอีกครั้ง",
    action: "รีเฟรชข้อมูล",
  },
  LOCATION_UNAVAILABLE: {
    title: "ยังหาตำแหน่งไม่ได้",
    description: "รอสัญญาณสักครู่ ลองใหม่ หรือบันทึกแบบมีธงว่าไม่มีพิกัด",
    action: "รอ/ลองใหม่/บันทึกแบบมีธง",
  },
};

export const OBSERVATION_BLOCKED_REASON_LABELS: Record<string, string> = {
  group_waiting: "กลุ่มของคุณยังไม่ถึงรอบสำรวจ",
  group_completed: "กลุ่มของคุณสำรวจเสร็จแล้ว",
  session_completed: "รอบสำรวจจบแล้ว",
  session_scheduled: "รอบสำรวจยังไม่เปิด",
  not_draft: "รายการนี้ไม่ใช่ฉบับร่างแล้ว",
  submitted: "ส่งให้ครูแล้ว · แก้ไม่ได้จนกว่าครูจะขอให้แก้ไข",
};

export function isObservationUiErrorCode(
  value: unknown,
): value is ObservationUiErrorCode {
  return OBSERVATION_UI_ERROR_CODES.includes(value as ObservationUiErrorCode);
}

export function isObservationDenialCode(
  value: unknown,
): value is ObservationDenialCode {
  return OBSERVATION_DENIAL_CODES.includes(value as ObservationDenialCode);
}

export function httpStatusForObservationError(code: ObservationUiErrorCode) {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "VALIDATION_FAILED":
      return 422;
    case "CLASS_NOT_ACTIVE":
    case "SESSION_NOT_OPEN":
    case "SESSION_PAUSED":
    case "GROUP_NOT_ACTIVE":
    case "OBSERVATION_VERSION_CONFLICT":
    case "IDEMPOTENCY_KEY_REUSE":
    case "INVALID_STATUS_TRANSITION":
      return 409;
    default:
      return 403;
  }
}

export function mapPostgresObservationError(
  message?: string,
): ObservationUiErrorCode {
  const normalized = message?.toUpperCase();
  return isObservationUiErrorCode(normalized) ? normalized : "FORBIDDEN";
}

export function observationApiError(
  code: ObservationUiErrorCode,
  details: Record<string, unknown> = {},
): ApiError {
  const presentation = OBSERVATION_ERROR_PRESENTATIONS[code];
  return {
    code,
    message: presentation.title,
    retryable:
      code === "OBSERVATION_VERSION_CONFLICT" ||
      code === "INVALID_STATUS_TRANSITION",
    details,
  };
}
