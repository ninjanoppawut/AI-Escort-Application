import { z } from "zod";

import {
  EVIDENCE_NOTE_MIN_CHARS,
  PLANT_TRAIT_GROUPS,
  PLANT_TRAIT_KEYS,
  isUnknownPlantName,
  type ReviewState,
  type ReviewTrait,
  type StudentReviewRequest,
} from "./contracts";

// P11-02 manual plant entry (REV-001, UI_CONTRACTS.md §6). Pure helpers for
// the form, its request body, trait summaries, and the version-conflict merge.

export const REVIEW_TEXT_LIMITS = {
  commonName: 120,
  scientificName: 160,
  evidenceNote: 1000,
  referenceNote: 300,
  traitValue: 120,
  traitNote: 300,
} as const;

/** `skip` is "not recorded": the row is left out of the saved review. */
export const TRAIT_MODES = ["skip", "value", "unsure", "not_visible"] as const;
export type TraitMode = (typeof TRAIT_MODES)[number];

export const TRAIT_MODE_LABELS: Record<TraitMode, string> = {
  skip: "ยังไม่ตรวจ",
  value: "✓ เห็นชัด",
  unsure: "? ไม่แน่ใจ",
  not_visible: "◌ ไม่เห็น",
};

export interface TraitFormValue {
  mode: TraitMode;
  value: string;
  note: string;
}

export const REVIEW_TEXT_FIELDS = [
  "commonName",
  "scientificName",
  "evidenceNote",
  "referenceNote",
] as const;

export type ReviewTextField = (typeof REVIEW_TEXT_FIELDS)[number];

export type ReviewFormValues = Record<ReviewTextField, string> & {
  expectedVersion: number;
  traits: Record<string, TraitFormValue>;
};

export const REVIEW_FIELD_LABELS: Record<ReviewTextField, string> = {
  commonName: "ชื่อไทยหรือชื่อทั่วไป",
  scientificName: "ชื่อวิทยาศาสตร์",
  evidenceNote: "เหตุผลประกอบ (หลักฐานจากต้นจริง)",
  referenceNote: "แหล่งอ้างอิง (ถ้ามี)",
};

export const TRAIT_LABELS: Record<string, string> = Object.fromEntries(
  PLANT_TRAIT_GROUPS.flatMap((group) =>
    group.traits.map((trait) => [trait.key, trait.label]),
  ),
);

function tooLong(max: number) {
  return `ยาวเกิน ${max} ตัวอักษร ย่อให้สั้นลงก่อนบันทึก`;
}

/** Length is checked after trimming, as the server stores it. */
function limitedText(max: number) {
  return z
    .string()
    .refine((value) => value.trim().length <= max, { message: tooLong(max) });
}

const traitFormSchema = z
  .object({
    mode: z.enum(TRAIT_MODES),
    value: z.string(),
    note: z.string(),
  })
  .superRefine((trait, context) => {
    if (trait.mode === "value") {
      const length = trait.value.trim().length;
      if (length === 0) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message:
            "เขียนสิ่งที่เห็นจากต้นจริง หรือเลือก “ไม่แน่ใจ” / “ไม่เห็น”",
        });
      } else if (length > REVIEW_TEXT_LIMITS.traitValue) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: tooLong(REVIEW_TEXT_LIMITS.traitValue),
        });
      }
    }
    if (trait.note.trim().length > REVIEW_TEXT_LIMITS.traitNote) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: tooLong(REVIEW_TEXT_LIMITS.traitNote),
      });
    }
  });

/**
 * Saving is allowed with gaps; only length and filled-in trait rows are
 * checked here. Submission readiness is the server's `readiness.blockers`.
 */
export const reviewFormSchema = z.object({
  expectedVersion: z.number().int().min(1),
  commonName: limitedText(REVIEW_TEXT_LIMITS.commonName),
  scientificName: limitedText(REVIEW_TEXT_LIMITS.scientificName),
  evidenceNote: limitedText(REVIEW_TEXT_LIMITS.evidenceNote),
  referenceNote: limitedText(REVIEW_TEXT_LIMITS.referenceNote),
  traits: z.record(z.string(), traitFormSchema),
});

export const saveReviewResponseSchema = z
  .object({
    outcome: z.enum(["updated", "unchanged"]),
    version: z.number().int().min(1),
    status: z.string(),
  })
  .strict();

export type SaveReviewResponse = z.infer<typeof saveReviewResponseSchema>;

export const submitResponseSchema = z
  .object({
    outcome: z.enum(["submitted", "existing"]),
    submissionId: z.uuid(),
    submissionNumber: z.number().int().min(1),
    version: z.number().int().min(1),
  })
  .strict();

export type SubmitResponse = z.infer<typeof submitResponseSchema>;

export function emptyTrait(): TraitFormValue {
  return { mode: "skip", value: "", note: "" };
}

function traitFormValueOf(
  saved: ReviewState["traits"][number] | undefined,
): TraitFormValue {
  if (!saved) return emptyTrait();
  const note = saved.note ?? "";
  if (saved.status === "unsure" || saved.status === "not_visible") {
    return { mode: saved.status, value: "", note };
  }
  return saved.value
    ? { mode: "value", value: saved.value, note }
    : { mode: "skip", value: "", note: "" };
}

