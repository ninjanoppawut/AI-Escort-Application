import { describe, expect, it } from "vitest";

import { parseGroupBoard } from "./board";

const board = {
  classId: "20000000-0000-4000-8000-000000003301",
  className: "Biology M.4",
  formationStatus: "open",
  allowStudentGroups: true,
  maximumGroups: 2,
  currentGroupCount: 1,
  remainingGroupSlots: 1,
  minimumGroupSize: 2,
  maximumGroupSize: 3,
  viewer: {
    userId: "00000000-0000-4000-8000-000000003302",
    role: "student",
    currentGroupId: "30000000-0000-4000-8000-000000003301",
    isLeader: true,
    hasCreatedStudentGroup: true,
    canCreateGroup: false,
    cannotCreateReason: "STUDENT_ALREADY_IN_GROUP",
  },
  groups: [
    {
      id: "30000000-0000-4000-8000-000000003301",
      name: "Leaf Team",
      description: null,
      status: "forming",
      creatorType: "student",
      leader: {
        id: "00000000-0000-4000-8000-000000003302",
        displayName: "Ada Leader",
      },
      memberCount: 1,
      maximumSize: 3,
      availableSeats: 2,
      meetsMinimumSize: false,
      isAcceptingMembers: true,
      members: [
        {
          id: "00000000-0000-4000-8000-000000003302",
          displayName: "Ada Leader",
          role: "leader",
        },
      ],
      createdAt: "2026-09-12T01:00:00.123456+00:00",
    },
  ],
  unassignedStudents: [],
  refreshedAt: "2026-09-12T01:00:00.123456+00:00",
};

describe("P3-03 group board database-boundary schema", () => {
  it("accepts the authoritative RPC payload", () => {
    const result = parseGroupBoard(board);
    expect(result.data?.groups[0]?.leader?.displayName).toBe("Ada Leader");
    expect(result.data?.viewer.cannotCreateReason).toBe(
      "STUDENT_ALREADY_IN_GROUP",
    );
  });

  it("fails closed on unknown reasons, statuses, or roles", () => {
    expect(
      parseGroupBoard({
        ...board,
        viewer: { ...board.viewer, cannotCreateReason: "SOMETHING_ELSE" },
      }).error?.code,
    ).toBe("FORBIDDEN");
    expect(
      parseGroupBoard({
        ...board,
        groups: [{ ...board.groups[0], status: "deleted" }],
      }).error?.code,
    ).toBe("FORBIDDEN");
    expect(
      parseGroupBoard({
        ...board,
        viewer: { ...board.viewer, role: "admin" },
      }).error?.code,
    ).toBe("FORBIDDEN");
  });
});
