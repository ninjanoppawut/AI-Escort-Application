import { z } from "zod";

const correlationIdSchema = z.uuid();

export interface RequestContext {
  requestId: string;
  traceId: string;
}

function validId(value: string | null) {
  const result = correlationIdSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function createRequestContext(headers: Headers): RequestContext {
  const requestId = validId(headers.get("x-request-id")) ?? crypto.randomUUID();
  const traceId = validId(headers.get("x-trace-id")) ?? requestId;

  return { requestId, traceId };
}
