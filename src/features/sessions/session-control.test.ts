import { describe, expect, it } from "vitest";

import {
  httpStatusForActivityError,
  mapPostgresActivityError,
} from "@/features/activities/errors";
import {
  activityFailure,
  parseActivityReadModel,
} from "@/features/activities/results";

import {
  activateSessionGroupRequestSchema,
  sessionGroupParamSchema,
  sessionLiveSchema,
  sessionParticipantViewSchema,
} from "./contracts";
import {
  interpretActivateSessionGroupRow,
  interpretCompleteSessionGroupRow,
  interpretCompleteSessionRow,
  interpretPauseSessionRow,
  interpretResumeSessionRow,
} from "./results";

const classId = "20000000-0000-4000-8000-000000007201";
const sessionId = "62000000-0000-4000-8000-000000007201";
const activityId = "60000000-0000-4000-8000-000000007201";
const groupOne = "30000000-0000-4000-8000-000000007201";
const groupTwo = "30000000-0000-4000-8000-000000007202";
const queueOne = "63000000-0000-4000-8000-000000007201";
const queueTwo = "63000000-0000-4000-8000-000000007202";
const studentOne = "10000000-0000-4000-8000-000000007201";
const studentTwo = "10000000-0000-4000-8000-000000007202";

// PostgREST types RETURNS TABLE columns as non-null; the RPCs return nulls.
function row<T>(value: Record<string, unknown>) {
  return value as unknown as T;
}

type ActivateRow = Parameters<typeof interpretActivateSessionGroupRow>[0];
type PauseRow = Parameters<typeof interpretPauseSessionRow>[0];
type ResumeRow = Parameters<typeof interpretResumeSessionRow>[0];
type CompleteGroupRow = Parameters<typeof interpretCompleteSessionGroupRow>[0];
type CompleteSessionRow = Parameters<typeof interpretCompleteSessionRow>[0];

const geometry = {
  boundary: {
    type: "Polygon",
    coordinates: [
      [
        [100.5, 13.75],
        [100.51, 13.75],
        [100.51, 13.76],
        [100.5, 13.75],
      ],
    ],
  },
  route: {
    type: "LineString",
    coordinates: [
      [100.501, 13.751],
      [100.505, 13.755],
    ],
  },
  checkpoints: [
    {
      sequenceNumber: 1,
      title: "Start",
      instructions: null,
      location: { type: "Point", coordinates: [100.501, 13.751] },
      radiusM: 20,
    },
  ],
};

const activity = {
  id: activityId,
  title: "Garden survey",
  versionNumber: 2,
  instructions: "Stay inside the boundary.",
};

const liveFixture = {
  session: {
    id: sessionId,
    classId,
    title: "Morning round",
    status: "open",
    openedAt: "2026-09-12T02:00:00.123456+00:00",
    pausedAt: null,
    completedAt: null,
  },
  className: "Biology",
  activity,
  geometry,
  queue: [
    {
      sessionGroupId: queueOne,
      groupId: groupOne,
      groupName: "Leaf",
      queuePosition: 1,
      status: "active",
      activatedAt: "2026-09-12T02:05:00+00:00",
      completedAt: null,
      participants: [
        {
          userId: studentOne,
          displayName: "Ada",
          roleAtStart: "leader",
          participationStatus: "active",
        },
      ],
    },
    {
      sessionGroupId: queueTwo,
      groupId: groupTwo,
      groupName: "Root",
      queuePosition: 2,
      status: "ready",
      activatedAt: null,
      completedAt: null,
      participants: [],
    },
  ],
  counts: { groups: 2, completedGroups: 0, participants: 1 },
  allowedActions: {
    canActivate: true,
    canPause: true,
    canResume: false,
    canComplete: true,
  },
  refreshedAt: "2026-09-12T02:06:00+00:00",
};

