import { getBrowserEnvironment } from "@/lib/env/browser";
import {
  deleteLocal,
  listLocal,
  localStoreAvailable,
  putLocal,
} from "@/lib/offline/local-store";
import { processImage, revokePreviewUrl } from "@/lib/image-processing";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/telemetry/report-error";

import {
  completeMediaRequest,
  deleteMediaRequest,
  registerMediaRequest,
} from "./api";
import { uploadToStorage } from "./storage-upload";
import {
  createUploadQueue,
  defaultSleep,
  type PersistedUpload,
  type UploadPersistence,
  type UploadQueue,
  type UploadQueueDeps,
  type UploadQueueEnvironment,
} from "./upload-queue";

/** The signed-in user, so device records never cross accounts. */
async function currentUserId(
  supabase: () => ReturnType<typeof createSupabaseBrowserClient>,
) {
  try {
    const { data } = await supabase().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Stored form of one unsent image. Bytes are an ArrayBuffer, not a Blob:
 * every engine clones ArrayBuffers into IndexedDB, while Blob storage has
 * failed on some mobile Safari versions.
 */
export interface DeviceUpload extends Omit<PersistedUpload, "processed"> {
  processed: Omit<PersistedUpload["processed"], "blob"> & {
    bytes: ArrayBuffer;
  };
}

/** Blob bytes; FileReader covers engines without Blob.arrayBuffer. */
export function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function toDeviceUpload(
  record: PersistedUpload,
): Promise<DeviceUpload> {
  const { blob, ...processed } = record.processed;
  return {
    ...record,
    processed: { ...processed, bytes: await blobBytes(blob) },
  };
}

export function fromDeviceUpload(record: DeviceUpload): PersistedUpload {
  const { bytes, ...processed } = record.processed;
  return {
    ...record,
    processed: {
      ...processed,
      blob: new Blob([bytes], { type: processed.mimeType }),
    },
  };
}

/** IndexedDB copy of each unsent image for one observation (P14-01). */
export function createDeviceUploadPersistence(
  observationId: string,
  userId: () => Promise<string | null>,
): UploadPersistence | undefined {
  if (!localStoreAvailable()) return undefined;
  return {
    async save(record) {
      const owner = await userId();
      if (!owner) return;
      await putLocal<DeviceUpload>("uploads", {
        key: record.localId,
        scope: observationId,
        userId: owner,
        updatedAt: Date.now(),
        value: await toDeviceUpload(record),
      });
    },
    remove: (localId) => deleteLocal("uploads", localId),
  };
}

export async function loadDeviceUploads(
  observationId: string,
  userId: () => Promise<string | null>,
): Promise<PersistedUpload[]> {
  if (!localStoreAvailable()) return [];
  const owner = await userId();
  if (!owner) return [];
  try {
    const records = await listLocal<DeviceUpload>(
      "uploads",
      owner,
      observationId,
    );
    return records.map((record) => fromDeviceUpload(record.value));
  } catch {
    return [];
  }
}

/**
 * Real queue dependencies for one observation. Nothing touches the browser
 * environment or Supabase until an image is actually sent.
 */
export function createBrowserUploadDeps(
  observationId: string,
): UploadQueueDeps {
  let client: ReturnType<typeof createSupabaseBrowserClient> | undefined;
  const supabase = () => (client ??= createSupabaseBrowserClient());
  const persistence =
    typeof window === "undefined"
      ? undefined
      : createDeviceUploadPersistence(observationId, () =>
          currentUserId(supabase),
        );

  return {
    ...(persistence ? { persistence } : {}),
    process: (file) => processImage(file),
    register: (body) => registerMediaRequest(observationId, body),
    upload: (request) => {
      const environment = getBrowserEnvironment();
      return uploadToStorage({
        ...request,
        supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
        publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      });
    },
    complete: (mediaId, attemptCount) =>
      completeMediaRequest(observationId, mediaId, attemptCount),
    remove: (mediaId) => deleteMediaRequest(observationId, mediaId),
    getAccessToken: async () => {
      const { data } = await supabase().auth.getSession();
      return data.session?.access_token ?? null;
    },
    refreshAuth: async () => {
      const { data, error } = await supabase().auth.refreshSession();
      return !error && Boolean(data.session);
    },
    revokePreview: revokePreviewUrl,
    now: () => Date.now(),
    random: () => Math.random(),
    sleep: defaultSleep,
    createId: () => crypto.randomUUID(),
  };
}

const SERVER_ENVIRONMENT: UploadQueueEnvironment = {
  isOnline: () => true,
  listen: () => () => undefined,
};

const queues = new Map<string, UploadQueue>();

/**
 * One queue per observation for the life of the tab, so uploads keep going
 * across client-side navigation. Unsent images are also kept in IndexedDB
 * and resumed here after a reload or browser restart (P14-01).
 */
export function getObservationUploadQueue(observationId: string): UploadQueue {
  if (typeof window === "undefined") {
    // Server render: an inert, unshared queue that only yields its snapshot.
    return createUploadQueue(
      createBrowserUploadDeps(observationId),
      SERVER_ENVIRONMENT,
    );
  }
  let queue = queues.get(observationId);
  if (!queue) {
    const created = createUploadQueue(createBrowserUploadDeps(observationId));
    queue = created;
    queues.set(observationId, created);
    // Upload failures happen browser-to-Storage and never reach the server,
    // so they are reported to the admin error explorer (P15-03).
    created.onEvent((event) => {
      if (
        event.type === "failed" ||
        event.type === "blocked" ||
        event.type === "rejected"
      ) {
        reportClientError({
          flow: "upload",
          stage: `upload_${event.type}`,
          code: event.code,
          severity: event.type === "failed" ? "error" : "warning",
        });
      }
    });
    // The client is created lazily so a render never throws on it.
    void loadDeviceUploads(observationId, () =>
      currentUserId(createSupabaseBrowserClient),
    ).then((records) => created.restore(records));
  }
  return queue;
}
