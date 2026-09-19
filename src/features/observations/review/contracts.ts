import { z } from "zod";

import { MEDIA_CATEGORIES } from "../media/contracts";

// P11 manual review and submission (API_AND_REALTIME.md §17; PRD §§10–14).

/**
 * plant-traits-v1: the manual trait catalogue. Keys are snake_case (the
 * database format); P10 maps the camelCase AI traits onto them (owner item 71).
 */
export const PLANT_TRAIT_GROUPS = [
  {
    key: "habit",
    label: "ทรงต้น",
    traits: [
      {
        key: "plant_type",
        label: "ประเภทพืช",
        hint: "เช่น ไม้ต้น ไม้พุ่ม ไม้ล้มลุก ไม้เลื้อย",
      },
      {
        key: "growth_habit",
        label: "ลักษณะการเติบโต",
        hint: "เช่น ตั้งตรง แผ่กว้าง เลื้อยพัน",
      },
    ],
  },
  {
    key: "leaf",
    label: "ใบ",
    traits: [
      { key: "leaf_type", label: "ชนิดใบ", hint: "เช่น ใบเดี่ยว ใบประกอบ" },
      {
        key: "leaf_arrangement",
        label: "การเรียงใบ",
        hint: "เช่น เรียงสลับ ตรงข้าม เวียน",
      },
      { key: "leaf_margin", label: "ขอบใบ", hint: "เช่น เรียบ หยัก จัก" },
      { key: "leaf_venation", label: "เส้นใบ", hint: "เช่น แบบร่างแห แบบขนาน" },
    ],
  },
  {
    key: "stem",
    label: "ลำต้น",
    traits: [
      {
        key: "stem_type",
        label: "ลำต้น",
        hint: "เช่น ไม้เนื้อแข็ง อวบน้ำ มีหนาม",
      },
      {
        key: "bark",
        label: "เปลือก",
        hint: "เช่น เรียบ แตกเป็นร่อง ลอกเป็นแผ่น",
      },
    ],
  },
  {
    key: "flower",
    label: "ดอก",
    traits: [
      { key: "flower_color", label: "สีดอก", hint: "เช่น เหลือง ขาว ชมพู" },
      {
        key: "flower_arrangement",
        label: "การออกดอก",
        hint: "เช่น ดอกเดี่ยว เป็นช่อ",
      },
    ],
  },
  {
    key: "fruit",
    label: "ผล",
    traits: [{ key: "fruit_type", label: "ผล", hint: "เช่น ฝัก ผลสด ผลแห้ง" }],
  },
] as const;

export const PLANT_TRAIT_KEYS = PLANT_TRAIT_GROUPS.flatMap((group) =>
  group.traits.map((trait) => trait.key),
) as readonly string[];

/** Mirrors private.is_unknown_plant_name (server authoritative). */
export const UNKNOWN_PLANT_NAMES = [
  "ไม่ทราบ",
  "ไม่รู้",
  "ไม่แน่ใจ",
  "unknown",
  "n/a",
  "na",
  "-",
  "?",
] as const;

export function isUnknownPlantName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return true;
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return true;
  return (UNKNOWN_PLANT_NAMES as readonly string[]).includes(
    trimmed.toLowerCase(),
  );
}

export const EVIDENCE_NOTE_MIN_CHARS = 20;

const traitKeySchema = z
  .string()
  .refine((key) => PLANT_TRAIT_KEYS.includes(key), "unknown trait");
const noteSchema = z.string().trim().min(1).max(300).nullable().optional();

export const reviewTraitSchema = z.union([
  z
    .object({
      traitKey: traitKeySchema,
      value: z.string().trim().min(1).max(120),
      note: noteSchema,
    })
    .strict(),
  z
    .object({
      traitKey: traitKeySchema,
      status: z.enum(["unsure", "not_visible"]),
      note: noteSchema,
    })
    .strict(),
]);

export type ReviewTrait = z.infer<typeof reviewTraitSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    });

export const studentReviewRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    identitySource: z.literal("manual"),
    commonName: optionalText(120),
    scientificName: optionalText(160),
    evidenceNote: optionalText(1000),
    referenceNote: optionalText(300),
    traits: z
      .array(reviewTraitSchema)
      .max(40)
      .refine(
        (traits) =>
          new Set(traits.map((trait) => trait.traitKey)).size === traits.length,
        "duplicate trait",
      ),
  })
  .strict();

export type StudentReviewRequest = z.infer<typeof studentReviewRequestSchema>;

export const submitObservationRequestSchema = z
  .object({
    clientSubmissionId: z.uuid(),
    expectedVersion: z.number().int().min(1),
    acknowledgeSameSpecies: z.boolean(),
  })
  .strict();

export type SubmitObservationRequest = z.infer<
  typeof submitObservationRequestSchema
>;

export const relationDecisionRequestSchema = z
  .object({
    decision: z.enum(["same_specimen", "not_same_specimen"]),
    expectedDecision: z.enum(["same_specimen", "not_same_specimen"]).nullable(),
  })
  .strict();

export const SUBMIT_BLOCKERS = [
  "student_review",
  "common_name",
  "scientific_name",
  "evidence_note",
  "pending_images",
  "whole_plant_image",
] as const;

export type SubmitBlocker = (typeof SUBMIT_BLOCKERS)[number];

export const SUBMIT_BLOCKER_LABELS: Record<SubmitBlocker, string> = {
  student_review: "บันทึกข้อมูลพืชอย่างน้อยหนึ่งครั้ง",
  common_name: "กรอกชื่อไทยหรือชื่อทั่วไป (ไม่ใช่ “ไม่ทราบ”)",
  scientific_name: "กรอกชื่อวิทยาศาสตร์ (ไม่ใช่ “ไม่ทราบ”)",
  evidence_note: `เขียนหลักฐานที่เห็นจากต้นจริงอย่างน้อย ${EVIDENCE_NOTE_MIN_CHARS} ตัวอักษร`,
  pending_images: "รอภาพที่กำลังส่งให้เสร็จ",
  whole_plant_image: "มีภาพทั้งต้นอย่างน้อย 1 ภาพ",
};

