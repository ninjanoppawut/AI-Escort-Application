"use client";

import { CircleCheck, TriangleAlert, WifiOff } from "lucide-react";

import {
  AUTH_ERROR_PRESENTATIONS,
  AUTH_UI_ERROR_CODES,
  type AuthUiErrorCode,
} from "@/features/auth/errors";
import type { ApiFailure } from "@/lib/http/envelope";

export type AuthFeedbackState =
  | {
      kind: "error";
      code: AuthUiErrorCode;
      requestId?: string | undefined;
      retryAfterSeconds?: number | undefined;
    }
  | { kind: "offline" }
  | { kind: "success"; title: string; description: string }
  | null;

export function authFeedbackFromFailure(
  failure: ApiFailure,
): AuthFeedbackState {
  const code = AUTH_UI_ERROR_CODES.includes(
    failure.error.code as AuthUiErrorCode,
  )
    ? (failure.error.code as AuthUiErrorCode)
    : "INVALID_CREDENTIALS";
  const retryAfter = failure.error.details.retryAfterSeconds;

  return {
    kind: "error",
    code,
    requestId: failure.requestId,
    retryAfterSeconds: typeof retryAfter === "number" ? retryAfter : undefined,
  };
}

export function AuthFeedback({ feedback }: { feedback: AuthFeedbackState }) {
  if (!feedback) return null;

  if (feedback.kind === "offline") {
    return (
      <div
        className="border-warning/40 bg-warning/10 text-foreground mb-5 rounded-2xl border p-4"
        role="alert"
      >
        <div className="flex gap-3">
          <WifiOff
            aria-hidden="true"
            className="text-warning mt-0.5 size-5 shrink-0"
          />
          <div>
            <p className="font-semibold">ยังไม่มีการเชื่อมต่ออินเทอร์เน็ต</p>
            <p className="text-muted-foreground mt-1 text-sm leading-5">
              ข้อมูลในแบบฟอร์มยังอยู่ กรุณาเชื่อมต่อแล้วกดลองอีกครั้ง
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (feedback.kind === "success") {
    return (
      <div
        className="border-success/30 bg-success/10 mb-5 rounded-2xl border p-4"
        role="status"
      >
        <div className="flex gap-3">
          <CircleCheck
            aria-hidden="true"
            className="text-success mt-0.5 size-5 shrink-0"
          />
          <div>
            <p className="font-semibold">{feedback.title}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-5">
              {feedback.description}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const presentation = AUTH_ERROR_PRESENTATIONS[feedback.code];
  return (
    <div
      className="border-destructive/30 bg-destructive/8 mb-5 rounded-2xl border p-4"
      role="alert"
    >
      <div className="flex gap-3">
        <TriangleAlert
          aria-hidden="true"
          className="text-destructive mt-0.5 size-5 shrink-0"
        />
        <div className="min-w-0">
          <p className="font-semibold">{presentation.title}</p>
          <p className="text-muted-foreground mt-1 text-sm leading-5">
            {presentation.description}
          </p>
          {feedback.retryAfterSeconds ? (
            <p className="mt-2 text-sm font-semibold">
              ลองใหม่ได้ใน {feedback.retryAfterSeconds} วินาที
            </p>
          ) : null}
          {feedback.requestId ? (
            <details className="text-muted-foreground mt-3 text-xs">
              <summary className="cursor-pointer">
                ข้อมูลสำหรับฝ่ายสนับสนุน
              </summary>
              <p className="mt-1 font-mono break-all">
                Request ID: {feedback.requestId}
              </p>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
