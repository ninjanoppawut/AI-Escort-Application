import { describe, expect, it } from "vitest";

import {
  GROUP_ERROR_PRESENTATIONS,
  GROUP_LEADERSHIP_DENIAL_CODES,
  httpStatusForGroupError,
} from "./errors";
import {
  groupMemberParamSchema,
  interpretReadyRow,
  interpretRemoveRow,
  interpretTransferRow,
  transferLeadershipRequestSchema,
} from "./leadership";

const classId = "20000000-0000-4000-8000-000000004501";
const groupId = "30000000-0000-4000-8000-000000004501";
const leaderId = "00000000-0000-4000-8000-000000004502";
const memberId = "00000000-0000-4000-8000-000000004503";

// PostgREST types RETURNS TABLE columns as non-null; the RPCs return nulls.
function row<T>(value: Record<string, unknown>) {
  return value as unknown as T;
}

type ReadyRow = Parameters<typeof interpretReadyRow>[0];
type TransferRow = Parameters<typeof interpretTransferRow>[0];
type RemoveRow = Parameters<typeof interpretRemoveRow>[0];

describe("P4-04 leadership contracts", () => {
  it("validates transfer bodies and member route params strictly", () => {
    expect(
      transferLeadershipRequestSchema.safeParse({ newLeaderId: memberId })
        .success,
    ).toBe(true);
    expect(
      transferLeadershipRequestSchema.safeParse({
        newLeaderId: memberId,
        role: "leader",
      }).success,
    ).toBe(false);
    expect(
      groupMemberParamSchema.safeParse({ id: groupId, studentId: "x" }).success,
    ).toBe(false);
  });

  it("presents every leadership denial as a 409 conflict", () => {
    for (const code of GROUP_LEADERSHIP_DENIAL_CODES) {
      expect(httpStatusForGroupError(code)).toBe(409);
      expect(GROUP_ERROR_PRESENTATIONS[code].title).toMatch(/[฀-๿]/);
    }
    expect(GROUP_ERROR_PRESENTATIONS.LEADER_SUCCESSOR_REQUIRED.action).toBe(
      "เลือกผู้สืบทอด",
    );
  });
});

describe("P4-04 leadership result interpretation", () => {
  it("interprets readiness outcomes", () => {
    const ready = {
      outcome: "ready",
      error_code: null,
      group_id: groupId,
      class_id: classId,
      status: "ready",
      member_count: 3,
      minimum_size: 2,
    };
    expect(interpretReadyRow(row<ReadyRow>(ready)).data).toEqual({
      outcome: "ready",
      groupId,
      classId,
      memberCount: 3,
      minimumSize: 2,
    });

    const belowMinimum = interpretReadyRow(
      row<ReadyRow>({
        ...ready,
        outcome: "denied",
        error_code: "INVALID_STATUS_TRANSITION",
        status: "forming",
        member_count: 1,
      }),
    );
    expect(belowMinimum.status).toBe(409);
    expect(belowMinimum.error).toMatchObject({
      code: "INVALID_STATUS_TRANSITION",
      details: { memberCount: 1, minimumSize: 2 },
    });
  });

  it("interprets transfers and fails closed on unknown denials", () => {
    const transferred = {
      outcome: "transferred",
      error_code: null,
      group_id: groupId,
      class_id: classId,
      leader_id: memberId,
      previous_leader_id: leaderId,
    };
    expect(interpretTransferRow(row<TransferRow>(transferred)).data).toEqual({
      outcome: "transferred",
      groupId,
      classId,
      leaderId: memberId,
      previousLeaderId: leaderId,
    });
    expect(
      interpretTransferRow(
        row<TransferRow>({
          ...transferred,
          outcome: "denied",
          error_code: "GROUP_FULL",
        }),
      ).error?.code,
    ).toBe("FORBIDDEN");
    expect(interpretTransferRow(undefined).error?.code).toBe("FORBIDDEN");
  });

  it("interprets removal, including the successor requirement", () => {
    const removed = {
      outcome: "removed",
      error_code: null,
      group_id: groupId,
      class_id: classId,
      member_count: 1,
      status: "forming",
    };
    expect(interpretRemoveRow(row<RemoveRow>(removed)).data).toMatchObject({
      outcome: "removed",
      memberCount: 1,
      status: "forming",
    });
    const leader = interpretRemoveRow(
      row<RemoveRow>({
        ...removed,
        outcome: "denied",
        error_code: "LEADER_SUCCESSOR_REQUIRED",
      }),
    );
    expect(leader.status).toBe(409);
    expect(leader.error?.code).toBe("LEADER_SUCCESSOR_REQUIRED");
  });
});
