import { OBSERVATION_IMAGES_BUCKET } from "../contracts";

export type StorageUploadResult =
  | { ok: true }
  | {
      ok: false;
      kind:
        | "auth"
        | "denied"
        | "too_large"
        | "invalid_type"
        | "retryable"
        | "aborted";
      status: number;
    };

export interface StorageUploadInput {
  supabaseUrl: string;
  publishableKey: string;
  accessToken: string;
  path: string;
  blob: Blob;
  contentType: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Aborts when no progress arrives for this long (stalled mobile uploads). */
  stallTimeoutMs?: number;
  createXhr?: () => XMLHttpRequest;
}

function classify(status: number, body: string): StorageUploadResult {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 413) return { ok: false, kind: "too_large", status };
  if (status === 415) return { ok: false, kind: "invalid_type", status };
  if (status === 401) return { ok: false, kind: "auth", status };
  // Storage reports RLS refusals as 403, sometimes as 400 with statusCode 403.
  if (
    status === 403 ||
    (status === 400 && /"statusCode"\s*:\s*"?403/.test(body))
  ) {
    return { ok: false, kind: "denied", status };
  }
  if (status === 400 && /mime|content type|invalid_mime/i.test(body)) {
    return { ok: false, kind: "invalid_type", status };
  }
  if (status === 400 && /too large|payload|size/i.test(body)) {
    return { ok: false, kind: "too_large", status };
  }
  return { ok: false, kind: "retryable", status };
}

/**
 * Uploads one processed image straight to the private bucket with the
 * student's own session, so Storage RLS decides at write time. XHR (not
 * fetch) gives upload progress and abort on iOS Safari. Upsert lets a retry
 * of the same reservation replace a partial object while it is pending.
 */
export function uploadToStorage(
  input: StorageUploadInput,
): Promise<StorageUploadResult> {
  return new Promise((resolve) => {
    const xhr = input.createXhr?.() ?? new XMLHttpRequest();
    const url = `${input.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${OBSERVATION_IMAGES_BUCKET}/${input.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: StorageUploadResult) => {
      if (settled) return;
      settled = true;
      if (stallTimer) clearTimeout(stallTimer);
      input.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const armStall = () => {
      if (!input.stallTimeoutMs) return;
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        xhr.abort();
        finish({ ok: false, kind: "retryable", status: 0 });
      }, input.stallTimeoutMs);
    };
    const onAbort = () => {
      xhr.abort();
      finish({ ok: false, kind: "aborted", status: 0 });
    };

    if (input.signal?.aborted) {
      finish({ ok: false, kind: "aborted", status: 0 });
      return;
    }
    input.signal?.addEventListener("abort", onAbort);

    xhr.open("POST", url);
    xhr.setRequestHeader("apikey", input.publishableKey);
    xhr.setRequestHeader("authorization", `Bearer ${input.accessToken}`);
    xhr.setRequestHeader("content-type", input.contentType);
    xhr.setRequestHeader("cache-control", "max-age=600");
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (event) => {
      armStall();
      if (event.lengthComputable && event.total > 0) {
        input.onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () =>
      finish(classify(xhr.status, String(xhr.responseText ?? "")));
    xhr.onerror = () => finish({ ok: false, kind: "retryable", status: 0 });
    xhr.ontimeout = () => finish({ ok: false, kind: "retryable", status: 0 });
    armStall();
    xhr.send(input.blob);
  });
}
