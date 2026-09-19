import { describe, expect, it, vi } from "vitest";

import {
  ImageProcessingError,
  type ProcessedImage,
} from "@/lib/image-processing";

import type {
  MediaListView,
  MediaRecord,
  RegisterMediaRequest,
} from "../contracts";
import { MediaApiRequestError } from "./api";
import { buildMediaTiles } from "./media-tiles";
import { keepFreshSignedUrls, withoutSignedUrl } from "./signed-urls";
import type { StorageUploadResult } from "./storage-upload";
import {
  MAX_AUTO_RETRIES,
  UPLOAD_STALL_TIMEOUT_MS,
  backoffDelay,
  classifyUploadError,
  createUploadQueue,
  type UploadItem,
  type UploadQueueDeps,
  type UploadQueueEnvironment,
  type UploadQueueEvent,
  type UploadRequest,
} from "./upload-queue";

const NOW = Date.parse("2026-09-19T03:00:00.000Z");
const PATH_PREFIX = "class-1/session-1/observation-1";

const clientId = (n: number) =>
  `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const mediaIdFor = (client: string) => `91${client.slice(2)}`;
const pathFor = (mediaId: string) => `${PATH_PREFIX}/${mediaId}.webp`;

function processedImage(
  overrides: Partial<ProcessedImage> = {},
  label = "1",
): ProcessedImage {
  return {
    blob: new Blob([`processed-${label}`], { type: "image/webp" }),
    mimeType: "image/webp",
    width: 1536,
    height: 2048,
    byteSize: 400_000,
    sha256: "a".repeat(64),
    preprocessingVersion: "img-v1",
    previewUrl: `blob:preview-${label}`,
    ...overrides,
  };
}

function mediaRecord(
  body: RegisterMediaRequest,
  status: MediaRecord["status"] = "pending",
): MediaRecord {
  const id = mediaIdFor(body.clientMediaId);
  return {
    id,
    clientMediaId: body.clientMediaId,
    position: 1,
    category: body.category,
    status,
    mimeType: body.mimeType,
    byteSize: body.byteSize,
    width: body.width,
    height: body.height,
    capturedAt: body.capturedAt,
    uploadedAt: status === "uploaded" ? body.capturedAt : null,
    submitted: false,
    upload: {
      bucket: "observation-images",
      path: pathFor(id),
      contentType: body.mimeType,
    },
  };
}

function fakeEnvironment(initiallyOnline = true) {
  let online = initiallyOnline;
  let handlers:
    { online(): void; offline(): void; visible(): void } | undefined;
  const environment: UploadQueueEnvironment = {
    isOnline: () => online,
    listen(next) {
      handlers = next;
      return () => {
        handlers = undefined;
      };
    },
  };
  return {
    environment,
    goOffline() {
      online = false;
      handlers?.offline();
    },
    goOnline() {
      online = true;
      handlers?.online();
    },
    becomeVisible() {
      handlers?.visible();
    },
  };
}

/** An upload that settles only when the test says so, or on abort. */
function heldUpload() {
  const pending: {
    request: UploadRequest;
    settle: (result: StorageUploadResult) => void;
  }[] = [];
  const upload = vi.fn(
    (request: UploadRequest) =>
      new Promise<StorageUploadResult>((resolve) => {
        const settle = (result: StorageUploadResult) => resolve(result);
        request.signal.addEventListener("abort", () =>
          settle({ ok: false, kind: "aborted", status: 0 }),
        );
        pending.push({ request, settle });
      }),
  );
  return { upload, pending };
}

function setup(
  overrides: Partial<UploadQueueDeps> = {},
  { online = true }: { online?: boolean } = {},
) {
  let ids = 0;
  const sleeps: number[] = [];
  const deps: UploadQueueDeps = {
    process: vi.fn(async () => processedImage()),
    register: vi.fn(async (body: RegisterMediaRequest) => ({
      outcome: "created" as const,
      media: mediaRecord(body),
    })),
    upload: vi.fn(async (request: UploadRequest) => {
      request.onProgress(0.5);
      request.onProgress(1);
      return { ok: true } as const;
    }),
    complete: vi.fn(async () => ({ outcome: "uploaded" })),
    remove: vi.fn(async () => ({ outcome: "deleted", retryable: false })),
    getAccessToken: vi.fn(async () => "token-1"),
    refreshAuth: vi.fn(async () => true),
    now: () => NOW,
    random: () => 0.5,
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms);
    }),
    createId: () => clientId(++ids),
    revokePreview: vi.fn(),
    ...overrides,
  };
  const env = fakeEnvironment(online);
  const queue = createUploadQueue(deps, env.environment);
  const events: UploadQueueEvent[] = [];
  queue.onEvent((event) => events.push(event));
  const file = (name = "plant") => new Blob([name], { type: "image/jpeg" });
  const item = (index = 0): UploadItem => queue.getSnapshot().items[index]!;
  const waitForStage = (stage: UploadItem["stage"], index = 0) =>
    vi.waitFor(() => expect(item(index)?.stage).toBe(stage));
  return { deps, queue, env, events, sleeps, file, item, waitForStage };
}

const networkError = () => new MediaApiRequestError("NETWORK", 0);
const apiError = (code: string, status: number) =>
  new MediaApiRequestError(code as never, status);

describe("upload queue: happy path", () => {
  it("processes, reserves, uploads, and confirms one image without exposing its path", async () => {
    const { deps, queue, events, file, item, waitForStage } = setup();

    const [id] = queue.add([{ file: file(), category: "whole_plant" }]);
    expect(id).toBe(clientId(1));
    expect(item().stage).toBe("processing");
    expect(queue.getSnapshot().hasUnsent).toBe(true);

    await waitForStage("uploaded");
    expect(deps.register).toHaveBeenCalledWith({
      clientMediaId: clientId(1),
      category: "whole_plant",
      mimeType: "image/webp",
      byteSize: 400_000,
      width: 1536,
      height: 2048,
      sha256: "a".repeat(64),
      preprocessingVersion: "img-v1",
      capturedAt: "2026-09-19T03:00:00.000Z",
    });
    const mediaId = mediaIdFor(clientId(1));
    expect(deps.upload).toHaveBeenCalledTimes(1);
    const request = vi.mocked(deps.upload).mock.calls[0]![0];
    expect(request).toMatchObject({
      path: pathFor(mediaId),
      contentType: "image/webp",
      accessToken: "token-1",
      stallTimeoutMs: UPLOAD_STALL_TIMEOUT_MS,
    });
    expect(deps.complete).toHaveBeenCalledWith(mediaId, 1);
    expect(item()).toMatchObject({
      stage: "uploaded",
      mediaId,
      progress: 1,
      uploadAttempts: 1,
      previewUrl: "blob:preview-1",
    });
    expect(events).toEqual([
      {
        type: "uploaded",
        localId: clientId(1),
        mediaId,
        category: "whole_plant",
      },
    ]);
    const snapshot = queue.getSnapshot();
    expect(snapshot.hasUnsent).toBe(false);
    expect(snapshot.batch).toEqual({ done: 1, total: 1 });
    expect(JSON.stringify(snapshot)).not.toContain(PATH_PREFIX);
  });

  it("waits for a category before reserving a slot", async () => {
    const { deps, queue, file, item, waitForStage } = setup();

    queue.add([{ file: file(), category: null }]);
    await waitForStage("needs_category");
    expect(deps.register).not.toHaveBeenCalled();
    expect(queue.getSnapshot().hasUnsent).toBe(true);

    expect(queue.setCategory(item().localId, "leaf")).toBe(true);
    await waitForStage("uploaded");
    expect(vi.mocked(deps.register).mock.calls[0]![0].category).toBe("leaf");
    // Once reserved, the category changes on the server instead.
    expect(queue.setCategory(item().localId, "flower")).toBe(false);
  });

  it("reports upload progress between 0 and 1", async () => {
    const held = heldUpload();
    const { queue, file, item, waitForStage } = setup({
      upload: held.upload,
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploading");
    expect(item().progress).toBe(0);
    held.pending[0]!.request.onProgress(0.4321);
    expect(item().progress).toBe(0.43);
    held.pending[0]!.settle({ ok: true });
    await waitForStage("uploaded");
  });
});

describe("upload queue: resume and idempotency", () => {
  it("re-sends the same bytes without re-registering after a failed upload", async () => {
    const results: StorageUploadResult[] = [
      { ok: false, kind: "retryable", status: 0 },
      { ok: true },
    ];
    const { deps, queue, sleeps, file, waitForStage } = setup({
      upload: vi.fn(async () => results.shift()!),
    });

    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploaded");

    expect(deps.register).toHaveBeenCalledTimes(1);
    expect(deps.upload).toHaveBeenCalledTimes(2);
    const [first, second] = vi
      .mocked(deps.upload)
      .mock.calls.map(([request]) => request);
    expect(second!.blob).toBe(first!.blob);
    expect(second!.path).toBe(first!.path);
    expect(sleeps).toEqual([500]);
    expect(deps.complete).toHaveBeenCalledWith(mediaIdFor(clientId(1)), 2);
  });

  it("confirms again without re-uploading after a failed confirmation", async () => {
    let calls = 0;
    const { deps, queue, file, waitForStage } = setup({
      complete: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw networkError();
        return { outcome: "existing" };
      }),
    });

    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploaded");
    expect(deps.register).toHaveBeenCalledTimes(1);
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.complete).mock.calls).toEqual([
      [mediaIdFor(clientId(1)), 1],
      [mediaIdFor(clientId(1)), 1],
    ]);
  });

  it("replays registration with the same client media ID", async () => {
    let calls = 0;
    const { deps, queue, file, waitForStage } = setup({
      register: vi.fn(async (body: RegisterMediaRequest) => {
        calls += 1;
        if (calls === 1) throw networkError();
        return { outcome: "existing" as const, media: mediaRecord(body) };
      }),
    });

    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploaded");
    const bodies = vi.mocked(deps.register).mock.calls.map(([body]) => body);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(deps.upload).toHaveBeenCalledTimes(1);
  });

  it("skips the upload when the replay finds the image already confirmed", async () => {
    const { deps, queue, file, waitForStage } = setup({
      register: vi.fn(async (body: RegisterMediaRequest) => ({
        outcome: "existing" as const,
        media: mediaRecord(body, "uploaded"),
      })),
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploaded");
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("re-uploads once on IMAGE_UPLOAD_INCOMPLETE and then confirms", async () => {
    let calls = 0;
    const { deps, queue, sleeps, file, waitForStage } = setup({
      complete: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw apiError("IMAGE_UPLOAD_INCOMPLETE", 409);
        return { outcome: "uploaded" };
      }),
    });

    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploaded");
    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.complete).mock.calls.map(([, n]) => n)).toEqual([
      1, 2,
    ]);
    expect(sleeps).toEqual([]);
  });

  it("stops for a manual retry when the object is still incomplete, then re-uploads", async () => {
    let incomplete = true;
    const { deps, queue, sleeps, events, file, item, waitForStage } = setup({
      complete: vi.fn(async () => {
        if (incomplete) throw apiError("IMAGE_UPLOAD_INCOMPLETE", 409);
        return { outcome: "uploaded" };
      }),
    });

    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("failed");
    expect(item().errorCode).toBe("IMAGE_UPLOAD_INCOMPLETE");
    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([]);
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "IMAGE_UPLOAD_INCOMPLETE",
    });

    incomplete = false;
    queue.retry(item().localId);
    await waitForStage("uploaded");
    expect(deps.upload).toHaveBeenCalledTimes(3);
    expect(deps.register).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.complete).mock.calls.at(-1)).toEqual([
      mediaIdFor(clientId(1)),
      3,
    ]);
  });
});

describe("upload queue: automatic retry", () => {
  it("uses full-jitter exponential backoff from 1 s up to 30 s", () => {
    const retries = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(retries.map((n) => backoffDelay(n, () => 0.999_999))).toEqual([
      999, 1999, 3999, 7999, 15_999, 29_999, 29_999, 29_999,
    ]);
    expect(retries.map((n) => backoffDelay(n, () => 0))).toEqual(
      retries.map(() => 0),
    );
    expect(backoffDelay(3, () => 0.25)).toBe(1000);
  });

  it("retries six times automatically, then waits for ลองใหม่ทั้งหมด", async () => {
    let failing = true;
    const { deps, queue, sleeps, events, file, item, waitForStage } = setup({
      upload: vi.fn(async (): Promise<StorageUploadResult> =>
        failing ? { ok: false, kind: "retryable", status: 0 } : { ok: true },
      ),
      random: () => 0.999_999,
    });

    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("failed");
    expect(MAX_AUTO_RETRIES).toBe(6);
    expect(sleeps).toEqual([999, 1999, 3999, 7999, 15_999, 29_999]);
    expect(deps.upload).toHaveBeenCalledTimes(7);
    expect(item()).toMatchObject({
      errorCode: "NETWORK",
      autoRetries: 6,
      retryAt: null,
    });
    expect(events.filter((event) => event.type === "retrying")).toHaveLength(6);
    expect(queue.getSnapshot().hasUnsent).toBe(true);

    failing = false;
    queue.retryAll();
    await waitForStage("uploaded");
    expect(deps.complete).toHaveBeenCalledWith(mediaIdFor(clientId(1)), 8);
  });

  it("retries now when the page comes back to the foreground", async () => {
    const results: StorageUploadResult[] = [
      { ok: false, kind: "retryable", status: 0 },
      { ok: true },
    ];
    const { deps, queue, env, file, item, waitForStage } = setup({
      upload: vi.fn(async () => results.shift()!),
      // A backoff that never ends on its own.
      sleep: vi.fn(() => new Promise<void>(() => undefined)),
    });

    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("failed_retryable");
    expect(item().retryAt).toBe(NOW + 500);
    env.becomeVisible();
    await waitForStage("uploaded");
    expect(deps.upload).toHaveBeenCalledTimes(2);
  });

  it("treats a stalled upload as retryable", async () => {
    const results: StorageUploadResult[] = [
      // uploadToStorage reports a stall as retryable with status 0.
      { ok: false, kind: "retryable", status: 0 },
      { ok: true },
    ];
    const { deps, queue, file, waitForStage } = setup({
      upload: vi.fn(async () => results.shift()!),
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploaded");
    expect(
      vi
        .mocked(deps.upload)
        .mock.calls.every(([request]) => request.stallTimeoutMs === 30_000),
    ).toBe(true);
  });
});

describe("upload queue: offline", () => {
  it("holds images while offline and sends them when the device reconnects", async () => {
    const { deps, queue, env, sleeps, file, item, waitForStage } = setup(
      {},
      { online: false },
    );

    queue.add([{ file: file(), category: "whole_plant" }]);
    await vi.waitFor(() => expect(item().waitingForNetwork).toBe(true));
    expect(item().stage).toBe("queued");
    expect(queue.getSnapshot().online).toBe(false);
    expect(deps.register).not.toHaveBeenCalled();

    env.goOnline();
    await waitForStage("uploaded");
    expect(deps.register).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    expect(item().autoRetries).toBe(0);
  });

  it("pauses an upload that loses the network without spending a retry", async () => {
    const held = heldUpload();
    const { deps, queue, env, sleeps, file, item, waitForStage } = setup({
      upload: held.upload,
    });

    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploading");
    env.goOffline();
    await vi.waitFor(() => expect(item().waitingForNetwork).toBe(true));
    expect(held.pending[0]!.request.signal.aborted).toBe(true);
    expect(item()).toMatchObject({ stage: "queued", autoRetries: 0 });
    expect(sleeps).toEqual([]);

    env.goOnline();
    await vi.waitFor(() => expect(held.pending).toHaveLength(2));
    expect(deps.register).toHaveBeenCalledTimes(1);
    held.pending[1]!.settle({ ok: true });
    await waitForStage("uploaded");
    expect(deps.complete).toHaveBeenCalledWith(mediaIdFor(clientId(1)), 2);
  });
});

describe("upload queue: refusals", () => {
  it.each([
    ["IMAGE_LIMIT_EXCEEDED", 409],
    ["INVALID_IMAGE_TYPE", 422],
    ["IMAGE_TOO_LARGE", 422],
    ["VALIDATION_FAILED", 422],
    ["IDEMPOTENCY_KEY_REUSE", 409],
  ])("rejects without retrying on %s", async (code, status) => {
    const { deps, queue, sleeps, events, file, item, waitForStage } = setup({
      register: vi.fn(async () => {
        throw apiError(code, status);
      }),
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("rejected");
    expect(item().errorCode).toBe(code);
    expect(deps.register).toHaveBeenCalledTimes(1);
    expect(deps.upload).not.toHaveBeenCalled();
    expect(sleeps).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: "rejected", code });
    expect(queue.getSnapshot().hasUnsent).toBe(false);
  });

  it.each([
    ["FORBIDDEN", 403],
    ["INVALID_STATUS_TRANSITION", 409],
  ])("blocks on %s and keeps the local preview", async (code, status) => {
    const { deps, queue, sleeps, file, item, waitForStage } = setup({
      register: vi.fn(async () => {
        throw apiError(code, status);
      }),
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("blocked");
    expect(item()).toMatchObject({
      errorCode: code,
      previewUrl: "blob:preview-1",
    });
    expect(deps.revokePreview).not.toHaveBeenCalled();
    expect(sleeps).toEqual([]);
  });

  it("blocks when Storage RLS refuses the object", async () => {
    const { deps, queue, file, item, waitForStage } = setup({
      upload: vi.fn(async (): Promise<StorageUploadResult> => ({
        ok: false,
        kind: "denied",
        status: 403,
      })),
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("blocked");
    expect(item().errorCode).toBe("FORBIDDEN");
    expect(item().previewUrl).toBe("blob:preview-1");
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("rejects a Storage size refusal and frees the reserved slot", async () => {
    const { deps, queue, events, file, waitForStage } = setup({
      upload: vi.fn(async (): Promise<StorageUploadResult> => ({
        ok: false,
        kind: "too_large",
        status: 413,
      })),
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("rejected");
    await vi.waitFor(() =>
      expect(deps.remove).toHaveBeenCalledWith(mediaIdFor(clientId(1))),
    );
    await vi.waitFor(() =>
      expect(events.at(-1)).toMatchObject({
        type: "rejected",
        code: "IMAGE_TOO_LARGE",
        mediaId: mediaIdFor(clientId(1)),
      }),
    );
  });

  it("rejects an image whose hash could not be computed", async () => {
    const { deps, queue, file, item, waitForStage } = setup({
      process: vi.fn(async () => processedImage({ sha256: null })),
    });
    queue.add([{ file: file(), category: "whole_plant" }]);
    await waitForStage("rejected");
    expect(item()).toMatchObject({
      errorCode: "IMAGE_PROCESSING_FAILED",
      previewUrl: null,
    });
    expect(deps.revokePreview).toHaveBeenCalledWith("blob:preview-1");
    expect(deps.register).not.toHaveBeenCalled();
  });

  it("rejects an image the pipeline refuses", async () => {
    const { deps, queue, file, item, waitForStage } = setup({
      process: vi.fn(
        async () =>
          new ImageProcessingError("INVALID_IMAGE_TYPE", "unsupported_type"),
      ),
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("rejected");
    expect(item().errorCode).toBe("INVALID_IMAGE_TYPE");
    expect(deps.register).not.toHaveBeenCalled();
  });

  it("classifies every failure into exactly one handling class", () => {
    expect(classifyUploadError("NETWORK")).toBe("retryable");
    expect(classifyUploadError("AUTH_REQUIRED")).toBe("failed");
    expect(classifyUploadError("IMAGE_UPLOAD_INCOMPLETE")).toBe("failed");
    expect(classifyUploadError("FORBIDDEN")).toBe("blocked");
    expect(classifyUploadError("INVALID_STATUS_TRANSITION")).toBe("blocked");
    expect(classifyUploadError("IMAGE_PROCESSING_FAILED")).toBe("rejected");
  });
});

describe("upload queue: authentication", () => {
  it("refreshes the session once after a Storage 401 and retries", async () => {
    const results: StorageUploadResult[] = [
      { ok: false, kind: "auth", status: 401 },
      { ok: true },
    ];
    const tokens = ["token-old", "token-new"];
    const { deps, queue, sleeps, file, waitForStage } = setup({
      upload: vi.fn(async () => results.shift()!),
      getAccessToken: vi.fn(async () => tokens.shift() ?? "token-new"),
    });

    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploaded");
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(deps.upload).mock.calls.map(([request]) => request.accessToken),
    ).toEqual(["token-old", "token-new"]);
    expect(sleeps).toEqual([]);
    expect(deps.complete).toHaveBeenCalledWith(mediaIdFor(clientId(1)), 2);
  });

  it("stops with AUTH_REQUIRED when the refreshed session is still refused", async () => {
    const { deps, queue, file, item, waitForStage } = setup({
      upload: vi.fn(async (): Promise<StorageUploadResult> => ({
        ok: false,
        kind: "auth",
        status: 401,
      })),
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("failed");
    expect(item().errorCode).toBe("AUTH_REQUIRED");
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
    expect(deps.upload).toHaveBeenCalledTimes(2);
  });

  it("refreshes once when an API route answers AUTH_REQUIRED", async () => {
    let calls = 0;
    const { deps, queue, file, waitForStage } = setup({
      register: vi.fn(async (body: RegisterMediaRequest) => {
        calls += 1;
        if (calls === 1) throw apiError("AUTH_REQUIRED", 401);
        return { outcome: "created" as const, media: mediaRecord(body) };
      }),
    });
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploaded");
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
    expect(deps.register).toHaveBeenCalledTimes(2);
  });
});

describe("upload queue: cancel and ordering", () => {
  it("aborts an in-flight upload and deletes the pending server row", async () => {
    const held = heldUpload();
    const { deps, queue, events, file, waitForStage } = setup({
      upload: held.upload,
    });

    const [id] = queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploading");
    queue.cancel(id!);
    expect(queue.getSnapshot().items[0]!.stage).toBe("cancelling");

    await vi.waitFor(() => expect(queue.getSnapshot().items).toHaveLength(0));
    expect(held.pending[0]!.request.signal.aborted).toBe(true);
    expect(deps.remove).toHaveBeenCalledWith(mediaIdFor(clientId(1)));
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.revokePreview).toHaveBeenCalledWith("blob:preview-1");
    expect(events.at(-1)).toEqual({
      type: "removed",
      localId: id,
      mediaId: mediaIdFor(clientId(1)),
    });
    expect(queue.getSnapshot().hasUnsent).toBe(false);
  });

  it("drops an image that never reserved a slot without calling the server", async () => {
    const { deps, queue, file, item, waitForStage } = setup();
    queue.add([{ file: file(), category: null }]);
    await waitForStage("needs_category");
    queue.cancel(item().localId);
    expect(queue.getSnapshot().items).toHaveLength(0);
    expect(deps.remove).not.toHaveBeenCalled();
    expect(deps.register).not.toHaveBeenCalled();
  });

  it("processes and sends one image at a time, in order", async () => {
    let processing = 0;
    let maxProcessing = 0;
    let network = 0;
    let maxNetwork = 0;
    const order: string[] = [];
    const track = async <T>(label: string, work: () => Promise<T>) => {
      network += 1;
      maxNetwork = Math.max(maxNetwork, network);
      order.push(label);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return await work();
      } finally {
        network -= 1;
      }
    };
    let processed = 0;
    const { queue, file, waitForStage } = setup({
      process: vi.fn(async () => {
        processing += 1;
        maxProcessing = Math.max(maxProcessing, processing);
        await new Promise((resolve) => setTimeout(resolve, 1));
        processing -= 1;
        processed += 1;
        return processedImage({}, String(processed));
      }),
      register: vi.fn((body: RegisterMediaRequest) =>
        track(`register:${body.clientMediaId.slice(-1)}`, async () => ({
          outcome: "created" as const,
          media: mediaRecord(body),
        })),
      ),
      upload: vi.fn((request: UploadRequest) =>
        track(`upload:${request.path.slice(-6, -5)}`, async () => ({
          ok: true as const,
        })),
      ),
      complete: vi.fn((mediaId: string) =>
        track(`complete:${mediaId.slice(-1)}`, async () => ({})),
      ),
    });

    queue.add([
      { file: file("a"), category: "whole_plant" },
      { file: file("b"), category: "leaf" },
      { file: file("c"), category: "flower" },
    ]);
    await waitForStage("uploaded", 2);
    await waitForStage("uploaded", 0);
    await waitForStage("uploaded", 1);

    expect(maxProcessing).toBe(1);
    expect(maxNetwork).toBe(1);
    expect(order).toEqual([
      "register:1",
      "upload:1",
      "complete:1",
      "register:2",
      "upload:2",
      "complete:2",
      "register:3",
      "upload:3",
      "complete:3",
    ]);
    expect(queue.getSnapshot().batch).toEqual({ done: 3, total: 3 });
  });

  it("forgets a settled image and releases its preview", async () => {
    const { deps, queue, file, item, waitForStage } = setup();
    queue.add([{ file: file(), category: "leaf" }]);
    await waitForStage("uploaded");
    queue.forget(item().localId);
    expect(queue.getSnapshot().items).toHaveLength(0);
    expect(deps.revokePreview).toHaveBeenCalledWith("blob:preview-1");
  });
});

const listBase: Omit<MediaListView, "items"> = {
  observationId: "81000000-0000-4000-8000-000000009001",
  permissions: { canEdit: true, blockedCode: null, blockedReason: null },
  limits: { maxImages: 10, remaining: 9 },
  summary: { uploadedCount: 1, pendingCount: 0, hasWholePlant: true },
  refreshedAt: "2026-09-19T03:00:00Z",
};

function viewItem(
  signedUrl: string | null,
  expiresAt: string | null,
): MediaListView["items"][number] {
  return {
    id: "91000000-0000-4000-8000-000000000001",
    clientMediaId: clientId(1),
    position: 1,
    category: "whole_plant",
    status: "uploaded",
    mimeType: "image/webp",
    byteSize: 400_000,
    width: 1536,
    height: 2048,
    capturedAt: "2026-09-19T03:00:00Z",
    uploadedAt: "2026-09-19T03:00:05Z",
    submitted: false,
    signedUrl,
    expiresAt,
  };
}

describe("signed URL reuse", () => {
  const url = (token: string) =>
    `https://storage.example.test/object/sign/x?token=${token}`;

  it("keeps an image's URL until a minute before it expires", () => {
    const previous = {
      ...listBase,
      items: [viewItem(url("old"), "2026-09-19T03:10:00.000Z")],
    };
    const next = {
      ...listBase,
      items: [viewItem(url("new"), "2026-09-19T03:15:00.000Z")],
    };

    const early = keepFreshSignedUrls(
      previous,
      next,
      Date.parse("2026-09-19T03:08:59.000Z"),
    );
    expect(early.items[0]!.signedUrl).toBe(url("old"));

    const late = keepFreshSignedUrls(
      previous,
      next,
      Date.parse("2026-09-19T03:09:00.000Z"),
    );
    expect(late.items[0]!.signedUrl).toBe(url("new"));
    expect(late.items[0]!.expiresAt).toBe("2026-09-19T03:15:00.000Z");
  });

  it("never carries an old URL onto an item that has none", () => {
    const previous = {
      ...listBase,
      items: [viewItem(url("old"), "2026-09-19T03:10:00.000Z")],
    };
    const dropped = withoutSignedUrl(previous, previous.items[0]!.id)!;
    expect(dropped.items[0]!.signedUrl).toBeNull();
    const next = { ...listBase, items: [viewItem(null, null)] };
    expect(keepFreshSignedUrls(previous, next, NOW).items[0]!.signedUrl).toBe(
      null,
    );
    const refreshed = keepFreshSignedUrls(
      dropped,
      { ...listBase, items: [viewItem(url("new"), "2026-09-19T03:20:00Z")] },
      NOW,
    );
    expect(refreshed.items[0]!.signedUrl).toBe(url("new"));
  });
});

