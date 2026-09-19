import { z } from "zod";

import { apiErrorSchema } from "@/lib/http/envelope";

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE = "เชื่อมต่อไม่ได้ ลองอีกครั้ง";

async function readAdminEnvelope<T extends z.ZodType>(
  response: Promise<Response>,
  schema: T,
): Promise<z.infer<T>> {
  let result: Response;
  try {
    result = await response;
  } catch {
    throw new AdminApiError("NETWORK", NETWORK_MESSAGE);
  }
  const body: unknown = await result.json().catch(() => null);
  const envelope = z
    .union([
      z.object({ data: schema, error: z.null() }),
      z.object({ data: z.null(), error: apiErrorSchema }),
    ])
    .safeParse(body);
  if (!envelope.success) {
    throw new AdminApiError(
      result.status >= 500 ? "NETWORK" : "FORBIDDEN",
      result.status >= 500 ? NETWORK_MESSAGE : "ไม่พบรายการนี้",
    );
  }
  const parsed = envelope.data as
    | { data: z.infer<T>; error: null }
    | { data: null; error: { code: string; message: string } };
  if (parsed.error) {
    throw new AdminApiError(parsed.error.code, parsed.error.message);
  }
  return parsed.data as z.infer<T>;
}

export function adminGet<T extends z.ZodType>(url: string, schema: T) {
  return readAdminEnvelope(fetch(url, { cache: "no-store" }), schema);
}

export function adminPost<T extends z.ZodType>(
  url: string,
  body: unknown,
  schema: T,
) {
  return readAdminEnvelope(
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    schema,
  );
}

export function adminErrorOf(error: unknown) {
  return error instanceof AdminApiError
    ? error
    : new AdminApiError("NETWORK", NETWORK_MESSAGE);
}

export function withQuery(
  path: string,
  params: Record<string, string | null | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});

export function formatAdminDate(value: string) {
  return dateFormatter.format(new Date(value));
}
