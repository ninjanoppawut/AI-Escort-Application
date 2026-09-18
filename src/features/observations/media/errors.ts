import type { ApiErrorCode } from "@/lib/http/error-code";
import type { ApiError } from "@/lib/http/envelope";

import {
  OBSERVATION_ERROR_PRESENTATIONS,
  type ObservationUiErrorCode,
} from "../errors";

export const MEDIA_UI_ERROR_CODES = [
  "AUTH_REQUIRED",
  "EMAIL_NOT_CONFIRMED",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
  "VALIDATION_FAILED",
  "IDEMPOTENCY_KEY_REUSE",
  "INVALID_STATUS_TRANSITION",
  "IMAGE_LIMIT_EXCEEDED",
  "IMAGE_TOO_LARGE",
  "INVALID_IMAGE_TYPE",
  "IMAGE_UPLOAD_INCOMPLETE",
] as const satisfies readonly ApiErrorCode[];

export type MediaUiErrorCode = (typeof MEDIA_UI_ERROR_CODES)[number];

export const MEDIA_DENIAL_CODES = [
  "VALIDATION_FAILED",
  "IDEMPOTENCY_KEY_REUSE",
  "INVALID_STATUS_TRANSITION",
  "IMAGE_LIMIT_EXCEEDED",
  "IMAGE_TOO_LARGE",
  "INVALID_IMAGE_TYPE",
  "IMAGE_UPLOAD_INCOMPLETE",
] as const satisfies readonly MediaUiErrorCode[];

type Presentation = { title: string; description: string; action: string };

// Titles and primary actions follow UI_CONTRACTS.md §5.
const IMAGE_PRESENTATIONS: Record<
  Exclude<MediaUiErrorCode, ObservationUiErrorCode>,
  Presentation
> = {
  IMAGE_LIMIT_EXCEEDED: {
    title: "เพิ่มรูปได้สูงสุด 10 รูป",
    description: "ลบรูปที่ไม่ต้องการก่อน แล้วจึงเพิ่มรูปใหม่",
    action: "ลบรูปก่อนเพิ่ม",
  },
  IMAGE_TOO_LARGE: {
    title: "รูปยังมีขนาดใหญ่เกินไป",
    description: "ย่อรูปไม่ได้ถึงขนาดที่รับได้ ลองประมวลผลใหม่หรือเลือกรูปอื่น",
    action: "ประมวลผล/เลือกรูปใหม่",
  },
  INVALID_IMAGE_TYPE: {
    title: "ไม่รองรับไฟล์รูปนี้",
    description: "ใช้รูป JPEG, PNG หรือ WebP",
    action: "เลือกรูปใหม่",
  },
  IMAGE_UPLOAD_INCOMPLETE: {
    title: "ภาพยังส่งไม่ครบ",
    description: "ระบบยังไม่ได้รับไฟล์ภาพครบถ้วน ภาพในเครื่องยังอยู่",
    action: "ส่งภาพนี้อีกครั้ง",
  },
};

export function mediaErrorPresentation(code: MediaUiErrorCode): Presentation {
  return code in IMAGE_PRESENTATIONS
    ? IMAGE_PRESENTATIONS[code as keyof typeof IMAGE_PRESENTATIONS]
    : OBSERVATION_ERROR_PRESENTATIONS[code as ObservationUiErrorCode];
}

export function isMediaUiErrorCode(value: unknown): value is MediaUiErrorCode {
  return MEDIA_UI_ERROR_CODES.includes(value as MediaUiErrorCode);
}

export function isMediaDenialCode(
  value: unknown,
): value is (typeof MEDIA_DENIAL_CODES)[number] {
  return MEDIA_DENIAL_CODES.includes(
    value as (typeof MEDIA_DENIAL_CODES)[number],
  );
}

export function httpStatusForMediaError(code: MediaUiErrorCode) {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "VALIDATION_FAILED":
    case "IMAGE_TOO_LARGE":
    case "INVALID_IMAGE_TYPE":
      return 422;
    case "IDEMPOTENCY_KEY_REUSE":
    case "INVALID_STATUS_TRANSITION":
    case "IMAGE_LIMIT_EXCEEDED":
    case "IMAGE_UPLOAD_INCOMPLETE":
      return 409;
    default:
      return 403;
  }
}

export function mapPostgresMediaError(message?: string): MediaUiErrorCode {
  const normalized = message?.toUpperCase();
  return isMediaUiErrorCode(normalized) ? normalized : "FORBIDDEN";
}

export function mediaApiError(
  code: MediaUiErrorCode,
  details: Record<string, unknown> = {},
): ApiError {
  return {
    code,
    message: mediaErrorPresentation(code).title,
    retryable: code === "IMAGE_UPLOAD_INCOMPLETE",
    details,
  };
}
