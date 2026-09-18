import { z } from "zod";

import { activityVersionSchema } from "@/features/activities/contracts";
import { groupStatusSchema } from "@/features/groups/contracts";

export const SESSION_TITLE_MAX_LENGTH = 120;

export const createSessionRequestSchema = z
  .object({
    activityId: z.uuid(),
    title: z.string().trim().min(1).max(SESSION_TITLE_MAX_LENGTH),
    scheduledAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .strict();

export const openSessionRequestSchema = z
  .object({ groupOrder: z.array(z.uuid()).min(1).max(200) })
  .strict();

export const sessionIdParamSchema = z.object({ id: z.uuid() }).strict();

export const sessionGroupParamSchema = z
  .object({ id: z.uuid(), groupId: z.uuid() })
  .strict();

export const activateSessionGroupRequestSchema = z
  .object({ groupId: z.uuid() })
  .strict();

export const sessionListQuerySchema = z.object({ classId: z.uuid() }).strict();

export type CreateSessionRequest = z.output<typeof createSessionRequestSchema>;

export const sessionStatusSchema = z.enum([
  "scheduled",
  "open",
  "paused",
  "completed",
]);

export const sessionGroupStatusSchema = z.enum([
  "waiting",
  "ready",
  "active",
  "paused",
  "completed",
]);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type SessionGroupStatus = z.infer<typeof sessionGroupStatusSchema>;

export const sessionSetupSchema = z.object({
  session: z.object({
    id: z.uuid(),
    classId: z.uuid(),
    title: z.string(),
    status: sessionStatusSchema,
    scheduledAt: z.string().nullable(),
    openedAt: z.string().nullable(),
    createdAt: z.string(),
  }),
  className: z.string(),
  activity: z.object({
    id: z.uuid(),
    title: z.string(),
    versionNumber: z.number().int().positive(),
    versionStatus: z.enum(["draft", "published", "superseded"]),
    hasBoundary: z.boolean(),
    hasRoute: z.boolean(),
    checkpointCount: z.number().int().nonnegative(),
  }),
  runningSession: z.object({ id: z.uuid(), title: z.string() }).nullable(),
  eligibleGroups: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      status: groupStatusSchema,
      memberCount: z.number().int().positive(),
      leaderName: z.string().nullable(),
    }),
  ),
  excludedGroups: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      reason: z.literal("no_members"),
    }),
  ),
  unassignedStudentCount: z.number().int().nonnegative(),
  queue: z.array(
    z.object({
      sessionGroupId: z.uuid(),
      groupId: z.uuid(),
      groupName: z.string(),
      queuePosition: z.number().int().positive(),
      status: sessionGroupStatusSchema,
      participants: z.array(
        z.object({
          userId: z.uuid(),
          displayName: z.string(),
          roleAtStart: z.enum(["leader", "member"]),
          participationStatus: z.enum(["active", "left", "removed"]),
        }),
      ),
    }),
  ),
  participantCount: z.number().int().nonnegative(),
  refreshedAt: z.string(),
});

export const sessionListSchema = z.object({
  classId: z.uuid(),
  className: z.string(),
  viewerRole: z.enum(["teacher", "student"]),
  items: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      status: sessionStatusSchema,
      scheduledAt: z.string().nullable(),
      openedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
      activityId: z.uuid(),
      activityTitle: z.string(),
      groupCount: z.number().int().nonnegative(),
      participantCount: z.number().int().nonnegative(),
      viewerIsParticipant: z.boolean(),
    }),
  ),
  refreshedAt: z.string(),
});

export type SessionSetup = z.infer<typeof sessionSetupSchema>;
export type SessionList = z.infer<typeof sessionListSchema>;

// P7-02 read models. Strict shapes mirror the json_build_object payloads of
// get_session_live and get_session_participant_view; an unexpected key fails
// the database-boundary parse instead of reaching the browser.

const roleAtStartSchema = z.enum(["leader", "member"]);

const sessionActivitySummarySchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    versionNumber: z.number().int().positive(),
    instructions: z.string().nullable(),
  })
  .strict();

/** Boundary, route, and checkpoints of the session's immutable activity version. */
export const sessionGeometrySchema = activityVersionSchema.shape.geometry;

