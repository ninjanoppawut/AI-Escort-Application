import {
  isImageProcessingError,
  revokePreviewUrl,
  type ImageProcessingError,
  type ProcessedImage,
} from "@/lib/image-processing";

import {
  registerMediaRequestSchema,
  type MediaCategory,
  type MediaRecord,
  type RegisterMediaRequest,
} from "../contracts";
import { isMediaUiErrorCode, type MediaUiErrorCode } from "../errors";
import { MediaApiRequestError } from "./api";
import type { StorageUploadResult } from "./storage-upload";

/**
 * Per-observation image upload queue (P9-03 client, OBS-005 to OBS-008).
 *
 * Framework-free: React reads it through `subscribe`/`getSnapshot`
 * (`useSyncExternalStore`). Processing runs one image at a time, and so does
 * the network lane (register → Storage upload → confirm), so a low-end phone
 * never holds two decodes or two uploads. Every retry resumes from the last
 * completed step with the same client media ID and the same processed bytes,
 * which the server treats as idempotent replays.
 *
 * Memory only: the processed bytes live in this tab until IndexedDB lands in
 * P14, so `hasUnsent` drives an honest "closing loses unsent images" guard.
 */

/** A Storage upload with no progress for this long is aborted and retried. */
export const UPLOAD_STALL_TIMEOUT_MS = 30_000;
/** Automatic retries after the first failure; then the student retries. */
export const MAX_AUTO_RETRIES = 6;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 30_000;
/** `complete` accepts an attempt count of 1–50. */
export const MAX_REPORTED_ATTEMPTS = 50;

export type UploadStage =
  | "processing"
  | "needs_category"
  | "queued"
  | "registering"
  | "uploading"
  | "confirming"
  | "uploaded"
  | "failed_retryable"
  | "failed"
  | "blocked"
  | "rejected"
  | "cancelling";

/** Stable media codes plus the two client-only causes. */
export type UploadErrorCode =
  MediaUiErrorCode | "IMAGE_PROCESSING_FAILED" | "NETWORK";

/** What the UI may render for one image. Never holds a storage path. */
export interface UploadItem {
  /** Also the client media ID (the register idempotency key). */
  localId: string;
  stage: UploadStage;
  category: MediaCategory | null;
  /** Device time when the image was accepted (ISO). */
  capturedAt: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  /** Server row ID once the slot is reserved. */
  mediaId: string | null;
  /** Storage upload progress, 0..1. */
  progress: number;
  /** Storage upload sends so far (reported to `complete`). */
  uploadAttempts: number;
  /** Automatic retries consumed since the last manual retry. */
  autoRetries: number;
  /** When the next automatic retry is due (epoch ms). */
  retryAt: number | null;
  errorCode: UploadErrorCode | null;
  /** Ready to send but paused until the device is back online. */
  waitingForNetwork: boolean;
}

export interface UploadQueueSnapshot {
  items: readonly UploadItem[];
  online: boolean;
  /** Images that would be lost if this page closed now. */
  hasUnsent: boolean;
  /** Images added since the queue was last idle, and how many finished. */
  batch: { done: number; total: number };
  /** The image on the network lane, if any. */
  sendingLocalId: string | null;
}

export type UploadQueueEvent =
  | {
      type: "uploaded";
      localId: string;
      mediaId: string;
      category: MediaCategory;
    }
  | {
      type: "retrying";
      localId: string;
      code: UploadErrorCode;
      retry: number;
      delayMs: number;
    }
  | { type: "failed"; localId: string; code: UploadErrorCode }
  | { type: "blocked"; localId: string; code: UploadErrorCode }
  | {
      type: "rejected";
      localId: string;
      code: UploadErrorCode;
      mediaId: string | null;
    }
  | { type: "removed"; localId: string; mediaId: string | null };

export interface UploadRequest {
  path: string;
  blob: Blob;
  contentType: string;
  accessToken: string;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
  stallTimeoutMs: number;
}

