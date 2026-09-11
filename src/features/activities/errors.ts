import type { ApiErrorCode } from "@/lib/http/error-code";
import type { ApiError } from "@/lib/http/envelope";

export const ACTIVITY_UI_ERROR_CODES = [
  "AUTH_REQUIRED",
  "EMAIL_NOT_CONFIRMED",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
  "CLASS_NOT_ACTIVE",
  "VALIDATION_FAILED",
  "ACTIVITY_GEOMETRY_INVALID",
  "ACTIVITY_VERSION_CONFLICT",
  "ACTIVITY_NOT_PUBLISHED",
  "SESSION_ALREADY_RUNNING",
  "INVALID_STATUS_TRANSITION",
  "RATE_LIMITED",
] as const satisfies readonly ApiErrorCode[];

export type ActivityUiErrorCode = (typeof ACTIVITY_UI_ERROR_CODES)[number];

/** Committed denial codes returned by activity RPCs. */
export const ACTIVITY_DENIAL_CODES = [
  "VALIDATION_FAILED",
  "ACTIVITY_GEOMETRY_INVALID",
  "ACTIVITY_VERSION_CONFLICT",
  "INVALID_STATUS_TRANSITION",
] as const satisfies readonly ActivityUiErrorCode[];

export type ActivityDenialCode = (typeof ACTIVITY_DENIAL_CODES)[number];

// Titles and primary actions follow UI_CONTRACTS.md §5.
export const ACTIVITY_ERROR_PRESENTATIONS: Record<
  ActivityUiErrorCode,
  { title: string; description: string; action: string }
> = {
  AUTH_REQUIRED: {
    title: "กรุณาเข้าสู่ระบบ",
    description: "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ",
    action: "ไปหน้าเข้าสู่ระบบ",
  },
  EMAIL_NOT_CONFIRMED: {
    title: "กรุณายืนยันอีเมล",
    description: "ต้องยืนยันอีเมลก่อนจัดการกิจกรรม",
    action: "ส่งอีเมลยืนยันอีกครั้ง",
  },
  ACCOUNT_DISABLED: {
    title: "บัญชีนี้ใช้งานไม่ได้",
    description: "บัญชีถูกปิดใช้งานหรือยังไม่พร้อม",
    action: "ติดต่อผู้ดูแลระบบ",
  },
  FORBIDDEN: {
    title: "คุณไม่มีสิทธิ์ใช้กิจกรรมนี้",
    description: "ต้องเป็นครูของชั้นเรียนนี้จึงจะจัดการกิจกรรมได้",
    action: "กลับรายการชั้นเรียน",
  },
  CLASS_NOT_ACTIVE: {
    title: "ชั้นเรียนนี้ปิดใช้งานแล้ว",
    description: "ไม่สามารถแก้ไขกิจกรรมในชั้นเรียนที่เก็บถาวร",
    action: "กลับรายการชั้นเรียน",
  },
  VALIDATION_FAILED: {
    title: "ข้อมูลกิจกรรมยังไม่ถูกต้อง",
    description: "ตรวจช่องที่แจ้งเตือนแล้วบันทึกอีกครั้ง ข้อมูลในฟอร์มยังอยู่",
    action: "แก้ไขข้อมูล",
  },
  ACTIVITY_GEOMETRY_INVALID: {
    title: "ขอบเขต เส้นทาง หรือจุดตรวจไม่ถูกต้อง",
    description: "แก้รูปร่างที่แจ้งเตือนแล้วลองอีกครั้ง ข้อมูลในฟอร์มยังอยู่",
    action: "แก้ไขพื้นที่",
  },
  ACTIVITY_VERSION_CONFLICT: {
    title: "กิจกรรมถูกแก้ไขจากที่อื่นแล้ว",
    description:
      "โหลดฉบับล่าสุดก่อนบันทึก การแก้ไขของคุณยังอยู่ในฟอร์มจนกว่าจะโหลดใหม่",
    action: "โหลดฉบับล่าสุด",
  },
  ACTIVITY_NOT_PUBLISHED: {
    title: "กิจกรรมยังไม่เผยแพร่",
    description: "เผยแพร่กิจกรรมก่อนสร้างรอบสำรวจ",
    action: "ไปเผยแพร่กิจกรรม",
  },
  SESSION_ALREADY_RUNNING: {
    title: "มีรอบสำรวจที่เปิดอยู่แล้ว",
    description: "จบรอบสำรวจเดิมของชั้นเรียนนี้ก่อนเปิดรอบใหม่",
    action: "ดูรอบที่เปิดอยู่",
  },
  INVALID_STATUS_TRANSITION: {
    title: "สถานะเปลี่ยนไปแล้ว",
    description: "ข้อมูลเปลี่ยนไปแล้ว รีเฟรชแล้วลองอีกครั้ง",
    action: "รีเฟรชข้อมูล",
  },
  RATE_LIMITED: {
    title: "ทำรายการบ่อยเกินไป",
    description: "รอตามเวลาที่แสดงแล้วลองอีกครั้ง",
    action: "ลองใหม่",
  },
};