const participantFixture = {
  session: {
    id: sessionId,
    classId,
    title: "Morning round",
    status: "paused",
    openedAt: "2026-09-12T02:00:00+00:00",
    completedAt: null,
  },
  className: "Biology",
  activity,
  geometry,
  myGroup: {
    sessionGroupId: queueTwo,
    groupId: groupTwo,
    name: "Root",
    status: "ready",
    queuePosition: 2,
    roleAtStart: "member",
    members: [
      { userId: studentOne, displayName: "Ada", roleAtStart: "leader" },
      { userId: studentTwo, displayName: "Ben", roleAtStart: "member" },
    ],
  },
  groupsAhead: 1,
  permissions: {
    canPublishLocation: false,
    canSubmitObservations: false,
    blockedReason: "session_paused",
  },
  refreshedAt: "2026-09-12T02:06:00+00:00",
};

describe("session control request contracts", () => {
  it("requires a UUID group and rejects unknown keys", () => {
    expect(
      activateSessionGroupRequestSchema.parse({ groupId: groupOne }),
    ).toEqual({ groupId: groupOne });
    expect(
      activateSessionGroupRequestSchema.safeParse({ groupId: "group-1" })
        .success,
    ).toBe(false);
    expect(
      activateSessionGroupRequestSchema.safeParse({
        groupId: groupOne,
        status: "active",
      }).success,
    ).toBe(false);
    expect(activateSessionGroupRequestSchema.safeParse(null).success).toBe(
      false,
    );
  });

  it("requires UUID session and group route params", () => {
    expect(
      sessionGroupParamSchema.safeParse({ id: sessionId, groupId: groupOne })
        .success,
    ).toBe(true);
    expect(
      sessionGroupParamSchema.safeParse({ id: sessionId, groupId: "1" })
        .success,
    ).toBe(false);
  });
});

