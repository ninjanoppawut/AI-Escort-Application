import { describe, expect, it } from "vitest";

import {
  claimResetRequestSchema,
  creationClaimsSchema,
  interpretApproveRow,
  interpretDeleteOrArchiveRow,
  interpretLockRow,
  interpretResetClaimRow,
  interpretUnlockRow,
} from "./lifecycle";

const classId = "20000000-0000-4000-8000-000000005201";
const groupId = "30000000-0000-4000-8000-000000005201";
const claimId = "50000000-0000-4000-8000-000000005201";
const auditId = "70000000-0000-4000-8000-000000005201";

// PostgREST types RETURNS TABLE columns as non-null; the RPCs return nulls.
function row<T>(value: Record<string, unknown>) {
  return value as unknown as T;
}

type ApproveRow = Parameters<typeof interpretApproveRow>[0];
type LockRow = Parameters<typeof interpretLockRow>[0];
type ResetRow = Parameters<typeof interpretResetClaimRow>[0];
type DeleteRow = Parameters<typeof interpretDeleteOrArchiveRow>[0];

describe("P5 group lifecycle contracts", () => {
  it("requires a bounded claim reset reason", () => {
    expect(claimResetRequestSchema.safeParse({ reason: "  " }).success).toBe(
      false,
    );
    expect(
      claimResetRequestSchema.safeParse({ reason: "x".repeat(1001) }).success,
    ).toBe(false);
    expect(
      claimResetRequestSchema.parse({ reason: " Group was deleted " }).reason,
    ).toBe("Group was deleted");
  });

  it("parses creation claims and rejects unknown reset reasons", () => {
    const claims = {
      classId,
      claims: [
        {
          claimId,
          student: {
            id: "00000000-0000-4000-8000-000000005203",
            displayName: "Ada",
          },
          groupId,
          groupName: "Review Team",
          groupState: "deleted",
          studentInGroup: false,
          canReset: true,
          cannotResetReason: null,
          claimedAt: "2026-09-12T01:00:00.000000+00:00",
        },
      ],
      refreshedAt: "2026-09-12T02:00:00.000000+00:00",
    };
    expect(creationClaimsSchema.safeParse(claims).success).toBe(true);
    expect(
      creationClaimsSchema.safeParse({
        ...claims,
        claims: [{ ...claims.claims[0], cannotResetReason: "OTHER" }],
      }).success,
    ).toBe(false);
  });
});

describe("P5 group lifecycle result interpretation", () => {
  it("interprets approve, lock, and unlock outcomes", () => {
    const approved = {
      outcome: "approved",
      error_code: null,
      group_id: groupId,
      class_id: classId,
      status: "approved",
    };
    expect(interpretApproveRow(row<ApproveRow>(approved)).data).toEqual({
      outcome: "approved",
      groupId,
      classId,
      status: "approved",
    });
    expect(
      interpretUnlockRow(
        row<ApproveRow>({
          ...approved,
          outcome: "unlocked",
          status: "forming",
        }),
      ).data?.status,
    ).toBe("forming");
    expect(
      interpretApproveRow(
        row<ApproveRow>({
          ...approved,
          outcome: "denied",
          error_code: "GROUP_LOCKED",
          status: "locked",
        }),
      ).error?.code,
    ).toBe("GROUP_LOCKED");
    expect(
      interpretLockRow(
        row<LockRow>({
          ...approved,
          outcome: "locked",
          cancelled_invitations: 2,
        }),
      ).data,
    ).toEqual({
      outcome: "locked",
      groupId,
      classId,
      cancelledInvitations: 2,
    });
  });

  it("requires an audit reference for claim resets", () => {
    const reset = {
      outcome: "reset",
      error_code: null,
      claim_id: claimId,
      audit_log_id: auditId,
    };
    expect(interpretResetClaimRow(row<ResetRow>(reset)).data).toEqual({
      outcome: "reset",
      claimId,
      auditLogId: auditId,
    });
    expect(
      interpretResetClaimRow(row<ResetRow>({ ...reset, audit_log_id: null }))
        .error?.code,
    ).toBe("FORBIDDEN");
    expect(
      interpretResetClaimRow(
        row<ResetRow>({
          ...reset,
          outcome: "denied",
          error_code: "INVALID_STATUS_TRANSITION",
        }),
      ).status,
    ).toBe(409);
  });

  it("distinguishes deleted and archived groups", () => {
    const deleted = {
      outcome: "deleted",
      error_code: null,
      group_id: groupId,
      class_id: classId,
      released_members: 2,
      remaining_group_slots: 3,
    };
    expect(interpretDeleteOrArchiveRow(row<DeleteRow>(deleted)).data).toEqual({
      outcome: "deleted",
      groupId,
      classId,
      releasedMembers: 2,
      remainingGroupSlots: 3,
    });
    expect(
      interpretDeleteOrArchiveRow(
        row<DeleteRow>({ ...deleted, outcome: "archived" }),
      ).data?.outcome,
    ).toBe("archived");
    expect(
      interpretDeleteOrArchiveRow(
        row<DeleteRow>({
          ...deleted,
          outcome: "denied",
          error_code: "GROUP_IN_ACTIVE_SESSION",
        }),
      ).error?.code,
    ).toBe("GROUP_IN_ACTIVE_SESSION");
  });
});