export interface UploadQueueDeps {
  process(file: Blob): Promise<ProcessedImage | ImageProcessingError>;
  register(
    body: RegisterMediaRequest,
  ): Promise<{ outcome: "created" | "existing"; media: MediaRecord }>;
  upload(request: UploadRequest): Promise<StorageUploadResult>;
  complete(mediaId: string, attemptCount: number): Promise<unknown>;
  remove(mediaId: string): Promise<unknown>;
  getAccessToken(): Promise<string | null>;
  /** Refreshes the session once; true when a new session is available. */
  refreshAuth(): Promise<boolean>;
  now(): number;
  random(): number;
  /** Resolves after `ms`, or early when `signal` aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  createId?(): string;
  revokePreview?(url: string): void;
}

export interface UploadQueueEnvironment {
  isOnline(): boolean;
  /** Registers connectivity and foreground wake-ups; returns an unsubscribe. */
  listen(handlers: {
    online(): void;
    offline(): void;
    visible(): void;
  }): () => void;
}

export interface UploadQueueInput {
  file: Blob;
  /** Null means the student must choose before the image is sent. */
  category: MediaCategory | null;
}

export interface UploadQueue {
  subscribe(listener: () => void): () => void;
  getSnapshot(): UploadQueueSnapshot;
  getServerSnapshot(): UploadQueueSnapshot;
  onEvent(listener: (event: UploadQueueEvent) => void): () => void;
  /** Accepts images in order; returns their client media IDs. */
  add(inputs: readonly UploadQueueInput[]): string[];
  /** Sets the category of an image that has not reserved a slot yet. */
  setCategory(localId: string, category: MediaCategory): boolean;
  retry(localId: string): void;
  retryAll(): void;
  /** Aborts the image and deletes its pending server row, if any. */
  cancel(localId: string): void;
  /** Drops a settled (uploaded, rejected, or blocked) image. */
  forget(localId: string): void;
  /** Resumes paused and backing-off images now. */
  wake(): void;
  dispose(): void;
}

const UNSENT_STAGES: ReadonlySet<UploadStage> = new Set([
  "processing",
  "needs_category",
  "queued",
  "registering",
  "uploading",
  "confirming",
  "failed_retryable",
  "failed",
]);

const ACTIVE_STAGES: ReadonlySet<UploadStage> = new Set([
  ...UNSENT_STAGES,
  "cancelling",
]);

const SETTLED_STAGES: ReadonlySet<UploadStage> = new Set([
  "uploaded",
  "rejected",
  "blocked",
]);

export type UploadFailureClass =
  "retryable" | "failed" | "blocked" | "rejected";

/** How a failure is handled: retried automatically, by hand, or not at all. */
export function classifyUploadError(code: UploadErrorCode): UploadFailureClass {
  switch (code) {
    case "INVALID_IMAGE_TYPE":
    case "IMAGE_TOO_LARGE":
    case "IMAGE_LIMIT_EXCEEDED":
    case "VALIDATION_FAILED":
    case "IDEMPOTENCY_KEY_REUSE":
    case "IMAGE_PROCESSING_FAILED":
      return "rejected";
    case "FORBIDDEN":
    case "INVALID_STATUS_TRANSITION":
    case "EMAIL_NOT_CONFIRMED":
    case "ACCOUNT_DISABLED":
      return "blocked";
    case "AUTH_REQUIRED":
    case "IMAGE_UPLOAD_INCOMPLETE":
      return "failed";
    default:
      return "retryable";
  }
}

/** Maps a thrown request error to an upload error code. */
export function uploadErrorCodeOf(error: unknown): UploadErrorCode {
  if (!(error instanceof MediaApiRequestError)) return "NETWORK";
  const code = error.code;
  if (code === "NETWORK") return "NETWORK";
  if (isMediaUiErrorCode(code)) return code;
  // Other activity-state denials block this draft like a status change.
  if (
    code === "CLASS_NOT_ACTIVE" ||
    code === "SESSION_NOT_OPEN" ||
    code === "GROUP_NOT_ACTIVE"
  ) {
    return "INVALID_STATUS_TRANSITION";
  }
  // RATE_LIMITED and unexpected server failures are transient.
  return "NETWORK";
}