// Read models are not strict: additive fields must not break clients.
export const reviewStateSchema = z.object({
  observationId: z.uuid(),
  status: z.string(),
  version: z.number().int(),
  identitySource: z.enum(["manual", "ai_candidate"]).nullable(),
  referenceNote: z.string().nullable(),
  analysis: z.object({ state: z.string() }),
  traits: z.array(
    z.object({
      traitKey: z.string(),
      status: z.string().nullable(),
      value: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
  readiness: z.object({
    blockers: z.array(z.enum(SUBMIT_BLOCKERS)),
    evidenceNoteMinChars: z.number().int(),
  }),
  sameSpecies: z.object({ inSession: z.boolean(), count: z.number().int() }),
  submission: z
    .object({
      id: z.uuid(),
      submissionNumber: z.number().int(),
      submittedAt: z.string(),
      commonName: z.string(),
      scientificName: z.string(),
      evidenceNote: z.string(),
      imageCount: z.number().int(),
      sameSpeciesCount: z.number().int(),
      sameSpeciesAcknowledged: z.boolean(),
    })
    .nullable(),
  permissions: z.object({
    canEdit: z.boolean(),
    canSubmit: z.boolean(),
    submitBlockedCode: z.string().nullable(),
    submitBlockedReason: z.string().nullable(),
  }),
  refreshedAt: z.string(),
});

export type ReviewState = z.infer<typeof reviewStateSchema>;

const relationSchema = z.object({
  relationId: z.uuid(),
  relationshipType: z.enum(["same_species", "possible_same_specimen"]),
  otherObservationId: z.uuid(),
  otherStudentName: z.string().nullable(),
  otherCommonName: z.string().nullable(),
  otherScientificName: z.string().nullable(),
  otherCapturedAt: z.string(),
  distanceM: z.number().nullable(),
  timeGapSeconds: z.number().int().nullable(),
  ruleVersion: z.string(),
  decision: z.enum(["same_specimen", "not_same_specimen"]).nullable(),
  decidedAt: z.string().nullable(),
  canDecide: z.boolean(),
});

export type ObservationRelation = z.infer<typeof relationSchema>;

export const teacherReviewRecordSchema = z.object({
  observationId: z.uuid(),
  classId: z.uuid(),
  status: z.string(),
  student: z.object({ id: z.uuid(), displayName: z.string().nullable() }),
  groupName: z.string().nullable(),
  session: z.object({ id: z.uuid(), title: z.string(), status: z.string() }),
  activity: z.object({ id: z.uuid(), title: z.string() }),
  capture: z.object({
    locationStatus: z.string(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    accuracyM: z.number().nullable(),
    capturedAt: z.string(),
    unavailableReason: z.string().nullable(),
  }),
  sameSpecies: z.object({ inSession: z.boolean(), count: z.number().int() }),
  submissions: z.array(
    z.object({
      id: z.uuid(),
      submissionNumber: z.number().int(),
      submittedAt: z.string(),
      commonName: z.string(),
      scientificName: z.string(),
      evidenceNote: z.string(),
      referenceNote: z.string().nullable(),
      identitySource: z.string(),
      verification: z.record(z.string(), z.unknown()),
      sameSpeciesCount: z.number().int(),
      sameSpeciesAcknowledged: z.boolean(),
      media: z.array(
        z.object({
          mediaId: z.uuid(),
          position: z.number().int(),
          category: z.enum(MEDIA_CATEGORIES),
          width: z.number().int(),
          height: z.number().int(),
          storagePath: z.string(),
        }),
      ),
    }),
  ),
  relations: z.array(relationSchema),
  refreshedAt: z.string(),
});

type TeacherReviewRecord = z.infer<typeof teacherReviewRecordSchema>;

const teacherSubmissionSchema =
  teacherReviewRecordSchema.shape.submissions.element;
const teacherMediaSchema = teacherSubmissionSchema.shape.media.element;

/** The browser-side parse of TeacherReviewView. */
export const teacherReviewViewSchema = teacherReviewRecordSchema.extend({
  submissions: z.array(
    teacherSubmissionSchema.extend({
      media: z.array(
        teacherMediaSchema
          .omit({ storagePath: true })
          .extend({ signedUrl: z.string().nullable() }),
      ),
    }),
  ),
});

/** What the teacher's browser receives: signed URLs, never storage paths. */
export type TeacherReviewView = Omit<TeacherReviewRecord, "submissions"> & {
  submissions: Array<
    Omit<TeacherReviewRecord["submissions"][number], "media"> & {
      media: Array<
        Omit<
          TeacherReviewRecord["submissions"][number]["media"][number],
          "storagePath"
        > & { signedUrl: string | null }
      >;
    }
  >;
};

export const ownerRelatedSchema = z.object({
  basis: z.enum(["draft", "submitted"]),
  sameSpeciesInSession: z.boolean(),
  sameSpeciesCount: z.number().int(),
  possibleSameSpecimenCount: z.number().int(),
  visibility: z.literal("restricted"),
  refreshedAt: z.string(),
});

export const reviewQueryKeys = {
  state: (observationId: string) =>
    ["observations", "review", observationId] as const,
  teacher: (observationId: string) =>
    ["observations", "teacher-review", observationId] as const,
  /** Owner counts are recomputed for each saved version of the draft. */
  related: (observationId: string, version: number) =>
    ["observations", "related", observationId, version] as const,
};
