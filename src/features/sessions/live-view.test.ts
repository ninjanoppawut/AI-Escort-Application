import { describe, expect, it } from "vitest";

import type { SessionLive, SessionParticipantView } from "./contracts";
import type { SessionLiveLocations } from "./live-location/contracts";
import {
  LIVE_POSITION_STALE_AFTER_MS,
  accuracyLabel,
  activationBlock,
  currentQueueEntry,
  isPositionStale,
  liveLocationRows,
  nextQueueEntry,
  positionAgeLabel,
  positionAgeMs,
  studentSessionPhase,
} from "./live-view";

const userA = "10000000-0000-4000-8000-000000007601";
const userB = "10000000-0000-4000-8000-000000007602";

function participant(
  sessionStatus: SessionParticipantView["session"]["status"],
  groupStatus: SessionParticipantView["myGroup"]["status"],
  blockedReason: SessionParticipantView["permissions"]["blockedReason"] = null,
) {
  return {
    session: { status: sessionStatus },
    myGroup: { status: groupStatus },
    permissions: { blockedReason },
  } as unknown as SessionParticipantView;
}

function queue(
  sessionStatus: SessionLive["session"]["status"],
  statuses: SessionLive["queue"][number]["status"][],
) {
  return {
    session: { status: sessionStatus },
    queue: statuses.map((status, index) => ({
      groupId: `30000000-0000-4000-8000-00000000760${index + 1}`,
      groupName: `G${index + 1}`,
      queuePosition: index + 1,
      status,
    })),
    allowedActions: { canActivate: sessionStatus === "open" },
  } as unknown as SessionLive;
}

describe("studentSessionPhase", () => {
  it("maps every participant view to one screen state", () => {
    expect(studentSessionPhase(participant("open", "waiting"))).toBe("waiting");
    expect(studentSessionPhase(participant("open", "ready"))).toBe("ready");
    expect(studentSessionPhase(participant("open", "active"))).toBe("active");
    expect(studentSessionPhase(participant("paused", "paused"))).toBe("paused");
    expect(studentSessionPhase(participant("paused", "waiting"))).toBe(
      "waiting",
    );
    expect(studentSessionPhase(participant("paused", "ready"))).toBe("ready");
    expect(studentSessionPhase(participant("open", "completed"))).toBe(
      "group_completed",
    );
    expect(studentSessionPhase(participant("completed", "completed"))).toBe(
      "session_completed",
    );
    expect(
      studentSessionPhase(
        participant("open", "active", "participation_inactive"),
      ),
    ).toBe("participation_inactive");
  });
});

describe("queue helpers", () => {
  it("finds the current and next group", () => {
    const live = queue("open", ["completed", "active", "waiting", "ready"]);
    expect(currentQueueEntry(live)?.groupName).toBe("G2");
    expect(nextQueueEntry(live)?.groupName).toBe("G4");
    expect(
      nextQueueEntry(queue("open", ["completed", "waiting", "waiting"]))
        ?.groupName,
    ).toBe("G2");
    expect(nextQueueEntry(queue("open", ["completed"]))).toBeNull();
    expect(
      currentQueueEntry(queue("paused", ["paused", "ready"]))?.groupName,
    ).toBe("G1");
  });

  it("explains why a group cannot start", () => {
    const options = { online: true, pending: false };
    expect(
      activationBlock(queue("open", ["completed", "ready"]), options),
    ).toBe(null);
    expect(activationBlock(queue("open", ["active", "ready"]), options)).toBe(
      "group_active",
    );
    expect(activationBlock(queue("paused", ["paused", "ready"]), options)).toBe(
      "session_paused",
    );
    expect(activationBlock(queue("completed", ["completed"]), options)).toBe(
      "session_completed",
    );
    expect(activationBlock(queue("scheduled", []), options)).toBe(
      "session_scheduled",
    );
    expect(activationBlock(queue("open", ["completed"]), options)).toBe(
      "queue_done",
    );
    expect(
      activationBlock(queue("open", ["ready"]), {
        online: false,
        pending: false,
      }),
    ).toBe("offline");
    expect(
      activationBlock(queue("open", ["ready"]), {
        online: true,
        pending: true,
      }),
    ).toBe("pending");
  });
});

describe("live location rows", () => {
  const snapshot: SessionLiveLocations = {
    sessionStatus: "open",
    activeSessionGroupId: "63000000-0000-4000-8000-000000007601",
    activeGroupId: "30000000-0000-4000-8000-000000007601",
    publishing: true,
    items: [
      {
        userId: userA,
        displayName: "Ada",
        roleAtStart: "leader",
        latestSample: {
          lat: 13.75,
          lng: 100.5,
          accuracyM: 10,
          recordedAt: "2026-09-19T02:00:10.000Z",
          receivedAt: "2026-09-19T02:00:11.000Z",
        },
      },
      {
        userId: userB,
        displayName: "Bo",
        roleAtStart: "member",
        latestSample: null,
      },
    ],
    refreshedAt: "2026-09-19T02:00:20.000Z",
  };

  it("keeps whichever fix is newer and nothing while not publishing", () => {
    const older = {
      lat: 13.76,
      lng: 100.51,
      accuracyM: 3,
      recordedAt: "2026-09-19T02:00:05.000Z",
      seq: 1,
    };
    const newer = { ...older, recordedAt: "2026-09-19T02:00:15.000Z" };
    expect(liveLocationRows(snapshot, { [userA]: older })[0]?.position).toEqual(
      {
        lat: 13.75,
        lng: 100.5,
        accuracyM: 10,
        recordedAt: "2026-09-19T02:00:10.000Z",
      },
    );
    expect(
      liveLocationRows(snapshot, { [userA]: newer })[0]?.position?.accuracyM,
    ).toBe(3);
    expect(
      liveLocationRows(snapshot, { [userB]: newer })[1]?.position?.recordedAt,
    ).toBe("2026-09-19T02:00:15.000Z");
    expect(
      liveLocationRows({ ...snapshot, publishing: false }, { [userA]: newer }),
    ).toEqual([]);
    expect(liveLocationRows(undefined, {})).toEqual([]);
  });

  it("carries device-reported location problems per student", () => {
    const rows = liveLocationRows(snapshot, {}, { [userB]: "denied" });
    expect(rows[0]?.deviceStatus).toBeNull();
    expect(rows[1]?.deviceStatus).toBe("denied");
    expect(liveLocationRows(snapshot, {})[1]?.deviceStatus).toBeNull();
  });

  it("marks positions stale after the working threshold", () => {
    const recordedAt = "2026-09-19T02:00:00.000Z";
    const base = Date.parse(recordedAt);
    expect(
      isPositionStale(recordedAt, base + LIVE_POSITION_STALE_AFTER_MS),
    ).toBe(false);
    expect(
      isPositionStale(recordedAt, base + LIVE_POSITION_STALE_AFTER_MS + 1),
    ).toBe(true);
    // A device clock ahead of the teacher never yields a negative age.
    expect(positionAgeMs(recordedAt, base - 5_000)).toBe(0);
    expect(positionAgeLabel(12_400)).toBe("อัปเดต 12 วินาทีที่แล้ว");
    expect(positionAgeLabel(150_000)).toBe("อัปเดต 2 นาทีที่แล้ว");
    expect(accuracyLabel(7.6)).toBe("±8 ม.");
    expect(accuracyLabel(0.2)).toBe("±1 ม.");
  });
});