/**
 * Full-jitter exponential backoff: retry n waits a uniform random time below
 * min(30 s, 1 s × 2^(n−1)).
 */
export function backoffDelay(retry: number, random: () => number): number {
  const cap = Math.min(
    BACKOFF_CAP_MS,
    BACKOFF_BASE_MS * 2 ** Math.max(0, retry - 1),
  );
  const fraction = Math.min(Math.max(random(), 0), 1);
  return Math.floor(fraction * cap);
}

export function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

/** Connectivity from `navigator.onLine` plus online/offline/visibility events. */
export function browserUploadEnvironment(): UploadQueueEnvironment {
  return {
    isOnline: () =>
      typeof navigator === "undefined" || navigator.onLine !== false,
    listen(handlers) {
      if (typeof window === "undefined") return () => undefined;
      const onVisibility = () => {
        if (document.visibilityState === "visible") handlers.visible();
      };
      window.addEventListener("online", handlers.online);
      window.addEventListener("offline", handlers.offline);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        window.removeEventListener("online", handlers.online);
        window.removeEventListener("offline", handlers.offline);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    },
  };
}

export const EMPTY_UPLOAD_SNAPSHOT: UploadQueueSnapshot = Object.freeze({
  items: Object.freeze([]) as readonly UploadItem[],
  online: true,
  hasUnsent: false,
  batch: Object.freeze({ done: 0, total: 0 }),
  sendingLocalId: null,
});

interface Entry {
  item: UploadItem;
  /** Source file until processing starts. */
  file: Blob | null;
  /** Processed bytes, kept in memory for every re-upload. */
  processed: ProcessedImage | null;
  /** Upload target from the reservation; never exposed to the UI. */
  target: { path: string; contentType: string } | null;
  resume: "register" | "upload" | "confirm";
  cancelRequested: boolean;
  controller: AbortController | null;
  abortReason: "cancel" | "offline" | "dispose" | null;
  retryTimer: AbortController | null;
  incompleteReuploaded: boolean;
  authRefreshed: boolean;
  inBatch: boolean;
}