describe("session control read models", () => {
  it("parses the teacher live model", () => {
    const live = sessionLiveSchema.parse(liveFixture);
    expect(live.queue.map((entry) => entry.status)).toEqual([
      "active",
      "ready",
    ]);
    expect(live.geometry.boundary?.type).toBe("Polygon");
    expect(parseActivityReadModel(sessionLiveSchema, liveFixture).data).toEqual(
      live,
    );
  });

  it("rejects unexpected keys and unknown statuses at the boundary", () => {
    expect(
      sessionLiveSchema.safeParse({
        ...liveFixture,
        counts: { ...liveFixture.counts, liveLocations: 3 },
      }).success,
    ).toBe(false);
    expect(
      sessionLiveSchema.safeParse({
        ...liveFixture,
        session: { ...liveFixture.session, status: "running" },
      }).success,
    ).toBe(false);
    const invalid = parseActivityReadModel(sessionLiveSchema, {
      ...liveFixture,
      queue: [{ ...liveFixture.queue[0], queuePosition: 0 }],
    });
    expect(invalid.status).toBe(403);
    expect(invalid.error?.code).toBe("FORBIDDEN");
  });

  it("parses the participant view and its blocked reason", () => {
    const view = sessionParticipantViewSchema.parse(participantFixture);
    expect(view.permissions.blockedReason).toBe("session_paused");
    expect(view.myGroup.members).toHaveLength(2);
    expect(
      sessionParticipantViewSchema.parse({
        ...participantFixture,
        permissions: {
          canPublishLocation: true,
          canSubmitObservations: true,
          blockedReason: null,
        },
      }).permissions.blockedReason,
    ).toBeNull();
    expect(
      sessionParticipantViewSchema.safeParse({
        ...participantFixture,
        permissions: {
          ...participantFixture.permissions,
          blockedReason: "teacher_busy",
        },
      }).success,
    ).toBe(false);
    // Members never carry live location or participation fields.
    expect(
      sessionParticipantViewSchema.safeParse({
        ...participantFixture,
        myGroup: {
          ...participantFixture.myGroup,
          members: [
            {
              userId: studentOne,
              displayName: "Ada",
              roleAtStart: "leader",
              lastLocation: { lat: 13.75, lng: 100.5 },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});

describe("session activation interpretation", () => {
  it("returns the activated queue entry, including a replay", () => {
    expect(
      interpretActivateSessionGroupRow(
        row<ActivateRow>({
          outcome: "activated",
          error_code: null,
          error_details: null,
          session_group_id: queueOne,
          status: "active",
          queue_position: 1,
        }),
        sessionId,
        groupOne,
      ).data,
    ).toEqual({
      outcome: "activated",
      sessionId,
      groupId: groupOne,
      sessionGroupId: queueOne,
      status: "active",
      queuePosition: 1,
    });
  });

  it("maps a lost activation race to 409 with the active group", () => {
    const conflict = interpretActivateSessionGroupRow(
      row<ActivateRow>({
        outcome: "denied",
        error_code: "ACTIVE_GROUP_CONFLICT",
        error_details: {
          activeGroupId: groupOne,
          activeSessionGroupId: queueOne,
        },
        session_group_id: queueTwo,
        status: "ready",
        queue_position: 2,
      }),
      sessionId,
      groupTwo,
    );
    expect(conflict.status).toBe(409);
    expect(conflict.error).toMatchObject({
      code: "ACTIVE_GROUP_CONFLICT",
      message: "มีกลุ่มอื่นเริ่มสำรวจก่อนแล้ว",
      retryable: false,
      details: { activeGroupId: groupOne, activeSessionGroupId: queueOne },
    });
  });

  it("maps paused, not-open, and stale-group denials to 409", () => {
    for (const code of ["SESSION_PAUSED", "SESSION_NOT_OPEN"] as const) {
      const denied = interpretActivateSessionGroupRow(
        row<ActivateRow>({
          outcome: "denied",
          error_code: code,
          error_details: null,
          session_group_id: null,
          status: null,
          queue_position: null,
        }),
        sessionId,
        groupOne,
      );
      expect(denied.status).toBe(409);
      expect(denied.error?.code).toBe(code);
      expect(denied.error?.details).toEqual({});
    }
    const completed = interpretActivateSessionGroupRow(
      row<ActivateRow>({
        outcome: "denied",
        error_code: "INVALID_STATUS_TRANSITION",
        error_details: { reason: "group_completed" },
        session_group_id: queueOne,
        status: "completed",
        queue_position: 1,
      }),
      sessionId,
      groupOne,
    );
    expect(completed.status).toBe(409);
    expect(completed.error?.details).toEqual({ reason: "group_completed" });
  });

  it("drops unrecognized details and fails closed on unknown rows", () => {
    const denied = interpretActivateSessionGroupRow(
      row<ActivateRow>({
        outcome: "denied",
        error_code: "ACTIVE_GROUP_CONFLICT",
        error_details: { activeGroupId: "not-a-uuid", debug: "trace" },
        session_group_id: null,
        status: null,
        queue_position: null,
      }),
      sessionId,
      groupOne,
    );
    expect(denied.error?.code).toBe("ACTIVE_GROUP_CONFLICT");
    expect(denied.error?.details).toEqual({});

    const unknownCode = interpretActivateSessionGroupRow(
      row<ActivateRow>({
        outcome: "denied",
        error_code: "SOMETHING_ELSE",
        error_details: null,
        session_group_id: null,
        status: null,
        queue_position: null,
      }),
      sessionId,
      groupOne,
    );
    expect(unknownCode.status).toBe(403);
    expect(unknownCode.error?.code).toBe("FORBIDDEN");

    expect(
      interpretActivateSessionGroupRow(undefined, sessionId, groupOne).status,
    ).toBe(403);
    expect(
      interpretActivateSessionGroupRow(
        row<ActivateRow>({
          outcome: "activated",
          error_code: null,
          error_details: null,
          session_group_id: queueOne,
          status: "ready",
          queue_position: 1,
        }),
        sessionId,
        groupOne,
      ).error?.code,
    ).toBe("FORBIDDEN");
  });
});

describe("session pause, resume, and completion interpretation", () => {
  it("reads pause and resume, including replays", () => {
    expect(
      interpretPauseSessionRow(
        row<PauseRow>({
          outcome: "paused",
          error_code: null,
          status: "paused",
        }),
        sessionId,
      ).data,
    ).toEqual({ outcome: "paused", sessionId, status: "paused" });
    expect(
      interpretResumeSessionRow(
        row<ResumeRow>({
          outcome: "resumed",
          error_code: null,
          status: "open",
        }),
        sessionId,
      ).data,
    ).toEqual({ outcome: "resumed", sessionId, status: "open" });
  });

  it("maps pause and resume from the wrong state to 409", () => {
    const pause = interpretPauseSessionRow(
      row<PauseRow>({
        outcome: "denied",
        error_code: "INVALID_STATUS_TRANSITION",
        status: "completed",
      }),
      sessionId,
    );
    expect(pause.status).toBe(409);
    expect(pause.error?.code).toBe("INVALID_STATUS_TRANSITION");
    const resume = interpretResumeSessionRow(
      row<ResumeRow>({
        outcome: "denied",
        error_code: "INVALID_STATUS_TRANSITION",
        status: "scheduled",
      }),
      sessionId,
    );
    expect(resume.status).toBe(409);
    expect(
      interpretResumeSessionRow(
        row<ResumeRow>({
          outcome: "resumed",
          error_code: null,
          status: "paused",
        }),
        sessionId,
      ).status,
    ).toBe(403);
  });

  it("reports the promoted queue entry when a group completes", () => {
    const completed = interpretCompleteSessionGroupRow(
      row<CompleteGroupRow>({
        outcome: "completed",
        error_code: null,
        session_group_id: queueOne,
        status: "completed",
        next_ready_group_id: queueTwo,
      }),
      sessionId,
      groupOne,
    );
    expect(completed.data).toEqual({
      outcome: "completed",
      sessionId,
      groupId: groupOne,
      sessionGroupId: queueOne,
      status: "completed",
      nextReadySessionGroupId: queueTwo,
      nextReadyGroupId: null,
    });
    const replay = interpretCompleteSessionGroupRow(
      row<CompleteGroupRow>({
        outcome: "completed",
        error_code: null,
        session_group_id: queueOne,
        status: "completed",
        next_ready_group_id: null,
      }),
      sessionId,
      groupOne,
    );
    expect(replay.data?.nextReadySessionGroupId).toBeNull();
    const missing = interpretCompleteSessionGroupRow(
      row<CompleteGroupRow>({
        outcome: "denied",
        error_code: "INVALID_STATUS_TRANSITION",
        session_group_id: null,
        status: null,
        next_ready_group_id: null,
      }),
      sessionId,
      groupTwo,
    );
    expect(missing.status).toBe(409);
    expect(missing.error?.details).toEqual({});
  });

  it("reports how many groups the session completion closed", () => {
    expect(
      interpretCompleteSessionRow(
        row<CompleteSessionRow>({
          outcome: "completed",
          error_code: null,
          status: "completed",
          completed_groups: 3,
        }),
        sessionId,
      ).data,
    ).toEqual({
      outcome: "completed",
      sessionId,
      status: "completed",
      completedGroups: 3,
    });
    const scheduled = interpretCompleteSessionRow(
      row<CompleteSessionRow>({
        outcome: "denied",
        error_code: "INVALID_STATUS_TRANSITION",
        status: "scheduled",
        completed_groups: 0,
      }),
      sessionId,
    );
    expect(scheduled.status).toBe(409);
    expect(
      interpretCompleteSessionRow(
        row<CompleteSessionRow>({
          outcome: "completed",
          error_code: null,
          status: "completed",
          completed_groups: -1,
        }),
        sessionId,
      ).status,
    ).toBe(403);
  });
});

describe("session control HTTP mapping", () => {
  it("maps raised and committed codes to stable statuses", () => {
    expect(httpStatusForActivityError("ACTIVE_GROUP_CONFLICT")).toBe(409);
    expect(httpStatusForActivityError("SESSION_PAUSED")).toBe(409);
    expect(httpStatusForActivityError("SESSION_NOT_OPEN")).toBe(409);
    expect(httpStatusForActivityError("INVALID_STATUS_TRANSITION")).toBe(409);
    // 42501 FORBIDDEN covers both a missing session and a non-teacher.
    expect(activityFailure(mapPostgresActivityError("FORBIDDEN")).status).toBe(
      403,
    );
    expect(
      activityFailure(mapPostgresActivityError("AUTH_REQUIRED")).status,
    ).toBe(401);
    expect(
      activityFailure(mapPostgresActivityError("EMAIL_NOT_CONFIRMED")).status,
    ).toBe(403);
    expect(mapPostgresActivityError("permission denied for function")).toBe(
      "FORBIDDEN",
    );
  });
});