describe("media tiles", () => {
  it("merges server rows with local images and counts claimed slots", () => {
    const local: UploadItem[] = [
      {
        localId: clientId(1),
        stage: "uploading",
        category: "whole_plant",
        capturedAt: "2026-09-19T03:00:00.000Z",
        previewUrl: "blob:preview-1",
        width: 1536,
        height: 2048,
        byteSize: 400_000,
        mediaId: "91000000-0000-4000-8000-000000000001",
        progress: 0.42,
        uploadAttempts: 1,
        autoRetries: 0,
        retryAt: null,
        errorCode: null,
        waitingForNetwork: false,
      },
      {
        localId: clientId(2),
        stage: "rejected",
        category: "leaf",
        capturedAt: "2026-09-19T03:00:00.000Z",
        previewUrl: null,
        width: null,
        height: null,
        byteSize: null,
        mediaId: null,
        progress: 0,
        uploadAttempts: 0,
        autoRetries: 0,
        retryAt: null,
        errorCode: "INVALID_IMAGE_TYPE",
        waitingForNetwork: false,
      },
    ];
    const server = [
      { ...viewItem(null, null), status: "pending" as const },
      {
        ...viewItem(null, null),
        id: "91000000-0000-4000-8000-000000000009",
        clientMediaId: clientId(9),
        status: "pending" as const,
        category: "leaf" as const,
      },
    ];

    const summary = buildMediaTiles(server, local);
    expect(summary.tiles.map((tile) => tile.state)).toEqual([
      "uploading",
      "retake",
      "rejected",
    ]);
    expect(summary.tiles[0]!.progress).toBe(0.42);
    expect(summary.used).toBe(2);
    expect(summary.uploadedWholePlantCount).toBe(0);
  });
});