export function createUploadQueue(
  deps: UploadQueueDeps,
  environment: UploadQueueEnvironment = browserUploadEnvironment(),
): UploadQueue {
  const entries = new Map<string, Entry>();
  let order: string[] = [];
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: UploadQueueEvent) => void>();
  const createId = deps.createId ?? (() => crypto.randomUUID());
  const revoke = deps.revokePreview ?? revokePreviewUrl;
  let sendingId: string | null = null;
  let disposed = false;
  let batchTotal = 0;
  let batchDone = 0;
  let processingTail: Promise<void> = Promise.resolve();
  let snapshot = buildSnapshot();

  const unlisten = environment.listen({
    online: () => {
      for (const entry of entries.values()) {
        if (entry.item.waitingForNetwork) {
          entry.item = { ...entry.item, waitingForNetwork: false };
        }
      }
      emit();
      wake();
    },
    offline: () => {
      emit();
      const sending = sendingId ? entries.get(sendingId) : undefined;
      if (sending?.controller) {
        sending.abortReason = "offline";
        sending.controller.abort();
      }
    },
    visible: () => wake(),
  });

  function buildSnapshot(): UploadQueueSnapshot {
    const items = order.map((id) => entries.get(id)!.item);
    return {
      items,
      online: environment.isOnline(),
      hasUnsent: items.some((item) => UNSENT_STAGES.has(item.stage)),
      batch: { done: batchDone, total: batchTotal },
      sendingLocalId: sendingId,
    };
  }

  function emit() {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener();
  }

  function emitEvent(event: UploadQueueEvent) {
    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch {
        // A UI listener failure must not stall the queue.
      }
    }
  }

  function isLive(entry: Entry) {
    return (
      !disposed &&
      entries.get(entry.item.localId) === entry &&
      !entry.cancelRequested
    );
  }

  function patch(entry: Entry, changes: Partial<UploadItem>) {
    entry.item = { ...entry.item, ...changes };
    if (entries.get(entry.item.localId) === entry) emit();
  }

  function leaveBatch(entry: Entry) {
    if (entry.inBatch && entry.item.stage !== "uploaded") {
      entry.inBatch = false;
      batchTotal = Math.max(0, batchTotal - 1);
    }
  }

  function clearRetry(entry: Entry) {
    const timer = entry.retryTimer;
    entry.retryTimer = null;
    timer?.abort();
  }

  function removeEntry(entry: Entry) {
    const id = entry.item.localId;
    if (entries.get(id) !== entry) return;
    clearRetry(entry);
    leaveBatch(entry);
    entries.delete(id);
    order = order.filter((candidate) => candidate !== id);
    if (entry.item.previewUrl) revoke(entry.item.previewUrl);
    entry.processed = null;
    entry.target = null;
    emit();
  }

  function hasActiveWork() {
    for (const entry of entries.values()) {
      if (ACTIVE_STAGES.has(entry.item.stage)) return true;
    }
    return false;
  }

  async function accessToken() {
    try {
      return await deps.getAccessToken();
    } catch {
      return null;
    }
  }

  async function refreshAuth() {
    try {
      return await deps.refreshAuth();
    } catch {
      return false;
    }
  }

  async function processEntry(entry: Entry) {
    const file = entry.file;
    entry.file = null;
    if (!file || !isLive(entry)) return;
    let result: ProcessedImage | ImageProcessingError | null;
    try {
      result = await deps.process(file);
    } catch {
      result = null;
    }
    if (!isLive(entry)) {
      if (result && !isImageProcessingError(result)) revoke(result.previewUrl);
      return;
    }
    if (result === null) return reject(entry, "IMAGE_PROCESSING_FAILED");
    if (isImageProcessingError(result)) return reject(entry, result.code);
    // The server requires a content hash; without Web Crypto the image cannot
    // be registered, so it fails like any other processing failure.
    if (!result.sha256) {
      revoke(result.previewUrl);
      return reject(entry, "IMAGE_PROCESSING_FAILED");
    }
    entry.processed = result;
    patch(entry, {
      stage: entry.item.category ? "queued" : "needs_category",
      previewUrl: result.previewUrl,
      width: result.width,
      height: result.height,
      byteSize: result.byteSize,
    });
    pump();
  }

  function registerBody(entry: Entry): RegisterMediaRequest | null {
    const processed = entry.processed;
    if (!processed || !entry.item.category) return null;
    const parsed = registerMediaRequestSchema.safeParse({
      clientMediaId: entry.item.localId,
      category: entry.item.category,
      mimeType: processed.mimeType,
      byteSize: processed.byteSize,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
      preprocessingVersion: processed.preprocessingVersion,
      capturedAt: entry.item.capturedAt,
    });
    return parsed.success ? parsed.data : null;
  }

  function markUploaded(entry: Entry) {
    const mediaId = entry.item.mediaId!;
    const category = entry.item.category!;
    clearRetry(entry);
    entry.processed = null;
    entry.target = null;
    if (entry.inBatch) batchDone += 1;
    patch(entry, {
      stage: "uploaded",
      progress: 1,
      errorCode: null,
      retryAt: null,
      waitingForNetwork: false,
    });
    emitEvent({
      type: "uploaded",
      localId: entry.item.localId,
      mediaId,
      category,
    });
  }

  async function reject(entry: Entry, code: UploadErrorCode) {
    clearRetry(entry);
    const mediaId = entry.item.mediaId;
    leaveBatch(entry);
    entry.processed = null;
    patch(entry, {
      stage: "rejected",
      errorCode: code,
      retryAt: null,
      progress: 0,
      waitingForNetwork: false,
    });
    // A refused image frees its reserved slot.
    if (mediaId) {
      try {
        await deps.remove(mediaId);
      } catch {
        // The pending row then shows as "retake" after the next list refresh.
      }
    }
    emitEvent({ type: "rejected", localId: entry.item.localId, code, mediaId });
  }

  function block(entry: Entry, code: UploadErrorCode) {
    clearRetry(entry);
    leaveBatch(entry);
    patch(entry, {
      stage: "blocked",
      errorCode: code,
      retryAt: null,
      progress: 0,
      waitingForNetwork: false,
    });
    emitEvent({ type: "blocked", localId: entry.item.localId, code });
  }

  function fail(entry: Entry, code: UploadErrorCode) {
    clearRetry(entry);
    patch(entry, {
      stage: "failed",
      errorCode: code,
      retryAt: null,
      progress: 0,
      waitingForNetwork: false,
    });
    emitEvent({ type: "failed", localId: entry.item.localId, code });
  }

  function waitForNetwork(entry: Entry, code: UploadErrorCode | null = null) {
    patch(entry, {
      stage: "queued",
      waitingForNetwork: true,
      progress: 0,
      retryAt: null,
      ...(code ? { errorCode: code } : {}),
    });
  }

  function scheduleRetry(entry: Entry, code: UploadErrorCode) {
    // A failure while offline is a pause, not a spent attempt.
    if (!environment.isOnline()) return waitForNetwork(entry, code);
    if (entry.item.autoRetries >= MAX_AUTO_RETRIES) return fail(entry, code);
    const retry = entry.item.autoRetries + 1;
    const delayMs = backoffDelay(retry, deps.random);
    const timer = new AbortController();
    clearRetry(entry);
    entry.retryTimer = timer;
    patch(entry, {
      stage: "failed_retryable",
      errorCode: code,
      autoRetries: retry,
      retryAt: deps.now() + delayMs,
      progress: 0,
    });
    emitEvent({
      type: "retrying",
      localId: entry.item.localId,
      code,
      retry,
      delayMs,
    });
    void deps.sleep(delayMs, timer.signal).then(() => {
      if (entry.retryTimer !== timer) return;
      entry.retryTimer = null;
      if (!isLive(entry) || entry.item.stage !== "failed_retryable") return;
      patch(entry, { stage: "queued", retryAt: null });
      pump();
    });
  }

  async function settleFailure(entry: Entry, code: UploadErrorCode) {
    if (entry.cancelRequested) return finishCancel(entry);
    switch (classifyUploadError(code)) {
      case "rejected":
        return reject(entry, code);
      case "blocked":
        return block(entry, code);
      case "failed":
        return fail(entry, code);
      default:
        return scheduleRetry(entry, code);
    }
  }

  async function finishCancel(entry: Entry) {
    clearRetry(entry);
    const mediaId = entry.item.mediaId;
    if (mediaId) {
      patch(entry, { stage: "cancelling" });
      try {
        await deps.remove(mediaId);
      } catch {
        // The pending row then shows as "retake" after the next list refresh.
      }
    }
    removeEntry(entry);
    emitEvent({ type: "removed", localId: entry.item.localId, mediaId });
  }

  function reportProgress(
    entry: Entry,
    controller: AbortController,
    fraction: number,
  ) {
    if (entry.controller !== controller) return;
    const rounded = Math.round(Math.min(Math.max(fraction, 0), 1) * 100) / 100;
    if (rounded !== entry.item.progress) patch(entry, { progress: rounded });
  }

  async function uploadOnce(entry: Entry): Promise<"ok" | "again" | "settled"> {
    const processed = entry.processed;
    const target = entry.target;
    if (!processed || !target) {
      entry.resume = "register";
      return "again";
    }
    let token = await accessToken();
    if (!token && !entry.authRefreshed) {
      entry.authRefreshed = true;
      if (await refreshAuth()) token = await accessToken();
    }
    if (disposed || entry.cancelRequested) return "again";
    if (!token) {
      fail(entry, "AUTH_REQUIRED");
      return "settled";
    }

    const controller = new AbortController();
    entry.controller = controller;
    entry.abortReason = null;
    patch(entry, {
      stage: "uploading",
      progress: 0,
      uploadAttempts: entry.item.uploadAttempts + 1,
      errorCode: null,
      waitingForNetwork: false,
    });
    let result: StorageUploadResult;
    try {
      result = await deps.upload({
        path: target.path,
        contentType: target.contentType,
        blob: processed.blob,
        accessToken: token,
        signal: controller.signal,
        stallTimeoutMs: UPLOAD_STALL_TIMEOUT_MS,
        onProgress: (fraction) => reportProgress(entry, controller, fraction),
      });
    } catch {
      result = { ok: false, kind: "retryable", status: 0 };
    }
    entry.controller = null;
    const abortReason = entry.abortReason;
    entry.abortReason = null;

    if (result.ok) return "ok";
    if (disposed || entry.cancelRequested) return "again";
    switch (result.kind) {
      case "aborted":
        if (abortReason === "offline") {
          waitForNetwork(entry);
          return "settled";
        }
        await settleFailure(entry, "NETWORK");
        return "settled";
      case "auth":
        if (!entry.authRefreshed) {
          entry.authRefreshed = true;
          if (await refreshAuth()) return "again";
        }
        fail(entry, "AUTH_REQUIRED");
        return "settled";
      case "denied":
        block(entry, "FORBIDDEN");
        return "settled";
      case "too_large":
        await reject(entry, "IMAGE_TOO_LARGE");
        return "settled";
      case "invalid_type":
        await reject(entry, "INVALID_IMAGE_TYPE");
        return "settled";
      default:
        await settleFailure(entry, "NETWORK");
        return "settled";
    }
  }

  async function run(entry: Entry): Promise<void> {
    entry.authRefreshed = false;
    for (;;) {
      if (disposed) return;
      if (entry.cancelRequested) return finishCancel(entry);
      if (!environment.isOnline()) return waitForNetwork(entry);
      const step = entry.resume;
      try {
        if (step === "register") {
          patch(entry, {
            stage: "registering",
            errorCode: null,
            retryAt: null,
            waitingForNetwork: false,
            progress: 0,
          });
          const body = registerBody(entry);
          if (!body) return reject(entry, "VALIDATION_FAILED");
          const result = await deps.register(body);
          entry.target = {
            path: result.media.upload.path,
            contentType: result.media.upload.contentType,
          };
          patch(entry, { mediaId: result.media.id });
          // A replay of an already confirmed image skips straight to done.
          if (result.media.status === "uploaded") {
            if (entry.cancelRequested) continue;
            return markUploaded(entry);
          }
          entry.resume = "upload";
          continue;
        }
        if (step === "upload") {
          const outcome = await uploadOnce(entry);
          if (outcome === "ok") entry.resume = "confirm";
          if (outcome === "settled") return;
          continue;
        }
        patch(entry, { stage: "confirming", progress: 1, errorCode: null });
        await deps.complete(
          entry.item.mediaId!,
          Math.min(
            Math.max(entry.item.uploadAttempts, 1),
            MAX_REPORTED_ATTEMPTS,
          ),
        );
        if (entry.cancelRequested) continue;
        return markUploaded(entry);
      } catch (error) {
        if (disposed) return;
        if (entry.cancelRequested) continue;
        const code = uploadErrorCodeOf(error);
        if (code === "AUTH_REQUIRED" && !entry.authRefreshed) {
          entry.authRefreshed = true;
          if (await refreshAuth()) continue;
          return fail(entry, "AUTH_REQUIRED");
        }
        // The object is missing or differs: send the same bytes once more.
        if (
          code === "IMAGE_UPLOAD_INCOMPLETE" &&
          step === "confirm" &&
          !entry.incompleteReuploaded
        ) {
          entry.incompleteReuploaded = true;
          entry.resume = "upload";
          continue;
        }
        return settleFailure(entry, code);
      }
    }
  }

  function pump() {
    if (disposed || sendingId) return;
    const next = order
      .map((id) => entries.get(id)!)
      .find((entry) => entry.item.stage === "queued" && !entry.cancelRequested);
    if (!next) return;
    if (!environment.isOnline()) {
      for (const entry of entries.values()) {
        if (entry.item.stage === "queued" && !entry.item.waitingForNetwork) {
          patch(entry, { waitingForNetwork: true });
        }
      }
      return;
    }
    sendingId = next.item.localId;
    emit();
    void run(next)
      .catch(() => undefined)
      .finally(() => {
        sendingId = null;
        emit();
        pump();
      });
  }

  function wake() {
    if (disposed) return;
    for (const entry of entries.values()) {
      if (entry.item.stage === "failed_retryable") {
        clearRetry(entry);
        patch(entry, { stage: "queued", retryAt: null });
      }
    }
    pump();
  }

  function retry(localId: string) {
    const entry = entries.get(localId);
    if (!entry || entry.cancelRequested) return;
    if (
      entry.item.stage !== "failed" &&
      entry.item.stage !== "failed_retryable"
    ) {
      return;
    }
    clearRetry(entry);
    entry.authRefreshed = false;
    entry.incompleteReuploaded = false;
    if (
      entry.item.errorCode === "IMAGE_UPLOAD_INCOMPLETE" &&
      entry.resume === "confirm"
    ) {
      entry.resume = "upload";
    }
    patch(entry, {
      stage: "queued",
      autoRetries: 0,
      retryAt: null,
      errorCode: null,
    });
    pump();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_UPLOAD_SNAPSHOT,
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    add(inputs) {
      if (disposed || inputs.length === 0) return [];
      if (!hasActiveWork()) {
        batchTotal = 0;
        batchDone = 0;
      }
      const capturedAt = new Date(deps.now()).toISOString();
      const ids: string[] = [];
      for (const input of inputs) {
        const localId = createId();
        const entry: Entry = {
          item: {
            localId,
            stage: "processing",
            category: input.category,
            capturedAt,
            previewUrl: null,
            width: null,
            height: null,
            byteSize: null,
            mediaId: null,
            progress: 0,
            uploadAttempts: 0,
            autoRetries: 0,
            retryAt: null,
            errorCode: null,
            waitingForNetwork: false,
          },
          file: input.file,
          processed: null,
          target: null,
          resume: "register",
          cancelRequested: false,
          controller: null,
          abortReason: null,
          retryTimer: null,
          incompleteReuploaded: false,
          authRefreshed: false,
          inBatch: true,
        };
        entries.set(localId, entry);
        order = [...order, localId];
        batchTotal += 1;
        ids.push(localId);
        processingTail = processingTail
          .then(() => processEntry(entry))
          .catch(() => undefined);
      }
      emit();
      return ids;
    },
    setCategory(localId, category) {
      const entry = entries.get(localId);
      if (!entry || entry.cancelRequested || entry.item.mediaId) return false;
      const stage = entry.item.stage;
      if (
        stage !== "processing" &&
        stage !== "needs_category" &&
        stage !== "queued" &&
        stage !== "failed" &&
        stage !== "failed_retryable"
      ) {
        return false;
      }
      patch(entry, {
        category,
        stage: stage === "needs_category" ? "queued" : stage,
      });
      if (stage === "needs_category") pump();
      return true;
    },
    retry,
    retryAll() {
      for (const entry of [...entries.values()]) retry(entry.item.localId);
    },
    cancel(localId) {
      const entry = entries.get(localId);
      if (!entry || entry.cancelRequested) return;
      const stage = entry.item.stage;
      if (stage === "uploaded" || stage === "cancelling") return;
      entry.cancelRequested = true;
      clearRetry(entry);
      if (sendingId === localId) {
        // Register/confirm finish first; an upload stops now.
        patch(entry, { stage: "cancelling" });
        if (entry.controller) {
          entry.abortReason = "cancel";
          entry.controller.abort();
        }
        return;
      }
      void finishCancel(entry);
    },
    forget(localId) {
      const entry = entries.get(localId);
      if (entry && SETTLED_STAGES.has(entry.item.stage)) removeEntry(entry);
    },
    wake,
    dispose() {
      if (disposed) return;
      disposed = true;
      unlisten();
      for (const entry of entries.values()) {
        clearRetry(entry);
        if (entry.controller) {
          entry.abortReason = "dispose";
          entry.controller.abort();
        }
        if (entry.item.previewUrl) revoke(entry.item.previewUrl);
        entry.processed = null;
      }
      entries.clear();
      order = [];
      emit();
      listeners.clear();
      eventListeners.clear();
    },
  };
}
