import type { z } from "zod";

import type { ApiEnvelope, ApiError } from "@/lib/http/envelope";

import {
  ACTIVITY_ERROR_PRESENTATIONS,
  isActivityUiErrorCode,
  type ActivityUiErrorCode,
} from "../errors";

const FORBIDDEN_API_ERROR: ApiError = {
  code: "FORBIDDEN",
  message: ACTIVITY_ERROR_PRESENTATIONS.FORBIDDEN.title,
  retryable: false,
  details: {},
};

export class ActivityApiRequestError extends Error {
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.code);
    this.name = "ActivityApiRequestError";
    this.apiError = apiError;
  }
}

/** A stable activity error code, or NETWORK when the request never completed. */
export type ActivityClientErrorCode = ActivityUiErrorCode | "NETWORK";

export function activityErrorCodeOf(error: unknown): ActivityClientErrorCode {
  if (error instanceof ActivityApiRequestError) {
    return isActivityUiErrorCode(error.apiError.code)
      ? error.apiError.code
      : "FORBIDDEN";
  }
  return "NETWORK";
}

export function activityErrorDetailsOf(error: unknown) {
  return error instanceof ActivityApiRequestError ? error.apiError.details : {};
}

export function presentActivityError(code: ActivityClientErrorCode) {
  if (code === "NETWORK") {
    return {
      title: "เชื่อมต่อไม่สำเร็จ",
      description:
        "ยังไม่มีการบันทึก ข้อมูลในฟอร์มยังอยู่ ตรวจสอบสัญญาณแล้วลองอีกครั้ง",
      action: "ลองใหม่",
    };
  }
  return ACTIVITY_ERROR_PRESENTATIONS[code];
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !body || body.error) {
    throw new ActivityApiRequestError(body?.error ?? FORBIDDEN_API_ERROR);
  }
  return body.data;
}

export async function fetchActivityJson<TSchema extends z.ZodType>(
  url: string,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const data = await readEnvelope<unknown>(
    await fetch(url, { cache: "no-store" }),
  );
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ActivityApiRequestError(FORBIDDEN_API_ERROR);
  return parsed.data;
}

export async function sendActivityJson<T>(
  method: "POST" | "PUT",
  url: string,
  body: unknown,
) {
  return readEnvelope<T>(
    await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
