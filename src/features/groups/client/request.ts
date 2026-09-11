import type { z } from "zod";

import type { ApiEnvelope, ApiError } from "@/lib/http/envelope";

import {
  GROUP_ERROR_PRESENTATIONS,
  GROUP_UI_ERROR_CODES,
  type GroupUiErrorCode,
} from "../errors";

export const FORBIDDEN_API_ERROR: ApiError = {
  code: "FORBIDDEN",
  message: GROUP_ERROR_PRESENTATIONS.FORBIDDEN.title,
  retryable: false,
  details: {},
};

export class GroupApiRequestError extends Error {
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.code);
    this.name = "GroupApiRequestError";
    this.apiError = apiError;
  }
}

/** A stable group error code, or NETWORK when the request never completed. */
export type GroupClientErrorCode = GroupUiErrorCode | "NETWORK";

export function groupErrorCodeOf(error: unknown): GroupClientErrorCode {
  if (error instanceof GroupApiRequestError) {
    const code = error.apiError.code as GroupUiErrorCode;
    return GROUP_UI_ERROR_CODES.includes(code) ? code : "FORBIDDEN";
  }
  return "NETWORK";
}

export function presentGroupError(code: GroupClientErrorCode) {
  if (code === "NETWORK") {
    return {
      title: "เชื่อมต่อไม่สำเร็จ",
      description:
        "ยังไม่มีการเปลี่ยนแปลง ตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองอีกครั้ง",
      action: "ลองใหม่",
    };
  }
  return GROUP_ERROR_PRESENTATIONS[code];
}

export async function readGroupEnvelope<T>(response: Response): Promise<T> {
  const body = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !body || body.error) {
    throw new GroupApiRequestError(body?.error ?? FORBIDDEN_API_ERROR);
  }
  return body.data;
}

export async function fetchGroupJson<TSchema extends z.ZodType>(
  url: string,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const data = await readGroupEnvelope<unknown>(
    await fetch(url, { cache: "no-store" }),
  );
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new GroupApiRequestError(FORBIDDEN_API_ERROR);
  return parsed.data;
}

export async function postGroupJson<T>(url: string, body?: unknown) {
  return readGroupEnvelope<T>(
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }),
  );
}
