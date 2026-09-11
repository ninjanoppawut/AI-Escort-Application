import { describe, expect, it } from "vitest";

import {
  GROUP_INVITATION_DENIAL_CODES,
  GROUP_UI_ERROR_CODES,
  httpStatusForGroupError,
} from "./errors";
import {
  groupInvitationDetailSchema,
  interpretAcceptRow,
  interpretSendRow,
  interpretStatusRow,
  parseReadModel,
  sendGroupInvitationRequestSchema,
} from "./invitations";

const classId = "20000000-0000-4000-8000-000000004201";
const groupId = "30000000-0000-4000-8000-000000004201";
const invitationId = "60000000-0000-4000-8000-000000004201";
const inviteeId = "00000000-0000-4000-8000-000000004203";

// PostgREST types RETURNS TABLE columns as non-null; the RPCs return nulls.
function row<T>(value: Record<string, unknown>) {
  return value as unknown as T;
}

type SendRow = Parameters<typeof interpretSendRow>[0];
type AcceptRow = Parameters<typeof interpretAcceptRow>[0];
type StatusRow = Parameters<typeof interpretStatusRow>[0];

describe("P4-02 invitation request contract", () => {
  it("accepts only an invitee UUID", () => {
    expect(
      sendGroupInvitationRequestSchema.safeParse({ inviteeId }).success,
    ).toBe(true);
    expect(
      sendGroupInvitationRequestSchema.safeParse({
        inviteeId,
        role: "leader",
      }).success,
    ).toBe(false);
    expect(
      sendGroupInvitationRequestSchema.safeParse({ inviteeId: "nope" }).success,
    ).toBe(false);
  });

  it("maps every invitation denial code to a presented 409 conflict", () => {
    for (const code of GROUP_INVITATION_DENIAL_CODES) {
      expect(GROUP_UI_ERROR_CODES).toContain(code);
      expect(httpStatusForGroupError(code)).toBe(409);
    }
    expect(httpStatusForGroupError("NOT_GROUP_LEADER")).toBe(403);
  });
});

describe("P4-02 and P4-03 invitation result interpretation", () => {
  const sent = {
    outcome: "sent",
    error_code: null,
    invitation_id: invitationId,
    group_id: groupId,
    class_id: classId,
    invitee_id: inviteeId,
    expires_at: "2026-09-13T01:00:00.000Z",
    available_seats: 1,
  };

  it("returns sent and replayed invitations", () => {
    expect(interpretSendRow(row<SendRow>(sent)).data).toEqual({
      outcome: "sent",
      invitationId,
      groupId,
      inviteeId,
      expiresAt: "2026-09-13T01:00:00.000Z",
      availableSeats: 1,
    });
    expect(
      interpretSendRow(row<SendRow>({ ...sent, outcome: "already_pending" }))
        .data?.outcome,
    ).toBe("already_pending");
  });

  it("maps committed denials and fails closed on unknown outcomes", () => {
    const full = interpretSendRow(
      row<SendRow>({
        ...sent,
        outcome: "denied",
        error_code: "GROUP_FULL",
        invitation_id: null,
        expires_at: null,
        available_seats: 0,
      }),
    );
    expect(full.status).toBe(409);
    expect(full.error).toMatchObject({
      code: "GROUP_FULL",
      details: { availableSeats: 0 },
    });
    expect(
      interpretSendRow(
        row<SendRow>({ ...sent, outcome: "denied", error_code: "WHATEVER" }),
      ).error?.code,
    ).toBe("FORBIDDEN");
    expect(interpretSendRow(undefined).error?.code).toBe("FORBIDDEN");
  });

  it("interprets acceptance, including revalidation denials", () => {
    const accepted = {
      outcome: "accepted",
      error_code: null,
      invitation_id: invitationId,
      group_id: groupId,
      class_id: classId,
      membership_id: "40000000-0000-4000-8000-000000004201",
      member_count: 2,
      maximum_size: 3,
    };
    expect(interpretAcceptRow(row<AcceptRow>(accepted)).data).toMatchObject({
      outcome: "accepted",
      memberCount: 2,
    });

    const expired = interpretAcceptRow(
      row<AcceptRow>({
        ...accepted,
        outcome: "denied",
        error_code: "INVITATION_EXPIRED",
        membership_id: null,
      }),
    );
    expect(expired.status).toBe(409);
    expect(expired.error?.code).toBe("INVITATION_EXPIRED");
    expect(
      interpretAcceptRow(row<AcceptRow>({ ...accepted, membership_id: null }))
        .error?.code,
    ).toBe("FORBIDDEN");
  });

  it("requires the expected cancel or decline outcome", () => {
    const cancelled = {
      outcome: "cancelled",
      error_code: null,
      invitation_id: invitationId,
      group_id: groupId,
      class_id: classId,
      status: "cancelled",
    };
    expect(
      interpretStatusRow(row<StatusRow>(cancelled), "cancelled").data?.outcome,
    ).toBe("cancelled");
    expect(
      interpretStatusRow(row<StatusRow>(cancelled), "declined").error?.code,
    ).toBe("FORBIDDEN");
    expect(
      interpretStatusRow(
        row<StatusRow>({
          ...cancelled,
          outcome: "denied",
          error_code: "INVITATION_NOT_PENDING",
        }),
        "declined",
      ).error?.code,
    ).toBe("INVITATION_NOT_PENDING");
  });
});

describe("P4-03 invitation detail read model", () => {
  const detail = {
    id: invitationId,
    status: "pending",
    createdAt: "2026-09-12T01:00:00.123456+00:00",
    expiresAt: "2026-09-13T01:00:00.123456+00:00",
    respondedAt: null,
    classId,
    className: "Biology M.4",
    group: {
      id: groupId,
      name: "Leaf Team",
      status: "forming",
      leader: { id: "00000000-0000-4000-8000-000000004202", displayName: "L" },
      members: [
        {
          id: "00000000-0000-4000-8000-000000004202",
          displayName: "L",
          role: "leader",
        },
      ],
      memberCount: 1,
      maximumSize: 3,
      availableSeats: 2,
    },
    inviter: { id: "00000000-0000-4000-8000-000000004202", displayName: "L" },
    viewer: { isInvitee: true, canRespond: true, cannotRespondReason: null },
    refreshedAt: "2026-09-12T01:00:00.123456+00:00",
  };

  it("parses the invitee view and rejects unknown reasons", () => {
    expect(
      parseReadModel(groupInvitationDetailSchema, detail).data?.group.name,
    ).toBe("Leaf Team");
    expect(
      parseReadModel(groupInvitationDetailSchema, {
        ...detail,
        viewer: { ...detail.viewer, cannotRespondReason: "NOPE" },
      }).error?.code,
    ).toBe("FORBIDDEN");
  });
});
