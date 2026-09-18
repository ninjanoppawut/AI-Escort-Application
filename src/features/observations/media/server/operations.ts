import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  OBSERVATION_IMAGES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  mediaListRecordSchema,
  type MediaCategory,
  type MediaListView,
  type RegisterMediaRequest,
} from "../contracts";
import { mapPostgresMediaError } from "../errors";
import {
  interpretMediaRow,
  mediaFailure,
  type MediaOperationResult,
} from "../results";

type Client = SupabaseClient<Database>;

export async function registerMedia(
  supabase: Client,
  observationId: string,
  input: RegisterMediaRequest,
) {
  const { data, error } = await supabase.rpc("register_observation_media", {
    target_observation_id: observationId,
    target_client_media_id: input.clientMediaId,
    media_category: input.category,
    media_mime_type: input.mimeType,
    media_byte_size: input.byteSize,
    media_width: input.width,
    media_height: input.height,
    media_hash: input.sha256,
    media_preprocessing_version: input.preprocessingVersion,
    media_captured_at: input.capturedAt,
  });
  if (error) return mediaFailure(mapPostgresMediaError(error.message));
  return interpretMediaRow(data?.[0], ["created", "existing"]);
}

export async function completeMedia(
  supabase: Client,
  observationId: string,
  mediaId: string,
  attemptCount: number,
) {
  const { data, error } = await supabase.rpc(
    "complete_observation_media_upload",
    {
      target_observation_id: observationId,
      target_media_id: mediaId,
      attempt_count: attemptCount,
    },
  );
  if (error) return mediaFailure(mapPostgresMediaError(error.message));
  return interpretMediaRow(data?.[0], ["uploaded", "existing"]);
}

export async function updateMediaCategory(
  supabase: Client,
  observationId: string,
  mediaId: string,
  category: MediaCategory,
) {
  const { data, error } = await supabase.rpc(
    "update_observation_media_category",
    {
      target_observation_id: observationId,
      target_media_id: mediaId,
      media_category: category,
    },
  );
  if (error) return mediaFailure(mapPostgresMediaError(error.message));
  return interpretMediaRow(data?.[0], ["updated", "unchanged"]);
}

/**
 * Withdraws the row, removes the object with the owner's session (which the
 * Storage delete policy allows only for a withdrawn row), then finalizes.
 * A failed removal leaves the row withdrawn so a retry can finish it.
 */
export async function deleteMedia(
  supabase: Client,
  observationId: string,
  mediaId: string,
): Promise<MediaOperationResult<{ outcome: "deleted" | "deleting" }>> {
  const call = async () => {
    const { data, error } = await supabase.rpc("delete_observation_media", {
      target_observation_id: observationId,
      target_media_id: mediaId,
    });
    if (error) return mediaFailure(mapPostgresMediaError(error.message));
    return interpretMediaRow(data?.[0], ["deleting", "deleted"]);
  };

  const first = await call();
  if (first.error) return first;
  if (first.data.outcome === "deleted" || !first.data.media) {
    return { data: { outcome: "deleted" } };
  }

  const removal = await supabase.storage
    .from(OBSERVATION_IMAGES_BUCKET)
    .remove([first.data.media.upload.path]);
  if (removal.error) return { data: { outcome: "deleting" } };

  const second = await call();
  if (second.error) return second;
  return {
    data: {
      outcome: second.data.outcome === "deleted" ? "deleted" : "deleting",
    },
  };
}

/** Lists the owner's images and signs uploaded ones with the owner's session. */
export async function listMedia(
  supabase: Client,
  observationId: string,
): Promise<MediaOperationResult<MediaListView>> {
  const { data, error } = await supabase.rpc("list_observation_media", {
    target_observation_id: observationId,
  });
  if (error) return mediaFailure(mapPostgresMediaError(error.message));
  const parsed = mediaListRecordSchema.safeParse(data);
  if (!parsed.success) return mediaFailure("FORBIDDEN");
  const list = parsed.data;

  const uploaded = list.items.filter((item) => item.status === "uploaded");
  const signed = new Map<string, string>();
  if (uploaded.length > 0) {
    const { data: urls } = await supabase.storage
      .from(OBSERVATION_IMAGES_BUCKET)
      .createSignedUrls(
        uploaded.map((item) => item.upload.path),
        SIGNED_URL_TTL_SECONDS,
      );
    for (const entry of urls ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) {
        signed.set(entry.path, entry.signedUrl);
      }
    }
  }
  const expiresAt = new Date(
    Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  ).toISOString();

  return {
    data: {
      observationId: list.observationId,
      permissions: list.permissions,
      limits: list.limits,
      summary: list.summary,
      refreshedAt: list.refreshedAt,
      items: list.items.map(({ upload, ...item }) => {
        const signedUrl = signed.get(upload.path) ?? null;
        return { ...item, signedUrl, expiresAt: signedUrl ? expiresAt : null };
      }),
    },
  };
}