/** Names and the evidence note live on the observation (the draft model). */
export interface ReviewNames {
  commonName: string | null;
  scientificName: string | null;
  evidenceNote: string | null;
}

export function reviewFormValuesOf(
  names: ReviewNames,
  state: Pick<ReviewState, "referenceNote" | "traits" | "version">,
): ReviewFormValues {
  const saved = new Map(state.traits.map((trait) => [trait.traitKey, trait]));
  return {
    expectedVersion: state.version,
    commonName: names.commonName ?? "",
    scientificName: names.scientificName ?? "",
    evidenceNote: names.evidenceNote ?? "",
    referenceNote: state.referenceNote ?? "",
    traits: Object.fromEntries(
      PLANT_TRAIT_KEYS.map((key) => [key, traitFormValueOf(saved.get(key))]),
    ),
  };
}

function stored(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Catalogue order keeps retries byte-identical, so they stay `unchanged`. */
export function reviewTraitsOf(
  traits: Record<string, TraitFormValue>,
): ReviewTrait[] {
  const rows: ReviewTrait[] = [];
  for (const traitKey of PLANT_TRAIT_KEYS) {
    const trait = traits[traitKey];
    if (!trait || trait.mode === "skip") continue;
    const note = stored(trait.note);
    if (trait.mode === "value") {
      const value = stored(trait.value);
      if (value) rows.push({ traitKey, value, note });
    } else {
      rows.push({ traitKey, status: trait.mode, note });
    }
  }
  return rows;
}

export function studentReviewRequestOf(
  values: ReviewFormValues,
): StudentReviewRequest {
  return {
    expectedVersion: values.expectedVersion,
    identitySource: "manual",
    commonName: stored(values.commonName),
    scientificName: stored(values.scientificName),
    evidenceNote: stored(values.evidenceNote),
    referenceNote: stored(values.referenceNote),
    traits: reviewTraitsOf(values.traits),
  };
}

export interface TraitSummary {
  value: number;
  unsure: number;
  notVisible: number;
  checked: number;
  total: number;
}

export function traitSummaryOf(
  traits: Record<string, TraitFormValue>,
  keys: readonly string[] = PLANT_TRAIT_KEYS,
): TraitSummary {
  const summary = { value: 0, unsure: 0, notVisible: 0 };
  for (const key of keys) {
    const mode = traits[key]?.mode ?? "skip";
    if (mode === "value") summary.value += 1;
    if (mode === "unsure") summary.unsure += 1;
    if (mode === "not_visible") summary.notVisible += 1;
  }
  return {
    ...summary,
    checked: summary.value + summary.unsure + summary.notVisible,
    total: keys.length,
  };
}

export type NameWarning = "unknown" | null;

/** "ไม่ทราบ" saves, but cannot be submitted (D-013). */
export function nameWarningOf(value: string): NameWarning {
  return value.trim() !== "" && isUnknownPlantName(value) ? "unknown" : null;
}

export function evidenceProgressOf(value: string) {
  const length = value.trim().length;
  return {
    length,
    min: EVIDENCE_NOTE_MIN_CHARS,
    enough: length >= EVIDENCE_NOTE_MIN_CHARS,
  };
}

// Version-conflict merge ------------------------------------------------------

/** One comparable entry per text field and per trait row. */
export type ReviewEntryKey = ReviewTextField | `trait:${string}`;

function entriesOf(values: ReviewFormValues): Map<ReviewEntryKey, string> {
  const entries = new Map<ReviewEntryKey, string>();
  for (const field of REVIEW_TEXT_FIELDS) {
    entries.set(field, values[field].trim());
  }
  for (const key of PLANT_TRAIT_KEYS) {
    const trait = values.traits[key] ?? emptyTrait();
    entries.set(
      `trait:${key}`,
      JSON.stringify([
        trait.mode,
        trait.mode === "value" ? trait.value.trim() : "",
        trait.mode === "skip" ? "" : trait.note.trim(),
      ]),
    );
  }
  return entries;
}

export function editedReviewEntries(
  base: ReviewFormValues,
  local: ReviewFormValues,
): ReviewEntryKey[] {
  const before = entriesOf(base);
  const after = entriesOf(local);
  return [...after.keys()].filter((key) => before.get(key) !== after.get(key));
}

/**
 * Re-applies only what the student changed since the version they loaded onto
 * the latest saved version; entries they did not touch keep the latest value,
 * so another screen's save is never reverted without the student choosing it.
 */
export function mergeReviewEdits(
  base: ReviewFormValues,
  local: ReviewFormValues,
  latest: ReviewFormValues,
): { values: ReviewFormValues; reapplied: ReviewEntryKey[] } {
  const reapplied = editedReviewEntries(base, local);
  const values: ReviewFormValues = {
    ...latest,
    traits: { ...latest.traits },
  };
  for (const entry of reapplied) {
    if (entry.startsWith("trait:")) {
      const key = entry.slice("trait:".length);
      values.traits[key] = { ...(local.traits[key] ?? emptyTrait()) };
    } else {
      const field = entry as ReviewTextField;
      values[field] = local[field];
    }
  }
  return { values, reapplied };
}

export function reviewEntryLabel(entry: ReviewEntryKey) {
  return entry.startsWith("trait:")
    ? (TRAIT_LABELS[entry.slice("trait:".length)] ?? entry)
    : REVIEW_FIELD_LABELS[entry as ReviewTextField];
}
