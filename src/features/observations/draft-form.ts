import { z } from "zod";

import { DRAFT_FIELD_LIMITS, type ObservationDraft } from "./contracts";

// P8-04 draft notes form (OBS-011, D-052). Pure helpers for the form, its
// request body, and the version-conflict merge.

export const DRAFT_FIELDS = [
  "commonName",
  "scientificName",
  "evidenceNote",
] as const;

export type DraftField = (typeof DRAFT_FIELDS)[number];
export type DraftNotesValues = Record<DraftField, string>;
export type DraftNotesFormValues = DraftNotesValues & {
  expectedVersion: number;
};

export const DRAFT_FIELD_LABELS: Record<DraftField, string> = {
  commonName: "ชื่อไทยหรือชื่อทั่วไป",
  scientificName: "ชื่อวิทยาศาสตร์",
  evidenceNote: "หลักฐานสั้น ๆ",
};

/** Length is checked after trimming, as the server stores it. */
function limitedText(max: number) {
  return z.string().refine((value) => value.trim().length <= max, {
    message: `ยาวเกิน ${max} ตัวอักษร ย่อให้สั้นลงก่อนบันทึก`,
  });
}

export const draftNotesFormSchema = z.object({
  expectedVersion: z.number().int().min(1),
  commonName: limitedText(DRAFT_FIELD_LIMITS.commonName),
  scientificName: limitedText(DRAFT_FIELD_LIMITS.scientificName),
  evidenceNote: limitedText(DRAFT_FIELD_LIMITS.evidenceNote),
});

export const updateObservationDraftResponseSchema = z
  .object({
    outcome: z.enum(["updated", "unchanged"]),
    version: z.number().int().min(1),
  })
  .strict();

export type UpdateObservationDraftResponse = z.infer<
  typeof updateObservationDraftResponseSchema
>;

export function draftNotesValuesOf(
  observation: Pick<ObservationDraft, "draft">,
): DraftNotesValues {
  return {
    commonName: observation.draft.commonName ?? "",
    scientificName: observation.draft.scientificName ?? "",
    evidenceNote: observation.draft.evidenceNote ?? "",
  };
}

export function draftFormValuesOf(
  observation: Pick<ObservationDraft, "draft" | "version">,
): DraftNotesFormValues {
  return {
    ...draftNotesValuesOf(observation),
    expectedVersion: observation.version,
  };
}

function stored(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The PUT body; the server trims and stores blanks as null. */
export function updateDraftRequestOf(values: DraftNotesFormValues) {
  return {
    expectedVersion: values.expectedVersion,
    commonName: stored(values.commonName),
    scientificName: stored(values.scientificName),
    evidenceNote: stored(values.evidenceNote),
  };
}

/** The cached record after the server accepted `values` as `version`. */
export function draftAfterSave(
  observation: ObservationDraft,
  values: DraftNotesValues,
  version: number,
): ObservationDraft {
  return {
    ...observation,
    version,
    draft: {
      commonName: stored(values.commonName),
      scientificName: stored(values.scientificName),
      evidenceNote: stored(values.evidenceNote),
    },
  };
}

function sameText(a: string, b: string) {
  return a.trim() === b.trim();
}

export function editedDraftFields(
  base: DraftNotesValues,
  local: DraftNotesValues,
): DraftField[] {
  return DRAFT_FIELDS.filter((field) => !sameText(base[field], local[field]));
}

/**
 * Re-applies only what the student changed since the version they loaded onto
 * the latest saved version; fields they did not touch keep the latest value,
 * so another screen's save is never reverted without the student choosing it.
 */
export function mergeDraftEdits(
  base: DraftNotesValues,
  local: DraftNotesValues,
  latest: DraftNotesValues,
): { values: DraftNotesValues; reapplied: DraftField[] } {
  const reapplied = editedDraftFields(base, local);
  const values = { ...latest };
  for (const field of reapplied) values[field] = local[field];
  return { values, reapplied };
}
