import { z } from "zod";

// P7-03 private session topics (API_AND_REALTIME.md §19). Named coordinates
// travel only on the per-student location topic, which RLS lets the owner and
// the class teacher read and only the owner write while publishing is allowed.

const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const sessionTopicPattern = new RegExp(
  `^session:(${uuidPattern}):(teachers|group:(${uuidPattern})|location:(${uuidPattern}))$`,
);

export function sessionGroupTopic(sessionId: string, groupId: string) {
  return `session:${sessionId}:group:${groupId}`;
}

export function sessionTeachersTopic(sessionId: string) {
  return `session:${sessionId}:teachers`;
}

export function sessionLocationTopic(sessionId: string, userId: string) {
  return `session:${sessionId}:location:${userId}`;
}

export type ParsedSessionTopic =
  | { kind: "teachers"; sessionId: string }
  | { kind: "group"; sessionId: string; groupId: string }
  | { kind: "location"; sessionId: string; userId: string };

/** Mirrors private.parse_session_topic; returns null for any other topic. */
export function parseSessionTopic(topic: string): ParsedSessionTopic | null {
  const match = sessionTopicPattern.exec(topic);
  const sessionId = match?.[1];
  if (!match || !sessionId) return null;
  const [, , kind, groupId, userId] = match;
  if (kind === "teachers") return { kind: "teachers", sessionId };
  if (groupId) return { kind: "group", sessionId, groupId };
  return userId ? { kind: "location", sessionId, userId } : null;
}

export const SESSION_SIGNAL_TYPES = [
  "session.status_changed",
  "session.group_status_changed",
  "session.participant_changed",
] as const;

/** Database-sent pointer signals; realtime.send adds the message id. */
export const sessionSignalSchema = z
  .object({
    id: z.uuid().optional(),
    type: z.enum(SESSION_SIGNAL_TYPES),
    version: z.literal(1),
    sessionId: z.uuid(),
    sessionGroupId: z.uuid().nullable(),
    groupId: z.uuid().nullable(),
    changedAt: z.string(),
  })
  .strict();

export type SessionSignal = z.infer<typeof sessionSignalSchema>;

const latitude = z.number().finite().min(-90).max(90);
const longitude = z.number().finite().min(-180).max(180);
const accuracyMeters = z.number().finite().positive().max(100_000);

/**
 * Client broadcast on session:{sessionId}:location:{userId}. It carries no
 * user ID or name: the topic identifies the owner and RLS proves the sender.
 */
export const locationSampleMessageSchema = z
  .object({
    type: z.literal("location.sample"),
    version: z.literal(1),
    sessionId: z.uuid(),
    seq: z.number().int().nonnegative(),
    lat: latitude,
    lng: longitude,
    accuracyM: accuracyMeters,
    headingDeg: z.number().finite().min(0).max(360).nullable(),
    speedMps: z.number().finite().nonnegative().max(100).nullable(),
    recordedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type LocationSampleMessage = z.infer<typeof locationSampleMessageSchema>;

export const locationStatusMessageSchema = z
  .object({
    type: z.literal("location.status"),
    version: z.literal(1),
    sessionId: z.uuid(),
    status: z.enum(["denied", "unavailable"]),
  })
  .strict();

export type LocationStatusMessage = z.infer<typeof locationStatusMessageSchema>;

export const locationMessageSchema = z.discriminatedUnion("type", [
  locationSampleMessageSchema,
  locationStatusMessageSchema,
]);

/** Rounds to six decimals (about 0.1 m) before anything leaves the device. */
export function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export const recordLocationSampleRequestSchema = z
  .object({
    clientSampleId: z.uuid(),
    lat: latitude,
    lng: longitude,
    accuracyM: accuracyMeters,
    recordedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type RecordLocationSampleRequest = z.infer<
  typeof recordLocationSampleRequestSchema
>;

export const recordLocationSampleRowSchema = z.object({
  outcome: z.enum(["recorded", "duplicate", "denied"]),
  error_code: z.string().nullable(),
  error_details: z.unknown().nullable(),
  sample_id: z.uuid().nullable(),
  retry_after_s: z.number().int().nullable(),
});

export interface RecordedLocationSample {
  outcome: "recorded" | "duplicate";
  sampleId: string;
}

const latestSampleSchema = z
  .object({
    lat: latitude,
    lng: longitude,
    accuracyM: accuracyMeters,
    recordedAt: z.string(),
    receivedAt: z.string(),
  })
  .strict();

export const sessionLiveLocationsSchema = z
  .object({
    sessionStatus: z.enum(["scheduled", "open", "paused", "completed"]),
    activeSessionGroupId: z.uuid().nullable(),
    activeGroupId: z.uuid().nullable(),
    publishing: z.boolean(),
    items: z.array(
      z
        .object({
          userId: z.uuid(),
          displayName: z.string(),
          roleAtStart: z.enum(["leader", "member"]),
          latestSample: latestSampleSchema.nullable(),
        })
        .strict(),
    ),
    refreshedAt: z.string(),
  })
  .strict();

export type SessionLiveLocations = z.infer<typeof sessionLiveLocationsSchema>;

export const liveLocationQueryKeys = {
  all: ["session-live-locations"] as const,
  session: (sessionId: string) =>
    [...liveLocationQueryKeys.all, sessionId] as const,
};

// Working defaults (PRIVACY §4; owner confirmation pending in
// OWNER_QUESTIONS_PENDING.md): broadcast about every 3 s while moving with a
// 15 s heartbeat, and keep a durable sample every 15 s.
export const LIVE_LOCATION_TIMING = {
  broadcastIntervalMs: 3_000,
  heartbeatIntervalMs: 15_000,
  durableIntervalMs: 15_000,
  minimumMovementMeters: 3,
} as const;
