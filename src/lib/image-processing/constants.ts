/**
 * Client image pipeline limits (OBS-005, OBS-006, D-021, PRD §16).
 *
 * Every processed image is re-encoded, so no source EXIF/GPS/device metadata
 * survives. Capture time is stored separately on the observation and is never
 * read back from image metadata.
 */

/** Longest edge of a processed image (AGENTS.md, D-021). */
export const MAX_EDGE_PX = 2048;

/** Maximum processed image size: 5 MB (matches `observation_media.byte_size`). */
export const MAX_OUTPUT_BYTES = 5_242_880;

/** Reject sources larger than this before decoding (memory guard). */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** Reject decoded sources with more pixels than this (decompression-bomb guard). */
export const MAX_SOURCE_PIXELS = 64_000_000;

/** iOS Safari canvas area ceiling; every intermediate canvas stays at or below it. */
export const MAX_CANVAS_PIXELS = 16_777_216;

/** Encoder quality steps, highest first. Never below 0.82 (D-021: 82–85). */
export const QUALITY_STEPS = [0.85, 0.82] as const;

/** Dimension multiplier applied when every quality step is still over budget. */
export const DIMENSION_STEP = 0.85;

/** Total encoder calls allowed per image before failing with IMAGE_TOO_LARGE. */
export const MAX_ENCODE_ATTEMPTS = 6;

/** Stored with each media row so later pipeline changes are distinguishable. */
export const PREPROCESSING_VERSION = "img-v1";

export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

/** Formats the encoder may produce. WebP is preferred; JPEG is the fallback. */
export type OutputMimeType = "image/webp" | "image/jpeg";

/** `accept` attribute for file inputs. The real check is `sniffImageType`. */
export const IMAGE_INPUT_ACCEPT = ACCEPTED_MIME_TYPES.join(",");

/** Images per observation (OBS-005, D-021). */
export const MIN_IMAGES_PER_OBSERVATION = 1;
export const MAX_IMAGES_PER_OBSERVATION = 10;

/** Image categories (DATABASE_DESIGN §9, API_AND_REALTIME §14). */
export const IMAGE_CATEGORIES = [
  "whole_plant",
  "leaf",
  "leaf_underside",
  "stem_trunk",
  "flower",
  "fruit",
  "habitat",
  "other",
] as const;

export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

/** The category every observation needs at least once before submission. */
export const REQUIRED_IMAGE_CATEGORY: ImageCategory = "whole_plant";

/** Thai-first labels for category pickers. */
export const IMAGE_CATEGORY_LABELS_TH: Readonly<Record<ImageCategory, string>> =
  {
    whole_plant: "ทั้งต้น",
    leaf: "ใบ",
    leaf_underside: "ใบด้านล่าง",
    stem_trunk: "ลำต้น/เปลือก",
    flower: "ดอก",
    fruit: "ผล",
    habitat: "ถิ่นที่อยู่",
    other: "อื่น ๆ",
  };
