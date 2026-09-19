import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  OBSERVATION_IMAGES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "@/features/observations/media/contracts";
import { mapPostgresReviewError } from "@/features/observations/review/errors";
import {
  reviewFailure,
  type ReviewOperationResult,
} from "@/features/observations/review/results";
import type { Database } from "@/lib/supabase/database.types";

import {
  completedMapRecordSchema,
  mapDetailRecordSchema,
  type CompletedMapView,
  type MapDetailView,
} from "../contracts";

type Client = SupabaseClient<Database>;

/** Signs private image paths with the viewer's session; RLS decides access. */
async function signPaths(supabase: Client, paths: string[]) {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return signed;
  const { data } = await supabase.storage
    .from(OBSERVATION_IMAGES_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) {
      signed.set(entry.path, entry.signedUrl);
    }
  }
  return signed;
}

export async function getCompletedMap(
  supabase: Client,
  sessionId: string,
): Promise<ReviewOperationResult<CompletedMapView>> {
  const { data, error } = await supabase.rpc("get_session_completed_map", {
    target_session_id: sessionId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = completedMapRecordSchema.safeParse(data);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const record = parsed.data;
  if (!record.available) return { data: record };

  const signed = await signPaths(
    supabase,
    record.items.flatMap((item) =>
      item.thumbnailPath ? [item.thumbnailPath] : [],
    ),
  );
  return {
    data: {
      ...record,
      items: record.items.map(({ thumbnailPath, ...item }) => ({
        ...item,
        thumbnailUrl: thumbnailPath
          ? (signed.get(thumbnailPath) ?? null)
          : null,
      })),
    },
  };
}

export async function getMapDetail(
  supabase: Client,
  observationId: string,
): Promise<ReviewOperationResult<MapDetailView>> {
  const { data, error } = await supabase.rpc("get_observation_map_detail", {
    target_observation_id: observationId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = mapDetailRecordSchema.safeParse(data);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const record = parsed.data;
  const signed = await signPaths(
    supabase,
    record.media.map((media) => media.storagePath),
  );
  return {
    data: {
      ...record,
      media: record.media.map(({ storagePath, ...media }) => ({
        ...media,
        signedUrl: signed.get(storagePath) ?? null,
      })),
    },
  };
}
