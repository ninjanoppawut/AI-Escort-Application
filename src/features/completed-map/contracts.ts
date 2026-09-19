import { z } from "zod";

import { polygonSchema } from "@/features/activities/geojson";
import { MEDIA_CATEGORIES } from "@/features/observations/media/contracts";

// P13 completed activity map (MAP-001 to MAP-006, MAP-009; D-055, D-068).
// Read models are not strict: additive fields must not break clients.

const mapItemRecordSchema = z.object({
  observationId: z.uuid(),
  status: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  accuracyM: z.number().nullable(),
  locationStatus: z.string(),
  capturedAt: z.string(),
  commonName: z.string(),
  scientificName: z.string(),
  verified: z.boolean(),
  recorderName: z.string().nullable(),
  groupName: z.string().nullable(),
  isMine: z.boolean(),
  sameSpeciesInSession: z.boolean(),
  thumbnailPath: z.string().nullable(),
});

const mapSessionSchema = z.object({
  title: z.string(),
  status: z.string(),
  completedAt: z.string().nullable().optional(),
});

export const completedMapRecordSchema = z.union([
  z.object({
    sessionId: z.uuid(),
    viewerRole: z.enum(["teacher", "participant"]),
    available: z.literal(false),
    session: mapSessionSchema,
    refreshedAt: z.string(),
  }),
  z.object({
    sessionId: z.uuid(),
    classId: z.uuid(),
    viewerRole: z.enum(["teacher", "participant"]),
    available: z.literal(true),
    session: mapSessionSchema,
    activity: z.object({ id: z.uuid(), title: z.string() }).nullable(),
    boundary: polygonSchema.nullable(),
    items: z.array(mapItemRecordSchema),
    total: z.number().int(),
    truncated: z.boolean(),
    pendingReviewCount: z.number().int().nullable(),
    refreshedAt: z.string(),
  }),
]);

const mapItemViewSchema = mapItemRecordSchema
  .omit({ thumbnailPath: true })
  .extend({ thumbnailUrl: z.string().nullable() });

/** What the browser receives: signed thumbnails, never storage paths. */
export const completedMapViewSchema = z.union([
  completedMapRecordSchema.options[0],
  completedMapRecordSchema.options[1].extend({
    items: z.array(mapItemViewSchema),
  }),
]);

export type CompletedMapView = z.infer<typeof completedMapViewSchema>;
export type AvailableCompletedMap = Extract<
  CompletedMapView,
  { available: true }
>;
export type CompletedMapItem = AvailableCompletedMap["items"][number];

const detailMediaRecordSchema = z.object({
  mediaId: z.uuid(),
  position: z.number().int(),
  category: z.enum(MEDIA_CATEGORIES),
  width: z.number().int(),
  height: z.number().int(),
  storagePath: z.string(),
});

export const mapDetailRecordSchema = z.object({
  observationId: z.uuid(),
  sessionId: z.uuid(),
  status: z.string(),
  viewer: z.object({
    role: z.enum(["teacher", "participant"]),
    isOwner: z.boolean(),
    canReport: z.boolean(),
  }),
  verified: z
    .object({
      commonName: z.string(),
      scientificName: z.string(),
      teacherName: z.string().nullable(),
      verifiedAt: z.string().nullable(),
    })
    .nullable(),
  student: z.object({
    commonName: z.string(),
    scientificName: z.string(),
    evidenceNote: z.string(),
    referenceNote: z.string().nullable(),
    traits: z.array(z.unknown()),
    submissionNumber: z.number().int(),
    submittedAt: z.string(),
  }),
  recorder: z.object({
    name: z.string().nullable(),
    groupName: z.string().nullable(),
  }),
  capture: z.object({
    locationStatus: z.string(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    accuracyM: z.number().nullable(),
    capturedAt: z.string(),
  }),
  feedback: z.string().nullable(),
  relations: z.object({
    sameSpeciesInSession: z.boolean(),
    sameSpeciesCount: z.number().int(),
    possibleSameSpecimenCount: z.number().int().nullable(),
  }),
  media: z.array(detailMediaRecordSchema),
  refreshedAt: z.string(),
});

export const mapDetailViewSchema = mapDetailRecordSchema.extend({
  media: z.array(
    detailMediaRecordSchema
      .omit({ storagePath: true })
      .extend({ signedUrl: z.string().nullable() }),
  ),
});

export type MapDetailView = z.infer<typeof mapDetailViewSchema>;

export const completedMapQueryKeys = {
  map: (sessionId: string) => ["completed-map", sessionId] as const,
  detail: (observationId: string) =>
    ["completed-map", "detail", observationId] as const,
};