export const sessionLiveSchema = z
  .object({
    session: z
      .object({
        id: z.uuid(),
        classId: z.uuid(),
        title: z.string(),
        status: sessionStatusSchema,
        openedAt: z.string().nullable(),
        pausedAt: z.string().nullable(),
        completedAt: z.string().nullable(),
      })
      .strict(),
    className: z.string(),
    activity: sessionActivitySummarySchema,
    geometry: sessionGeometrySchema,
    queue: z.array(
      z
        .object({
          sessionGroupId: z.uuid(),
          groupId: z.uuid(),
          groupName: z.string(),
          queuePosition: z.number().int().positive(),
          status: sessionGroupStatusSchema,
          activatedAt: z.string().nullable(),
          completedAt: z.string().nullable(),
          participants: z.array(
            z
              .object({
                userId: z.uuid(),
                displayName: z.string(),
                roleAtStart: roleAtStartSchema,
                participationStatus: z.enum(["active", "left", "removed"]),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    counts: z
      .object({
        groups: z.number().int().nonnegative(),
        completedGroups: z.number().int().nonnegative(),
        participants: z.number().int().nonnegative(),
      })
      .strict(),
    allowedActions: z
      .object({
        canActivate: z.boolean(),
        canPause: z.boolean(),
        canResume: z.boolean(),
        canComplete: z.boolean(),
      })
      .strict(),
    refreshedAt: z.string(),
  })
  .strict();

export const SESSION_BLOCKED_REASONS = [
  "session_completed",
  "session_paused",
  "group_completed",
  "group_waiting",
  "participation_inactive",
] as const;

export const sessionParticipantViewSchema = z
  .object({
    session: z
      .object({
        id: z.uuid(),
        classId: z.uuid(),
        title: z.string(),
        status: sessionStatusSchema,
        openedAt: z.string().nullable(),
        completedAt: z.string().nullable(),
      })
      .strict(),
    className: z.string(),
    activity: sessionActivitySummarySchema,
    geometry: sessionGeometrySchema,
    myGroup: z
      .object({
        sessionGroupId: z.uuid(),
        groupId: z.uuid(),
        name: z.string(),
        status: sessionGroupStatusSchema,
        queuePosition: z.number().int().positive(),
        roleAtStart: roleAtStartSchema,
        members: z.array(
          z
            .object({
              userId: z.uuid(),
              displayName: z.string(),
              roleAtStart: roleAtStartSchema,
            })
            .strict(),
        ),
      })
      .strict(),
    groupsAhead: z.number().int().nonnegative(),
    permissions: z
      .object({
        canPublishLocation: z.boolean(),
        canSubmitObservations: z.boolean(),
        blockedReason: z.enum(SESSION_BLOCKED_REASONS).nullable(),
      })
      .strict(),
    refreshedAt: z.string(),
  })
  .strict();

export type SessionLive = z.infer<typeof sessionLiveSchema>;
export type SessionParticipantView = z.infer<
  typeof sessionParticipantViewSchema
>;
export type SessionBlockedReason = (typeof SESSION_BLOCKED_REASONS)[number];

export const sessionQueryKeys = {
  all: ["sessions"] as const,
  list: (classId: string) =>
    [...sessionQueryKeys.all, "list", classId] as const,
  setup: (sessionId: string) =>
    [...sessionQueryKeys.all, "setup", sessionId] as const,
  live: (sessionId: string) =>
    [...sessionQueryKeys.all, "live", sessionId] as const,
  participant: (sessionId: string) =>
    [...sessionQueryKeys.all, "participant", sessionId] as const,
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: "ยังไม่เปิดรอบ",
  open: "เปิดรอบแล้ว",
  paused: "หยุดชั่วคราว",
  completed: "จบรอบแล้ว",
};

/** Moves one queue entry up or down; out-of-range moves return the same order. */
export function moveQueueItem(
  order: readonly string[],
  index: number,
  offset: -1 | 1,
) {
  const target = index + offset;
  if (
    index < 0 ||
    index >= order.length ||
    target < 0 ||
    target >= order.length
  ) {
    return [...order];
  }
  const next = [...order];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Stable identity of the eligible group set, independent of queue order. */
export function eligibleGroupsKey(setup: Pick<SessionSetup, "eligibleGroups">) {
  return setup.eligibleGroups
    .map((group) => group.id)
    .sort()
    .join(",");
}

export interface SessionReadinessItem {
  key: "boundary" | "route" | "checkpoints" | "groups" | "running";
  label: string;
  done: boolean;
}

export function sessionReadiness(setup: SessionSetup): SessionReadinessItem[] {
  const groupCount = setup.eligibleGroups.length;
  return [
    { key: "boundary", label: "ขอบเขตสำรวจ", done: setup.activity.hasBoundary },
    { key: "route", label: "เส้นทาง", done: setup.activity.hasRoute },
    {
      key: "checkpoints",
      label: `จุดตรวจ ${setup.activity.checkpointCount} จุด`,
      done: setup.activity.checkpointCount > 0,
    },
    {
      key: "groups",
      label: groupCount
        ? `${groupCount} กลุ่มพร้อม`
        : "ยังไม่มีกลุ่มที่มีสมาชิก",
      done: groupCount > 0,
    },
    {
      key: "running",
      label: setup.runningSession
        ? `รอบ ${setup.runningSession.title} ยังเปิดอยู่`
        : "ไม่มีรอบอื่นเปิดอยู่",
      done: setup.runningSession === null,
    },
  ];
}
