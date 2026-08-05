import "server-only";

import { NextResponse } from "next/server";

import {
  errorEnvelope,
  successEnvelope,
  type ApiError,
} from "@/lib/http/envelope";

function responseHeaders(requestId: string) {
  return {
    "cache-control": "no-store",
    "x-request-id": requestId,
  };
}

export function jsonSuccess<TData>(
  data: TData,
  requestId: string,
  status = 200,
) {
  return NextResponse.json(successEnvelope(data, requestId), {
    status,
    headers: responseHeaders(requestId),
  });
}

export function jsonError(error: ApiError, requestId: string, status: number) {
  return NextResponse.json(errorEnvelope(error, requestId), {
    status,
    headers: responseHeaders(requestId),
  });
}
