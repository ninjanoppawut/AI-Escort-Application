import { describe, expect, it } from "vitest";

import {
  createSessionRequestSchema,
  eligibleGroupsKey,
  moveQueueItem,
  openSessionRequestSchema,
  sessionReadiness,
  sessionSetupSchema,
  type SessionSetup,
} from "./contracts";
import {
  buildCreateSessionArgs,
  interpretCreateSessionRow,
  interpretOpenSessionRow,
} from "./results";

const classId = "20000000-0000-4000-8000-000000006401";
const sessionId = "62000000-0000-4000-8000-000000006401";
const versionId = "61000000-0000-4000-8000-000000006401";
const activityId = "60000000-0000-4000-8000-000000006401";
const groupOne = "30000000-0000-4000-8000-000000006401";
const groupTwo = "30000000-0000-4000-8000-000000006402";

// PostgREST types RETURNS TABLE columns as non-null; the RPCs return nulls.
function row<T>(value: Record<string, unknown>) {
  return value as unknown as T;
}

type CreateRow = Parameters<typeof interpretCreateSessionRow>[0];
type OpenRow = Parameters<typeof interpretOpenSessionRow>[0];

const setup: SessionSetup = sessionSetupSchema.parse({
  session: {
    id: sessionId,
    classId,
    title: "Morning round",
    status: "scheduled",
    scheduledAt: null,
    openedAt: null,
    createdAt: "2026-09-12T02:00:00+00:00",
  },
  className: "Biology",
  activity: {
    id: activityId,
    title: "Garden survey",
    versionNumber: 1,
    versionStatus: "published",
    hasBoundary: true,
    hasRoute: true,
    checkpointCount: 2,
  },
  runningSession: null,
  eligibleGroups: [
    {
      id: groupOne,
      name: "Leaf",
      status: "forming",
      memberCount: 2,
      leaderName: "Ada",
    },
    {
      id: groupTwo,
      name: "Root",
      status: "approved",
      memberCount: 1,
      leaderName: null,
    },
  ],
  excludedGroups: [
    {
      id: "30000000-0000-4000-8000-000000006403",
      name: "Empty",
      reason: "no_members",
    },
  ],
  unassignedStudentCount: 1,
  queue: [],
  participantCount: 0,
  refreshedAt: "2026-09-12T02:00:00+00:00",
});

describe("session contracts", () => {
  it("requires a published activity, title, and optional ISO schedule", () => {
    expect(
      createSessionRequestSchema.parse({
        activityId,
        title: "  Morning round  ",
      }),
    ).toEqual({ activityId, title: "Morning round", scheduledAt: null });
    expect(
      createSessionRequestSchema.safeParse({
        activityId,
        title: "Morning round",
        scheduledAt: "2026-09-14 09:00",
      }).success,
    ).toBe(false);
    expect(openSessionRequestSchema.safeParse({ groupOrder: [] }).success).toBe(
      false,
    );
  });

  it("moves queue entries and ignores out-of-range moves", () => {
    expect(moveQueueItem([groupOne, groupTwo], 1, -1)).toEqual([
      groupTwo,
      groupOne,
    ]);
    expect(moveQueueItem([groupOne, groupTwo], 1, 1)).toEqual([
      groupOne,
      groupTwo,
    ]);
    expect(moveQueueItem([groupOne, groupTwo], 0, -1)).toEqual([
      groupOne,
      groupTwo,
    ]);
  });

  it("keys the eligible set independently of order", () => {
    expect(eligibleGroupsKey(setup)).toBe(
      eligibleGroupsKey({
        eligibleGroups: [...setup.eligibleGroups].reverse(),
      }),
    );
  });

  it("blocks opening while another session runs", () => {
    expect(sessionReadiness(setup).every((item) => item.done)).toBe(true);
    const blocked = sessionReadiness({
      ...setup,
      runningSession: {
        id: "62000000-0000-4000-8000-000000006402",
        title: "Afternoon",
      },
      eligibleGroups: [],
    });
    expect(
      blocked.filter((item) => !item.done).map((item) => item.key),
    ).toEqual(["groups", "running"]);
  });
});

describe("session RPC interpretation", () => {
  it("builds create args and reads created sessions", () => {
    expect(
      buildCreateSessionArgs({
        activityId,
        title: "Morning round",
        scheduledAt: null,
      }),
    ).toEqual({
      target_activity_id: activityId,
      session_title: "Morning round",
    });
    expect(
      interpretCreateSessionRow(
        row<CreateRow>({
          outcome: "created",
          error_code: null,
          session_id: sessionId,
          class_id: classId,
          activity_version_id: versionId,
        }),
      ).data?.sessionId,
    ).toBe(sessionId);
    expect(
      interpretCreateSessionRow(
        row<CreateRow>({
          outcome: "denied",
          error_code: "ACTIVITY_NOT_PUBLISHED",
          session_id: null,
          class_id: classId,
          activity_version_id: null,
        }),
      ).error?.code,
    ).toBe("ACTIVITY_NOT_PUBLISHED");
  });

  it("reads opened snapshots and keeps denial details", () => {
    expect(
      interpretOpenSessionRow(
        row<OpenRow>({
          outcome: "opened",
          error_code: null,
          session_id: sessionId,
          group_count: 2,
          participant_count: 3,
          error_details: null,
        }),
      ).data,
    ).toEqual({
      outcome: "opened",
      sessionId,
      groupCount: 2,
      participantCount: 3,
    });
    const mismatch = interpretOpenSessionRow(
      row<OpenRow>({
        outcome: "denied",
        error_code: "INVALID_STATUS_TRANSITION",
        session_id: sessionId,
        group_count: 0,
        participant_count: 0,
        error_details: {
          reason: "queue_mismatch",
          eligibleGroupIds: [groupOne],
        },
      }),
    );
    expect(mismatch.status).toBe(409);
    expect(mismatch.error?.details.reason).toBe("queue_mismatch");
    expect(
      interpretOpenSessionRow(
        row<OpenRow>({
          outcome: "denied",
          error_code: "SESSION_ALREADY_RUNNING",
          session_id: sessionId,
          group_count: 0,
          participant_count: 0,
          error_details: { runningSessionId: sessionId },
        }),
      ).error?.code,
    ).toBe("SESSION_ALREADY_RUNNING");
  });
});
