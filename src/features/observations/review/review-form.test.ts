import { describe, expect, it } from "vitest";

import { PLANT_TRAIT_KEYS } from "./contracts";
import {
  editedReviewEntries,
  evidenceProgressOf,
  mergeReviewEdits,
  nameWarningOf,
  reviewFormSchema,
  reviewFormValuesOf,
  reviewTraitsOf,
  studentReviewRequestOf,
  traitSummaryOf,
  type ReviewFormValues,
} from "./review-form";

const names = {
  commonName: "ชบา",
  scientificName: null,
  evidenceNote: "ดอกเดี่ยวสีแดง",
};

function baseValues(): ReviewFormValues {
  return reviewFormValuesOf(names, {
    version: 4,
    referenceNote: null,
    traits: [
      {
        traitKey: "leaf_margin",
        status: null,
        value: "หยักฟันเลื่อย",
        note: null,
      },
      {
        traitKey: "bark",
        status: "not_visible",
        value: null,
        note: "มีเถาปกคลุม",
      },
    ],
  });
}

describe("reviewFormValuesOf", () => {
  it("maps names, saved traits, and every catalogue trait", () => {
    const values = baseValues();
    expect(values.expectedVersion).toBe(4);
    expect(values.commonName).toBe("ชบา");
    expect(values.scientificName).toBe("");
    expect(values.referenceNote).toBe("");
    expect(Object.keys(values.traits)).toEqual([...PLANT_TRAIT_KEYS]);
    expect(values.traits.leaf_margin).toEqual({
      mode: "value",
      value: "หยักฟันเลื่อย",
      note: "",
    });
    expect(values.traits.bark).toEqual({
      mode: "not_visible",
      value: "",
      note: "มีเถาปกคลุม",
    });
    expect(values.traits.flower_color?.mode).toBe("skip");
  });
});

describe("studentReviewRequestOf", () => {
  it("trims, stores blanks as null, and sends traits in catalogue order", () => {
    const values = baseValues();
    values.scientificName = "  Hibiscus rosa-sinensis ";
    values.referenceNote = "   ";
    values.traits.flower_color = { mode: "unsure", value: "แดง", note: " " };
    values.traits.plant_type = { mode: "value", value: " ไม้พุ่ม ", note: "" };

    const request = studentReviewRequestOf(values);
    expect(request).toEqual({
      expectedVersion: 4,
      identitySource: "manual",
      commonName: "ชบา",
      scientificName: "Hibiscus rosa-sinensis",
      evidenceNote: "ดอกเดี่ยวสีแดง",
      referenceNote: null,
      traits: [
        { traitKey: "plant_type", value: "ไม้พุ่ม", note: null },
        { traitKey: "leaf_margin", value: "หยักฟันเลื่อย", note: null },
        { traitKey: "bark", status: "not_visible", note: "มีเถาปกคลุม" },
        { traitKey: "flower_color", status: "unsure", note: null },
      ],
    });
  });

  it("leaves unchecked traits and empty values out", () => {
    const values = baseValues();
    values.traits.leaf_margin = { mode: "skip", value: "หยัก", note: "x" };
    values.traits.fruit_type = { mode: "value", value: "  ", note: "" };
    expect(reviewTraitsOf(values.traits).map((row) => row.traitKey)).toEqual([
      "bark",
    ]);
  });
});

describe("reviewFormSchema", () => {
  it("accepts gaps so a partial review still saves", () => {
    const values = reviewFormValuesOf(
      { commonName: null, scientificName: null, evidenceNote: null },
      { version: 1, referenceNote: null, traits: [] },
    );
    expect(reviewFormSchema.safeParse(values).success).toBe(true);
  });

  it("requires a value when a trait is marked as seen", () => {
    const values = baseValues();
    values.traits.leaf_type = { mode: "value", value: " ", note: "" };
    const result = reviewFormSchema.safeParse(values);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "traits",
      "leaf_type",
      "value",
    ]);
  });

  it("rejects over-long text after trimming", () => {
    const values = baseValues();
    values.commonName = `  ${"ก".repeat(121)}  `;
    values.traits.bark = { mode: "unsure", value: "", note: "น".repeat(301) };
    const result = reviewFormSchema.safeParse(values);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "commonName",
      "traits.bark.note",
    ]);
    values.commonName = `  ${"ก".repeat(120)}  `;
    values.traits.bark = { mode: "unsure", value: "", note: "" };
    expect(reviewFormSchema.safeParse(values).success).toBe(true);
  });
});

describe("summaries and hints", () => {
  it("counts trait checks overall and per group", () => {
    const values = baseValues();
    values.traits.leaf_type = { mode: "unsure", value: "", note: "" };
    expect(traitSummaryOf(values.traits)).toEqual({
      value: 1,
      unsure: 1,
      notVisible: 1,
      checked: 3,
      total: PLANT_TRAIT_KEYS.length,
    });
    expect(
      traitSummaryOf(values.traits, [
        "leaf_type",
        "leaf_margin",
        "leaf_venation",
      ]),
    ).toMatchObject({ checked: 2, total: 3 });
  });

  it("warns on unknown-name placeholders but not on blanks or real names", () => {
    expect(nameWarningOf("ไม่ทราบ")).toBe("unknown");
    expect(nameWarningOf(" Unknown ")).toBe("unknown");
    expect(nameWarningOf("?")).toBe("unknown");
    expect(nameWarningOf("")).toBeNull();
    expect(nameWarningOf("Hibiscus rosa-sinensis")).toBeNull();
  });

  it("measures the evidence note against the 20-character minimum", () => {
    expect(evidenceProgressOf("  สั้นไป  ")).toEqual({
      length: 6,
      min: 20,
      enough: false,
    });
    expect(evidenceProgressOf("ก".repeat(20)).enough).toBe(true);
  });
});

describe("mergeReviewEdits", () => {
  it("re-applies only the student's edits onto the latest version", () => {
    const base = baseValues();
    const local = baseValues();
    local.scientificName = "Hibiscus rosa-sinensis";
    local.traits.flower_color = { mode: "value", value: "แดง", note: "" };

    const latest = baseValues();
    latest.expectedVersion = 5;
    latest.commonName = "ชบาแดง";
    latest.traits.bark = { mode: "value", value: "เรียบ", note: "" };

    expect(editedReviewEntries(base, local)).toEqual([
      "scientificName",
      "trait:flower_color",
    ]);
    const merged = mergeReviewEdits(base, local, latest);
    expect(merged.reapplied).toEqual(["scientificName", "trait:flower_color"]);
    expect(merged.values.expectedVersion).toBe(5);
    expect(merged.values.commonName).toBe("ชบาแดง");
    expect(merged.values.scientificName).toBe("Hibiscus rosa-sinensis");
    expect(merged.values.traits.bark).toEqual({
      mode: "value",
      value: "เรียบ",
      note: "",
    });
    expect(merged.values.traits.flower_color?.value).toBe("แดง");
    // The latest record is never mutated by the merge.
    expect(latest.traits.flower_color?.mode).toBe("skip");
  });

  it("ignores whitespace-only and hidden-field differences", () => {
    const base = baseValues();
    const local = baseValues();
    local.commonName = " ชบา ";
    local.traits.fruit_type = { mode: "skip", value: "", note: "ลืมลบ" };
    local.traits.bark = {
      mode: "not_visible",
      value: "เรียบ",
      note: "มีเถาปกคลุม",
    };
    expect(editedReviewEntries(base, local)).toEqual([]);
  });
});
