import { describe, expect, it } from "vitest";

import {
  canAddImage,
  imageCategorySchema,
  isImageCategory,
  nextFreePosition,
  validateImageSet,
} from "./categories";
import {
  ACCEPTED_MIME_TYPES,
  IMAGE_CATEGORIES,
  IMAGE_CATEGORY_LABELS_TH,
} from "./constants";

describe("image categories", () => {
  it("match the database check constraint and have Thai labels", () => {
    expect(IMAGE_CATEGORIES).toEqual([
      "whole_plant",
      "leaf",
      "leaf_underside",
      "stem_trunk",
      "flower",
      "fruit",
      "habitat",
      "other",
    ]);
    expect(Object.keys(IMAGE_CATEGORY_LABELS_TH)).toEqual([
      ...IMAGE_CATEGORIES,
    ]);
    expect(IMAGE_CATEGORY_LABELS_TH.whole_plant).toBe("ทั้งต้น");
    expect(IMAGE_CATEGORY_LABELS_TH.stem_trunk).toBe("ลำต้น/เปลือก");
  });

  it("accept only the three documented MIME types", () => {
    expect(ACCEPTED_MIME_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("reject unknown categories", () => {
    expect(isImageCategory("leaf")).toBe(true);
    expect(isImageCategory("root")).toBe(false);
    expect(isImageCategory("WHOLE_PLANT")).toBe(false);
    expect(imageCategorySchema.safeParse(undefined).success).toBe(false);
  });
});

describe("validateImageSet", () => {
  const slot = (position: number, category = "leaf") => ({
    position,
    category,
  });

  it("allows an incomplete draft without a whole-plant image", () => {
    expect(validateImageSet([])).toEqual({ ok: true, slots: [] });
    expect(validateImageSet([slot(1)])).toMatchObject({ ok: true });
  });

  it("requires a whole-plant image for submission", () => {
    expect(validateImageSet([slot(1)], { forSubmission: true })).toEqual({
      ok: false,
      issue: { code: "VALIDATION_FAILED", reason: "whole_plant_required" },
    });
    expect(validateImageSet([], { forSubmission: true })).toMatchObject({
      ok: false,
    });
    expect(
      validateImageSet([slot(1), slot(2, "whole_plant")], {
        forSubmission: true,
      }),
    ).toMatchObject({ ok: true });
  });

  it("allows ten images and rejects eleven with IMAGE_LIMIT_EXCEEDED", () => {
    const ten = Array.from({ length: 10 }, (_, index) =>
      slot(index + 1, index === 0 ? "whole_plant" : "other"),
    );
    expect(validateImageSet(ten, { forSubmission: true })).toMatchObject({
      ok: true,
    });
    expect(validateImageSet([...ten, slot(10)])).toEqual({
      ok: false,
      issue: { code: "IMAGE_LIMIT_EXCEEDED", count: 11 },
    });
  });

  it("rejects invalid categories, positions, and duplicates", () => {
    expect(validateImageSet([slot(1), slot(2, "root")])).toEqual({
      ok: false,
      issue: { code: "VALIDATION_FAILED", reason: "invalid_slot", index: 1 },
    });
    expect(validateImageSet([slot(0)])).toMatchObject({
      issue: { reason: "invalid_slot" },
    });
    expect(validateImageSet([slot(11)])).toMatchObject({
      issue: { reason: "invalid_slot" },
    });
    expect(validateImageSet([slot(1.5)])).toMatchObject({
      issue: { reason: "invalid_slot" },
    });
    expect(validateImageSet([slot(3), slot(3, "flower")])).toEqual({
      ok: false,
      issue: {
        code: "VALIDATION_FAILED",
        reason: "duplicate_position",
        position: 3,
      },
    });
  });
});

describe("slot helpers", () => {
  it("canAddImage allows up to ten", () => {
    expect(canAddImage(0)).toBe(true);
    expect(canAddImage(9)).toBe(true);
    expect(canAddImage(10)).toBe(false);
  });

  it("nextFreePosition fills gaps and stops at ten", () => {
    expect(nextFreePosition([])).toBe(1);
    expect(nextFreePosition([{ position: 1 }, { position: 3 }])).toBe(2);
    expect(
      nextFreePosition(
        Array.from({ length: 10 }, (_, i) => ({ position: i + 1 })),
      ),
    ).toBeNull();
  });
});
