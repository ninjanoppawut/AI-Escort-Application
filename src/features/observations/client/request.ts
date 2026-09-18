import type { z } from "zod";

import type { ApiEnvelope, ApiError } from "@/lib/http/envelope";

import { observationDraftSchema, type ObservationDraft } from "../contracts";
import {
  OBSERVATION_ERROR_PRESENTATIONS,
  isObservationUiErrorCode,
  type ObservationUiErrorCode,
} from "../errors";

const FORBIDDEN_API_ERROR: ApiError = {
  code: "FORBIDDEN",
  message: OBSERVATION_ERROR_PRESENTATIONS.FORBIDDEN.title,
  retryable: false,
  details: {},
};

/** A refused observation request, carrying the stable code and its details. */
export class ObservationApiRequestError extends Error {
  readonly apiError: ApiError;
  readonly status: number;

  constructor(apiError: ApiError, status: number) {
    super(apiError.code);
    this.name = "ObservationApiRequestError";
    this.apiError = apiError;
    this.status = status;
  }

  get code() {
    return this.apiError.code;
  }

  get details() {
    return this.apiError.details;
  }
}

/** A stable observation error code, or NETWORK when the request never completed. */
export type ObservationClientErrorCode = ObservationUiErrorCode | "NETWORK";

export function observationErrorCodeOf(
  error: unknown,
): ObservationClientErrorCode {
  if (error instanceof ObservationApiRequestError) {
    return isObservationUiErrorCode(error.apiError.code)
      ? error.apiError.code
      : "FORBIDDEN";
  }
  return "NETWORK";
}

export function observationErrorDetailsOf(
  error: unknown,
): Record<string, unknown> {
  return error instanceof ObservationApiRequestError ? error.details : {};
}

/** The refreshed record an OBSERVATION_VERSION_CONFLICT carries, if valid. */
export function conflictObservationOf(error: unknown): ObservationDraft | null {
  if (observationErrorCodeOf(error) !== "OBSERVATION_VERSION_CONFLICT") {
    return null;
  }
  const parsed = observationDraftSchema.safeParse(
    observationErrorDetailsOf(error).observation,
  );
  return parsed.success ? parsed.data : null;
}

/** Denial fields the server named, e.g. `capturedAt` or `commonName`. */
export function invalidFieldsOf(error: unknown): string[] {
  const fields = observationErrorDetailsOf(error).fields;
  return Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === "string")
    : [];
}

/** Access errors mean a stale record must not stay on screen. */
export const OBSERVATION_ACCESS_ERRORS: readonly ObservationClientErrorCode[] =
  ["AUTH_REQUIRED", "EMAIL_NOT_CONFIRMED", "ACCOUNT_DISABLED", "FORBIDDEN"];

export const OBSERVATION_NETWORK_PRESENTATION = {
  title: "เชื่อมต่อไม่สำเร็จ",
  description:
    "ยังไม่มีการบันทึก ข้อมูลในหน้านี้ยังอยู่ ตรวจสอบสัญญาณแล้วลองอีกครั้ง",
  action: "ลองใหม่",
} as const;

export function presentObservationError(code: ObservationClientErrorCode) {
  return code === "NETWORK"
    ? OBSERVATION_NETWORK_PRESENTATION
    : OBSERVATION_ERROR_PRESENTATIONS[code];
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !body || body.error) {
    // A 5xx without an envelope is a transport failure, not a denial.
    if (!body?.error && response.status >= 500) {
      throw new TypeError(`observation request failed (${response.status})`);
    }
    throw new ObservationApiRequestError(
      body?.error ?? FORBIDDEN_API_ERROR,
      response.status,
    );
  }
  return body.data;
}

export async function fetchObservationJson<TSchema extends z.ZodType>(
  url: string,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const data = await readEnvelope<unknown>(
    await fetch(url, { cache: "no-store" }),
  );
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ObservationApiRequestError(FORBIDDEN_API_ERROR, 200);
  }
  return parsed.data;
}

export async function sendObservationJson<TSchema extends z.ZodType>(
  method: "POST" | "PUT",
  url: string,
  body: unknown,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const data = await readEnvelope<unknown>(
    await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ObservationApiRequestError(FORBIDDEN_API_ERROR, 200);
  }
  return parsed.data;
}
