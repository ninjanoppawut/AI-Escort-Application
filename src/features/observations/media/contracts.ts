import { z } from "zod";

// P9 observation images (API_AND_REALTIME.md §14; DATABASE_DESIGN.md §9).
export const OBSERVATION_IMAGES_BUCKET = "observation-images";
export const MAX_IMAGES_PER_OBSERVATION = 10;
export const MAX_IMAGE_BYTES = 5_242_880;
export const MAX_IMAGE_EDGE_PX = 2048;
/** Signed display URLs live briefly and are re-signed on demand. */
export const SIGNED_URL_TTL_SECONDS = 600;

export const MEDIA_CATEGORIES = [
  "whole_plant",
  "leaf",
  "leaf_underside",
  "stem_trunk",
  "flower",
  "fruit",
  "habitat",
  "other",
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  whole_plant: "ทั้งต้น",
  leaf: "ใบ",
  leaf_underside: "ใบด้านล่าง",
  stem_trunk: "ลำต้น/เปลือก",
  flower: "ดอก",
  fruit: "ผล",
  habitat: "ถิ่นที่อยู่",
  other: "อื่น ๆ",
};

export const MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const mediaCategorySchema = z.enum(MEDIA_CATEGORIES);

export const registerMediaRequestSchema = z
  .object({
    clientMediaId: z.uuid(),
    category: mediaCategorySchema,
    mimeType: z.enum(MEDIA_MIME_TYPES),
    byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
    width: z.number().int().min(1).max(MAX_IMAGE_EDGE_PX),
    height: z.number().int().min(1).max(MAX_IMAGE_EDGE_PX),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    preprocessingVersion: z.string().regex(/^img-v[0-9]+$/),
    capturedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type RegisterMediaRequest = z.infer<typeof registerMediaRequestSchema>;

export const completeMediaRequestSchema = z
  .object({ attemptCount: z.number().int().min(1).max(50) })
  .strict();

export const updateMediaCategoryRequestSchema = z
  .object({ category: mediaCategorySchema })
  .strict();

export const mediaParamsSchema = z.object({
  id: z.uuid(),
  mediaId: z.uuid(),
});

const mediaStatusSchema = z.enum(["pending", "uploaded", "deleting"]);

/** The RPC payload for one image, including the owner's upload target. */
export const mediaRecordSchema = z
  .object({
    id: z.uuid(),
    clientMediaId: z.uuid(),
    position: z.number().int().min(1).max(MAX_IMAGES_PER_OBSERVATION),
    category: mediaCategorySchema,
    status: mediaStatusSchema,
    mimeType: z.enum(MEDIA_MIME_TYPES),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    capturedAt: z.string(),
    uploadedAt: z.string().nullable(),
    upload: z
      .object({
        bucket: z.literal(OBSERVATION_IMAGES_BUCKET),
        path: z.string().min(1),
        contentType: z.enum(MEDIA_MIME_TYPES),
      })
      .strict(),
  })
  .strict();

export type MediaRecord = z.infer<typeof mediaRecordSchema>;

export const mediaRowSchema = z.object({
  outcome: z.enum([
    "created",
    "existing",
    "uploaded",
    "updated",
    "unchanged",
    "deleting",
    "deleted",
    "denied",
  ]),
  error_code: z.string().nullable(),
  error_details: z.unknown().nullable(),
  media: z.unknown().nullable(),
});

export const mediaListRecordSchema = z
  .object({
    observationId: z.uuid(),
    permissions: z
      .object({
        canEdit: z.boolean(),
        blockedCode: z.string().nullable(),
        blockedReason: z.string().nullable(),
      })
      .strict(),
    limits: z
      .object({
        maxImages: z.number().int(),
        remaining: z.number().int().min(0),
      })
      .strict(),
    summary: z
      .object({
        uploadedCount: z.number().int().min(0),
        pendingCount: z.number().int().min(0),
        hasWholePlant: z.boolean(),
      })
      .strict(),
    items: z.array(mediaRecordSchema),
    refreshedAt: z.string(),
  })
  .strict();

/** What the browser receives for one image: never a storage path. */
export const mediaItemViewSchema = mediaRecordSchema
  .omit({ upload: true })
  .extend({
    signedUrl: z.string().url().nullable(),
    expiresAt: z.string().nullable(),
  })
  .strict();

export type MediaItemView = z.infer<typeof mediaItemViewSchema>;

export const mediaListViewSchema = mediaListRecordSchema
  .omit({ items: true })
  .extend({ items: z.array(mediaItemViewSchema) })
  .strict();

export type MediaListView = z.infer<typeof mediaListViewSchema>;

export const mediaQueryKeys = {
  list: (observationId: string) =>
    ["observations", "media", observationId] as const,
};
