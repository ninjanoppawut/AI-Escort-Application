import { z } from "zod";

import { apiErrorCodeSchema, type ApiErrorCode } from "@/lib/http/error-code";

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()),
});

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export interface ApiSuccess<TData> {
  data: TData;
  error: null;
  requestId: string;
}

export interface ApiFailure {
  data: null;
  error: ApiError;
  requestId: string;
}

export type ApiEnvelope<TData> = ApiSuccess<TData> | ApiFailure;

export function apiEnvelopeSchema<TSchema extends z.ZodType>(
  dataSchema: TSchema,
) {
  return z.union([
    z.object({
      data: dataSchema,
      error: z.null(),
      requestId: z.uuid(),
    }),
    z.object({
      data: z.null(),
      error: apiErrorSchema,
      requestId: z.uuid(),
    }),
  ]);
}

export function successEnvelope<TData>(
  data: TData,
  requestId: string,
): ApiSuccess<TData> {
  return { data, error: null, requestId };
}

export function errorEnvelope(error: ApiError, requestId: string): ApiFailure {
  return { data: null, error, requestId };
}
