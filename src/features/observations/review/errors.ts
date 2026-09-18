import type { ApiErrorCode } from "@/lib/http/error-code";
import type { ApiError } from "@/lib/http/envelope";

import {
  OBSERVATION_ERROR_PRESENTATIONS,
  type ObservationUiErrorCode,
} from "../errors";

export const REVIEW_UI_ERROR_CODES = [
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
  "STUDENT_REVIEW_REQUIRED",
  "PLANT_NAME_REQUIRED",
  "SCIENTIFIC_NAME_REQUIRED",
  "SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED",
  "IMAGE_UPLOAD_INCOMPLETE",
] as const satisfies readonly ApiErrorCode[];

export type ReviewUiErrorCode = (typeof REVIEW_UI_ERROR_CODES)[number];

export const REVIEW_DENIAL_CODES = REVIEW_UI_ERROR_CODES.filter(
  (code) =>
    ![
      "AUTH_REQUIRED",
      "EMAIL_NOT_CONFIRMED",
      "ACCOUNT_DISABLED",
      "FORBIDDEN",
    ].includes(code),
) as readonly ReviewUiErrorCode[];

type Presentation = { title: string; description: string; action: string };

// Titles and primary actions follow UI_CONTRACTS.md §5.
const REVIEW_PRESENTATIONS: Record<
  Exclude<ReviewUiErrorCode, ObservationUiErrorCode>,
  Presentation
> = {
  STUDENT_REVIEW_REQUIRED: {
    title: "กรุณาตรวจผลกับต้นจริง",
    description: "บันทึกข้อมูลพืชที่ตรวจกับต้นจริงก่อนส่งให้ครู",
    action: "กลับไปตรวจลักษณะ",
  },
  PLANT_NAME_REQUIRED: {
    title: "ต้องกรอกชื่อไทยหรือชื่อทั่วไป",
    description: "ใส่ชื่อที่ใช้เรียกพืชนี้ “ไม่ทราบ” ยังส่งไม่ได้",
    action: "กรอกชื่อพืช",
  },
  SCIENTIFIC_NAME_REQUIRED: {
    title: "ต้องกรอกชื่อวิทยาศาสตร์",
    description:
      "ใส่ชื่อวิทยาศาสตร์ เช่น Mangifera indica ใช้ Google Lens ช่วยค้นได้",
    action: "กรอกชื่อวิทยาศาสตร์",
  },
  SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED: {
    title: "กรุณารับทราบว่าพบชนิดเดียวกัน",
    description: "มีการบันทึกพืชชนิดนี้ในรอบนี้แล้ว รับทราบเพื่อส่งต่อได้",
    action: "เปิดคำเตือนและรับทราบ",
  },
  IMAGE_UPLOAD_INCOMPLETE: {
    title: "ภาพยังส่งไม่ครบ",
    description: "รอภาพที่กำลังส่งให้เสร็จก่อนส่งให้ครู",
    action: "ส่งภาพนี้อีกครั้ง",
  },
};

export function reviewErrorPresentation(code: ReviewUiErrorCode): Presentation {
  return code in REVIEW_PRESENTATIONS
    ? REVIEW_PRESENTATIONS[code as keyof typeof REVIEW_PRESENTATIONS]
    : OBSERVATION_ERROR_PRESENTATIONS[code as ObservationUiErrorCode];
}

export function isReviewUiErrorCode(
  value: unknown,
): value is ReviewUiErrorCode {
  return REVIEW_UI_ERROR_CODES.includes(value as ReviewUiErrorCode);
}

export function httpStatusForReviewError(code: ReviewUiErrorCode) {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "VALIDATION_FAILED":
    case "STUDENT_REVIEW_REQUIRED":
    case "PLANT_NAME_REQUIRED":
    case "SCIENTIFIC_NAME_REQUIRED":
      return 422;
    case "CLASS_NOT_ACTIVE":
    case "SESSION_NOT_OPEN":
    case "SESSION_PAUSED":
    case "GROUP_NOT_ACTIVE":
    case "OBSERVATION_VERSION_CONFLICT":
    case "IDEMPOTENCY_KEY_REUSE":
    case "INVALID_STATUS_TRANSITION":
    case "SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED":
    case "IMAGE_UPLOAD_INCOMPLETE":
      return 409;
    default:
      return 403;
  }
}

export function mapPostgresReviewError(message?: string): ReviewUiErrorCode {
  const normalized = message?.toUpperCase();
  return isReviewUiErrorCode(normalized) ? normalized : "FORBIDDEN";
}

export function reviewApiError(
  code: ReviewUiErrorCode,
  details: Record<string, unknown> = {},
): ApiError {
  return {
    code,
    message: reviewErrorPresentation(code).title,
    retryable:
      code === "OBSERVATION_VERSION_CONFLICT" ||
      code === "IMAGE_UPLOAD_INCOMPLETE",
    details,
  };
}
