import { z } from "zod";

import { lineStringSchema, pointSchema, polygonSchema } from "./geojson";

export const ACTIVITY_TITLE_MAX_LENGTH = 120;
export const ACTIVITY_DESCRIPTION_MAX_LENGTH = 2000;
export const ACTIVITY_INSTRUCTIONS_MAX_LENGTH = 4000;
export const CHECKPOINT_INSTRUCTIONS_MAX_LENGTH = 1000;
export const MAX_CHECKPOINTS = 50;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null));

export const checkpointSchema = z.object({
  sequenceNumber: z.int().min(1).max(MAX_CHECKPOINTS),
  title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX_LENGTH),
  instructions: optionalText(CHECKPOINT_INSTRUCTIONS_MAX_LENGTH),
  location: pointSchema,
  radiusM: z.number().gt(0).max(500).default(20),
});

export const activityGeometrySchema = z.object({
  boundary: polygonSchema.nullable().default(null),
  route: lineStringSchema.nullable().default(null),
  checkpoints: z
    .array(checkpointSchema)
    .max(MAX_CHECKPOINTS)
    .default([])
    .refine(
      (checkpoints) =>
        new Set(checkpoints.map((checkpoint) => checkpoint.sequenceNumber))
          .size === checkpoints.length,
      "ลำดับจุดตรวจต้องไม่ซ้ำกัน",
    ),
});

export const activityPluginSchema = z.object({
  key: z.literal("plant_survey"),
  schemaVersion: z.literal(1),
  config: z.record(z.string(), z.unknown()),
});

export const activityDraftSchema = z.object({
  title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX_LENGTH),
  description: optionalText(ACTIVITY_DESCRIPTION_MAX_LENGTH),
  instructions: optionalText(ACTIVITY_INSTRUCTIONS_MAX_LENGTH),
  geometry: activityGeometrySchema.default({
    boundary: null,
    route: null,
    checkpoints: [],
  }),
  plugin: activityPluginSchema.default({
    key: "plant_survey",
    schemaVersion: 1,
    config: {},
  }),
});

export const createActivityRequestSchema = activityDraftSchema
  .extend({ classId: z.uuid() })
  .strict();

export const saveActivityRequestSchema = activityDraftSchema
  .extend({ expectedVersion: z.int().min(1) })
  .strict();

export const publishActivityRequestSchema = z
  .object({ expectedVersion: z.int().min(1) })
  .strict();

export const activityIdParamSchema = z.object({ id: z.uuid() }).strict();

export const activityListQuerySchema = z.object({ classId: z.uuid() }).strict();

export type ActivityDraft = z.output<typeof activityDraftSchema>;
export type ActivityDraftInput = z.input<typeof activityDraftSchema>;
export type CreateActivityRequest = z.output<
  typeof createActivityRequestSchema
>;
export type SaveActivityRequest = z.output<typeof saveActivityRequestSchema>;

// Read models ---------------------------------------------------------------

const activityStatusSchema = z.enum(["draft", "published", "archived"]);
const viewerRoleSchema = z.enum(["teacher", "student"]);

export const activityVersionSchema = z.object({
  id: z.uuid(),
  versionNumber: z.number().int().positive(),
  title: z.string(),
  instructions: z.string().nullable(),
  status: z.enum(["draft", "published", "superseded"]),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  geometry: z.object({
    boundary: polygonSchema.nullable(),
    route: lineStringSchema.nullable(),
    checkpoints: z.array(
      z.object({
        sequenceNumber: z.number().int().positive(),
        title: z.string(),
        instructions: z.string().nullable(),
        location: pointSchema,
        radiusM: z.number(),
      }),
    ),
  }),
  plugin: z
    .object({
      key: z.string(),
      schemaVersion: z.number().int(),
      config: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  summary: z.object({
    boundaryAreaM2: z.number().nullable(),
    routeLengthM: z.number().nullable(),
    checkpointCount: z.number().int().nonnegative(),
  }),
});

export const activityDetailSchema = z.object({
  activity: z.object({
    id: z.uuid(),
    classId: z.uuid(),
    className: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    status: activityStatusSchema,
    updatedAt: z.string(),
  }),
  viewerRole: viewerRoleSchema,
  published: activityVersionSchema.nullable(),
  draft: activityVersionSchema.nullable(),
  refreshedAt: z.string(),
});

export const activityListSchema = z.object({
  classId: z.uuid(),
  className: z.string(),
  viewerRole: viewerRoleSchema,
  items: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      description: z.string().nullable(),
      status: activityStatusSchema,
      publishedVersionNumber: z.number().int().positive().nullable(),
      draftVersionNumber: z.number().int().positive().nullable(),
      checkpointCount: z.number().int().nonnegative(),
      publishedAt: z.string().nullable(),
      updatedAt: z.string(),
    }),
  ),
  refreshedAt: z.string(),
});

export type ActivityVersion = z.infer<typeof activityVersionSchema>;
export type ActivityDetail = z.infer<typeof activityDetailSchema>;
export type ActivityList = z.infer<typeof activityListSchema>;

export const activityQueryKeys = {
  all: ["activities"] as const,
  list: (classId: string) =>
    [...activityQueryKeys.all, "list", classId] as const,
  detail: (activityId: string) =>
    [...activityQueryKeys.all, "detail", activityId] as const,
};

/** The version number an editor must send back when saving or publishing. */
export function editableVersionNumber(detail: ActivityDetail) {
  return detail.draft?.versionNumber ?? detail.published?.versionNumber ?? null;
}

/** Form values for the editor: the draft when one exists, else the published version. */
export function draftFromDetail(detail: ActivityDetail): ActivityDraft {
  const version = detail.draft ?? detail.published;
  return {
    title: detail.activity.title,
    description: detail.activity.description,
    instructions: version?.instructions ?? null,
    geometry: {
      boundary: version?.geometry.boundary ?? null,
      route: version?.geometry.route ?? null,
      checkpoints:
        version?.geometry.checkpoints.map((checkpoint) => ({
          sequenceNumber: checkpoint.sequenceNumber,
          title: checkpoint.title,
          instructions: checkpoint.instructions,
          location: checkpoint.location,
          radiusM: checkpoint.radiusM,
        })) ?? [],
    },
    plugin: { key: "plant_survey", schemaVersion: 1, config: {} },
  };
}
