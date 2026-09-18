import { getBrowserEnvironment } from "@/lib/env/browser";
import { processImage, revokePreviewUrl } from "@/lib/image-processing";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import {
  completeMediaRequest,
  deleteMediaRequest,
  registerMediaRequest,
} from "./api";
import { uploadToStorage } from "./storage-upload";
import {
  createUploadQueue,
  defaultSleep,
  type UploadQueue,
  type UploadQueueDeps,
  type UploadQueueEnvironment,
} from "./upload-queue";

/**
 * Real queue dependencies for one observation. Nothing touches the browser
 * environment or Supabase until an image is actually sent.
 */
export function createBrowserUploadDeps(
  observationId: string,
): UploadQueueDeps {
  let client: ReturnType<typeof createSupabaseBrowserClient> | undefined;
  const supabase = () => (client ??= createSupabaseBrowserClient());

  return {
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
 * across client-side navigation. A reload still loses unsent images (memory
 * only until IndexedDB in P14).
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
    queue = createUploadQueue(createBrowserUploadDeps(observationId));
    queues.set(observationId, queue);
  }
  return queue;
}
