import type { ApiEnvelope, ApiError } from "@/lib/http/envelope";

import {
  mediaListViewSchema,
  mediaRecordSchema,
  type MediaCategory,
  type MediaListView,
  type MediaRecord,
  type RegisterMediaRequest,
} from "../contracts";

/** A refused or failed media request; `code` NETWORK means no response. */
export class MediaApiRequestError extends Error {
  readonly code: ApiError["code"] | "NETWORK";
  readonly details: Record<string, unknown>;
  readonly status: number;

  constructor(
    code: ApiError["code"] | "NETWORK",
    status: number,
    details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "MediaApiRequestError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new MediaApiRequestError("NETWORK", 0);
  }
  const body = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;
  if (!body) {
    throw new MediaApiRequestError(
      response.status >= 500 ? "NETWORK" : "FORBIDDEN",
      response.status,
    );
  }
  if (!response.ok || body.error) {
    const error = body.error;
    throw new MediaApiRequestError(
      error?.code ?? "FORBIDDEN",
      response.status,
      error?.details ?? {},
    );
  }
  return body.data;
}

function jsonInit(method: string, payload: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export async function fetchMediaList(
  observationId: string,
): Promise<MediaListView> {
  const data = await request<unknown>(
    `/api/observations/${observationId}/media`,
  );
  const parsed = mediaListViewSchema.safeParse(data);
  if (!parsed.success) throw new MediaApiRequestError("FORBIDDEN", 200);
  return parsed.data;
}

export async function registerMediaRequest(
  observationId: string,
  body: RegisterMediaRequest,
): Promise<{ outcome: "created" | "existing"; media: MediaRecord }> {
  const data = await request<{ outcome: string; media: unknown }>(
    `/api/observations/${observationId}/media`,
    jsonInit("POST", body),
  );
  const media = mediaRecordSchema.safeParse(data.media);
  if (
    !media.success ||
    (data.outcome !== "created" && data.outcome !== "existing")
  ) {
    throw new MediaApiRequestError("FORBIDDEN", 200);
  }
  return { outcome: data.outcome, media: media.data };
}

export function completeMediaRequest(
  observationId: string,
  mediaId: string,
  attemptCount: number,
) {
  return request<{ outcome: "uploaded" | "existing" }>(
    `/api/observations/${observationId}/media/${mediaId}/complete`,
    jsonInit("POST", { attemptCount }),
  );
}

export function deleteMediaRequest(observationId: string, mediaId: string) {
  return request<{ outcome: "deleted" | "deleting"; retryable: boolean }>(
    `/api/observations/${observationId}/media/${mediaId}`,
    { method: "DELETE" },
  );
}

export function updateMediaCategoryRequest(
  observationId: string,
  mediaId: string,
  category: MediaCategory,
) {
  return request<{ outcome: "updated" | "unchanged"; category: MediaCategory }>(
    `/api/observations/${observationId}/media/${mediaId}`,
    jsonInit("PATCH", { category }),
  );
}
