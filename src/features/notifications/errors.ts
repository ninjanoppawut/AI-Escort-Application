import type { ApiErrorCode } from "@/lib/http/error-code";
import type { ApiError } from "@/lib/http/envelope";

export const NOTIFICATION_UI_ERROR_CODES = [
  "AUTH_REQUIRED",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
  "INVALID_CURSOR",
] as const satisfies readonly ApiErrorCode[];

export type NotificationUiErrorCode =
  (typeof NOTIFICATION_UI_ERROR_CODES)[number];

export function mapPostgresNotificationError(
  message?: string,
): NotificationUiErrorCode {
  const normalized = message?.toUpperCase();
  if (
    normalized &&
    NOTIFICATION_UI_ERROR_CODES.includes(normalized as NotificationUiErrorCode)
  ) {
    return normalized as NotificationUiErrorCode;
  }
  return "FORBIDDEN";
}

export function notificationApiError(code: NotificationUiErrorCode): ApiError {
  return {
    code,
    message:
      code === "INVALID_CURSOR"
        ? "Invalid notification cursor"
        : "Notification action is not available",
    retryable: false,
    details: {},
  };
}

export function httpStatusForNotificationError(code: NotificationUiErrorCode) {
  if (code === "AUTH_REQUIRED") return 401;
  if (code === "INVALID_CURSOR") return 422;
  return 403;
}