export const PUBLISH_BLOCK_REASONS = {
  boundary_required: "ยังไม่มีขอบเขตสำรวจ",
  route_required: "ยังไม่มีเส้นทาง",
  checkpoint_required: "ต้องมีจุดตรวจอย่างน้อย 1 จุด",
  route_outside_boundary: "เส้นทางต้องผ่านพื้นที่ในขอบเขตสำรวจ",
  checkpoint_outside_boundary: "มีจุดตรวจอยู่นอกขอบเขตสำรวจ",
} as const;

export type PublishBlockReason = keyof typeof PUBLISH_BLOCK_REASONS;

export const ACTIVITY_FIELD_LABELS = {
  title: "ชื่อกิจกรรม",
  boundary: "ขอบเขตสำรวจ",
  route: "เส้นทาง",
  checkpoints: "จุดตรวจ",
  plugin: "การตั้งค่าแบบสำรวจ",
} as const;

export function publishBlockMessage(details: Record<string, unknown>) {
  const reason = details.reason;
  if (reason === "checkpoint_outside_boundary") {
    return `จุดตรวจที่ ${String(details.sequenceNumber)} อยู่นอกขอบเขตสำรวจ`;
  }
  if (typeof reason === "string" && reason in PUBLISH_BLOCK_REASONS) {
    return PUBLISH_BLOCK_REASONS[reason as PublishBlockReason];
  }
  if (
    typeof details.field === "string" &&
    details.field in ACTIVITY_FIELD_LABELS
  ) {
    return `ตรวจ${ACTIVITY_FIELD_LABELS[details.field as keyof typeof ACTIVITY_FIELD_LABELS]}อีกครั้ง`;
  }
  return null;
}

function isCodeIn<TCode extends ActivityUiErrorCode>(
  codes: readonly TCode[],
  value: unknown,
): value is TCode {
  return typeof value === "string" && codes.includes(value as TCode);
}

export function isActivityDenialCode(
  value: unknown,
): value is ActivityDenialCode {
  return isCodeIn(ACTIVITY_DENIAL_CODES, value);
}

export function isActivityUiErrorCode(
  value: unknown,
): value is ActivityUiErrorCode {
  return isCodeIn(ACTIVITY_UI_ERROR_CODES, value);
}

export function mapPostgresActivityError(
  message?: string,
): ActivityUiErrorCode {
  const normalized = message?.toUpperCase();
  return isActivityUiErrorCode(normalized) ? normalized : "FORBIDDEN";
}

export function activityApiError(
  code: ActivityUiErrorCode,
  details: Record<string, unknown> = {},
): ApiError {
  return {
    code,
    message: ACTIVITY_ERROR_PRESENTATIONS[code].title,
    retryable: code === "RATE_LIMITED",
    details,
  };
}

export function httpStatusForActivityError(code: ActivityUiErrorCode) {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "RATE_LIMITED":
      return 429;
    case "VALIDATION_FAILED":
    case "ACTIVITY_GEOMETRY_INVALID":
      return 422;
    case "CLASS_NOT_ACTIVE":
    case "ACTIVITY_VERSION_CONFLICT":
    case "ACTIVITY_NOT_PUBLISHED":
    case "SESSION_ALREADY_RUNNING":
    case "INVALID_STATUS_TRANSITION":
      return 409;
    default:
      return 403;
  }
}
