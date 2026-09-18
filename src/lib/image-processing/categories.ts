import { z } from "zod";

import {
  IMAGE_CATEGORIES,
  MAX_IMAGES_PER_OBSERVATION,
  REQUIRED_IMAGE_CATEGORY,
  type ImageCategory,
} from "./constants";

export const imageCategorySchema = z.enum(IMAGE_CATEGORIES);

/** One image slot in an observation (`observation_media.position`, `category`). */
export const imageSlotSchema = z.object({
  position: z.number().int().min(1).max(MAX_IMAGES_PER_OBSERVATION),
  category: imageCategorySchema,
});

export type ImageSlot = z.infer<typeof imageSlotSchema>;

export type ImageSetIssue =
  /** More than ten images. */
  | { code: "IMAGE_LIMIT_EXCEEDED"; count: number }
  /** An unknown category or a position outside 1–10. */
  | { code: "VALIDATION_FAILED"; reason: "invalid_slot"; index: number }
  /** Two images share a position. */
  | {
      code: "VALIDATION_FAILED";
      reason: "duplicate_position";
      position: number;
    }
  /** Submission needs at least one whole-plant image. */
  | { code: "VALIDATION_FAILED"; reason: "whole_plant_required" };

export type ImageSetValidation =
  { ok: true; slots: ImageSlot[] } | { ok: false; issue: ImageSetIssue };

/**
 * Validates an observation's image slots (OBS-005, D-021). Drafts may be
 * incomplete; `forSubmission` also requires a `whole_plant` image. The
 * database constraints remain authoritative; this gives early feedback.
 */
export function validateImageSet(
  slots: readonly unknown[],
  { forSubmission = false }: { forSubmission?: boolean } = {},
): ImageSetValidation {
  if (slots.length > MAX_IMAGES_PER_OBSERVATION) {
    return {
      ok: false,
      issue: { code: "IMAGE_LIMIT_EXCEEDED", count: slots.length },
    };
  }
  const parsed: ImageSlot[] = [];
  const positions = new Set<number>();
  for (const [index, slot] of slots.entries()) {
    const result = imageSlotSchema.safeParse(slot);
    if (!result.success) {
      return {
        ok: false,
        issue: { code: "VALIDATION_FAILED", reason: "invalid_slot", index },
      };
    }
    if (positions.has(result.data.position)) {
      return {
        ok: false,
        issue: {
          code: "VALIDATION_FAILED",
          reason: "duplicate_position",
          position: result.data.position,
        },
      };
    }
    positions.add(result.data.position);
    parsed.push(result.data);
  }
  if (
    forSubmission &&
    !parsed.some((slot) => slot.category === REQUIRED_IMAGE_CATEGORY)
  ) {
    return {
      ok: false,
      issue: { code: "VALIDATION_FAILED", reason: "whole_plant_required" },
    };
  }
  return { ok: true, slots: parsed };
}

/** True while another image can be added (fewer than ten). */
export function canAddImage(currentCount: number): boolean {
  return currentCount < MAX_IMAGES_PER_OBSERVATION;
}

/** Lowest free position 1–10, or null when all ten are used. */
export function nextFreePosition(
  slots: readonly Pick<ImageSlot, "position">[],
): number | null {
  const used = new Set(slots.map((slot) => slot.position));
  for (
    let position = 1;
    position <= MAX_IMAGES_PER_OBSERVATION;
    position += 1
  ) {
    if (!used.has(position)) return position;
  }
  return null;
}

export function isImageCategory(value: unknown): value is ImageCategory {
  return imageCategorySchema.safeParse(value).success;
}
