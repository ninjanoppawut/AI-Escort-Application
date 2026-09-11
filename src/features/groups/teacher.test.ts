import { describe, expect, it } from "vitest";

import {
  GROUP_ERROR_PRESENTATIONS,
  GROUP_TEACHER_DENIAL_CODES,
  GROUP_UI_ERROR_CODES,
  httpStatusForGroupError,
  mapPostgresGroupError,
} from "./errors";
import {
  buildCreateTeacherGroupArgs,
  buildMoveStudentArgs,
  createTeacherGroupRequestSchema,
  interpretCreateTeacherGroupRow,
  interpretMoveStudentRow,
  moveStudentRequestSchema,
} from "./teacher";

const classId = "20000000-0000-4000-8000-000000005101";
const groupId = "30000000-0000-4000-8000-000000005101";
const otherGroupId = "30000000-0000-4000-8000-000000005102";
const studentId = "00000000-0000-4000-8000-000000005103";
const successorId = "00000000-0000-4000-8000-000000005104";

// PostgREST types RETURNS TABLE columns as non-null; the RPCs return nulls.
function row<T>(value: Record<string, unknown>) {
  return value as unknown as T;
}

type CreateRow = Parameters<typeof interpretCreateTeacherGroupRow>[0];
type MoveRow = Parameters<typeof interpretMoveStudentRow>[0];

describe("P5 teacher group request contracts", () => {
  it("normalizes teacher group creation input and builds trusted RPC args", () => {
    const parsed = createTeacherGroupRequestSchema.parse({
      name: "  Teacher Team ",
      description: "",
      leaderStudentId: studentId,
      memberStudentIds: [successorId],
    });

    expect(parsed).toEqual({
      name: "Teacher Team",
      description: null,
      leaderStudentId: studentId,
      memberStudentIds: [successorId],
    });
    expect(buildCreateTeacherGroupArgs(classId, parsed)).toEqual({
      target_class_id: classId,
      group_name: "Teacher Team",
      member_student_ids: [successorId],
      leader_student_id: studentId,
    });
    expect(
      buildCreateTeacherGroupArgs(
        classId,
        createTeacherGroupRequestSchema.parse({ name: "Empty Team" }),
      ),
    ).toEqual({
      target_class_id: classId,
      group_name: "Empty Team",
      member_student_ids: [],
    });
  });

  it("rejects browser-controlled or malformed fields", () => {
    expect(
      createTeacherGroupRequestSchema.safeParse({
        name: "Team",
        creatorType: "student",
      }).success,
    ).toBe(false);
    expect(
      createTeacherGroupRequestSchema.safeParse({
        name: "Team",
        memberStudentIds: ["not-a-uuid"],
      }).success,
    ).toBe(false);
    expect(
      moveStudentRequestSchema.safeParse({ studentId, destinationGroupId: "x" })
        .success,
    ).toBe(false);
  });

  it("builds move args for a group move and a return to unassigned", () => {
    expect(
      buildMoveStudentArgs(
        classId,
        moveStudentRequestSchema.parse({
          studentId,
          destinationGroupId: groupId,
          successorLeaderId: successorId,
        }),
      ),
    ).toEqual({
      target_class_id: classId,
      target_student_id: studentId,
      target_destination_group_id: groupId,
      target_successor_leader_id: successorId,
    });
    expect(
      buildMoveStudentArgs(
        classId,
        moveStudentRequestSchema.parse({ studentId, destinationGroupId: null }),
      ),
    ).toEqual({ target_class_id: classId, target_student_id: studentId });
  });

  it("presents every teacher denial as a Thai 409 conflict", () => {
    for (const code of GROUP_TEACHER_DENIAL_CODES) {
      expect(GROUP_UI_ERROR_CODES).toContain(code);
      expect(httpStatusForGroupError(code)).toBe(409);
      expect(GROUP_ERROR_PRESENTATIONS[code].title).not.toBe("");
    }
    expect(mapPostgresGroupError("group_in_active_session")).toBe(
      "GROUP_IN_ACTIVE_SESSION",
    );
  });
});

describe("P5 teacher group result interpretation", () => {
  const created = {
    outcome: "created",
    error_code: null,
    group_id: groupId,
    class_id: classId,
    member_count: 2,
    current_group_count: 1,
    maximum_groups: 2,
    remaining_group_slots: 1,
  };

  it("returns created teacher groups and slot counts", () => {
    expect(
      interpretCreateTeacherGroupRow(row<CreateRow>(created)).data,
    ).toEqual({
      outcome: "created",
      groupId,
      classId,
      memberCount: 2,
      currentGroupCount: 1,
      maximumGroups: 2,
      remainingGroupSlots: 1,
    });
  });

  it("maps teacher denials and fails closed on unknown codes", () => {
    const limit = interpretCreateTeacherGroupRow(
      row<CreateRow>({
        ...created,
        outcome: "denied",
        error_code: "GROUP_LIMIT_REACHED",
        group_id: null,
        current_group_count: 2,
        remaining_group_slots: 0,
      }),
    );
    expect(limit.status).toBe(409);
    expect(limit.error).toMatchObject({
      code: "GROUP_LIMIT_REACHED",
      details: { currentGroupCount: 2, remainingGroupSlots: 0 },
    });
    expect(
      interpretCreateTeacherGroupRow(
        row<CreateRow>({ ...created, outcome: "denied", error_code: "NOPE" }),
      ).error?.code,
    ).toBe("FORBIDDEN");
  });

  it("interprets moves, no-op moves, and successor denials", () => {
    const moved = {
      outcome: "moved",
      error_code: null,
      source_group_id: groupId,
      destination_group_id: otherGroupId,
      student_id: studentId,
      leader_changed: true,
    };
    expect(interpretMoveStudentRow(row<MoveRow>(moved)).data).toEqual({
      outcome: "moved",
      sourceGroupId: groupId,
      destinationGroupId: otherGroupId,
      studentId,
      leaderChanged: true,
    });
    expect(
      interpretMoveStudentRow(
        row<MoveRow>({
          ...moved,
          outcome: "unchanged",
          destination_group_id: null,
          leader_changed: false,
        }),
      ).data,
    ).toMatchObject({ outcome: "unchanged", destinationGroupId: null });

    const successor = interpretMoveStudentRow(
      row<MoveRow>({
        ...moved,
        outcome: "denied",
        error_code: "LEADER_SUCCESSOR_REQUIRED",
      }),
    );
    expect(successor.status).toBe(409);
    expect(successor.error?.code).toBe("LEADER_SUCCESSOR_REQUIRED");
  });
});
