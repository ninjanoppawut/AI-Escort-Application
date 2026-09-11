import { describe, expect, it } from "vitest";

import {
  buildCreateStudentGroupArgs,
  interpretCreateStudentGroupRow,
  type CreateStudentGroupRow,
} from "./create-result";

const classId = "20000000-0000-4000-8000-000000003201";
const groupId = "30000000-0000-4000-8000-000000003201";
const leaderId = "00000000-0000-4000-8000-000000003203";

const createdRow = {
  outcome: "created",
  error_code: null,
  group_id: groupId,
  class_id: classId,
  name: "Green Explorers",
  description: null,
  status: "forming",
  leader_id: leaderId,
  current_group_count: 1,
  maximum_groups: 2,
  remaining_group_slots: 1,
  created_at: "2026-09-12T01:00:00.000Z",
};

// PostgREST types RETURNS TABLE columns as non-null; the RPC returns nulls.
function asRow(value: Record<string, unknown>) {
  return value as unknown as CreateStudentGroupRow;
}

describe("P3-02 create_student_group result contract", () => {
  it("sends only trusted RPC arguments", () => {
    expect(
      buildCreateStudentGroupArgs({
        classId,
        name: "Green Explorers",
        description: null,
      }),
    ).toEqual({ target_class_id: classId, group_name: "Green Explorers" });
    expect(
      buildCreateStudentGroupArgs({
        classId,
        name: "Green Explorers",
        description: "Group 1",
      }),
    ).toEqual({
      target_class_id: classId,
      group_name: "Green Explorers",
      group_description: "Group 1",
    });
  });

  it("returns the created group and authoritative slot counts", () => {
    expect(interpretCreateStudentGroupRow(asRow(createdRow))).toEqual({
      data: {
        group: {
          id: groupId,
          classId,
          name: "Green Explorers",
          description: null,
          status: "forming",
          leaderId,
          createdAt: "2026-09-12T01:00:00.000Z",
        },
        slots: {
          currentGroupCount: 1,
          maximumGroups: 2,
          remainingGroupSlots: 1,
        },
      },
    });
  });

  it("maps committed denials to 409 errors with slot details", () => {
    const result = interpretCreateStudentGroupRow(
      asRow({
        ...createdRow,
        outcome: "denied",
        error_code: "GROUP_LIMIT_REACHED",
        group_id: null,
        name: null,
        status: null,
        leader_id: null,
        created_at: null,
        current_group_count: 2,
        remaining_group_slots: 0,
      }),
    );

    expect(result.status).toBe(409);
    expect(result.error).toMatchObject({
      code: "GROUP_LIMIT_REACHED",
      retryable: false,
      details: {
        currentGroupCount: 2,
        maximumGroups: 2,
        remainingGroupSlots: 0,
      },
    });
  });

  it("fails closed on unknown or incomplete results", () => {
    expect(interpretCreateStudentGroupRow(undefined).error?.code).toBe(
      "FORBIDDEN",
    );
    expect(
      interpretCreateStudentGroupRow(
        asRow({ ...createdRow, outcome: "denied", error_code: "SOMETHING" }),
      ).error?.code,
    ).toBe("FORBIDDEN");
    expect(
      interpretCreateStudentGroupRow(asRow({ ...createdRow, leader_id: null }))
        .error?.code,
    ).toBe("FORBIDDEN");
  });
});
