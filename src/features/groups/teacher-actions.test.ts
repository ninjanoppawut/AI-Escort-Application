import { describe, expect, it } from "vitest";

import type { GroupBoard, GroupBoardGroup } from "./board";
import { GroupApiRequestError, groupErrorCodeOf } from "./client/request";
import {
  approveBlockedReason,
  claimGroupStateLabel,
  claimResetBlockedMessage,
  deleteOutcomeMessage,
  lockOutcomeMessage,
  matchesTeacherGroupFilter,
  moveDestinationOptions,
  moveOutcomeMessage,
  presentTeacherGroupError,
  successorCandidates,
  teacherBoardCounts,
  type CreationClaim,
} from "./teacher-actions";

const classId = "20000000-0000-4000-8000-000000005301";
const ada = { id: "00000000-0000-4000-8000-000000005301", displayName: "Ada" };
const bo = { id: "00000000-0000-4000-8000-000000005302", displayName: "Bo" };
const cy = { id: "00000000-0000-4000-8000-000000005303", displayName: "Cy" };

function group(overrides: Partial<GroupBoardGroup>): GroupBoardGroup {
  return {
    id: "30000000-0000-4000-8000-000000005301",
    name: "Leaf Team",
    description: null,
    status: "forming",
    creatorType: "student",
    leader: ada,
    memberCount: 2,
    maximumSize: 3,
    availableSeats: 1,
    meetsMinimumSize: true,
    isAcceptingMembers: true,
    members: [
      { ...ada, role: "leader" },
      { ...bo, role: "member" },
    ],
    createdAt: "2026-09-12T01:00:00.000000+00:00",
    ...overrides,
  };
}

const leaf = group({});
const root = group({
  id: "30000000-0000-4000-8000-000000005302",
  name: "Root Team",
  status: "locked",
  leader: null,
  memberCount: 0,
  availableSeats: 3,
  meetsMinimumSize: false,
  members: [],
});
const full = group({
  id: "30000000-0000-4000-8000-000000005303",
  name: "Full Team",
  status: "ready",
  memberCount: 3,
  availableSeats: 0,
});

const board: GroupBoard = {
  classId,
  className: "Biology",
  formationStatus: "open",
  allowStudentGroups: true,
  maximumGroups: 4,
  currentGroupCount: 3,
  remainingGroupSlots: 1,
  minimumGroupSize: 2,
  maximumGroupSize: 3,
  viewer: {
    userId: "00000000-0000-4000-8000-000000005399",
    role: "teacher",
    currentGroupId: null,
    isLeader: false,
    hasCreatedStudentGroup: false,
    canCreateGroup: false,
    cannotCreateReason: "FORBIDDEN",
    pendingInvitations: [],
  },
  groups: [leaf, root, full],
  unassignedStudents: [cy],
  refreshedAt: "2026-09-12T02:00:00.000000+00:00",
};

describe("teacher board helpers", () => {
  it("counts review work and filters groups", () => {
    expect(teacherBoardCounts(board)).toEqual({
      awaitingApproval: 1,
      locked: 1,
      belowMinimum: 1,
      unassigned: 1,
    });
    expect(
      board.groups
        .filter((item) => matchesTeacherGroupFilter(item, "below_minimum"))
        .map((item) => item.name),
    ).toEqual(["Root Team"]);
    expect(
      board.groups.filter((item) => matchesTeacherGroupFilter(item, "all")),
    ).toHaveLength(3);
  });

  it("offers unassigned plus other groups, explaining locked and full ones", () => {
    const options = moveDestinationOptions(board, leaf.id);
    expect(
      options.map((option) => [option.name, option.disabledReason]),
    ).toEqual([
      ["ยังไม่มีกลุ่ม", null],
      ["Root Team", "ล็อกอยู่ ปลดล็อกก่อนย้ายเข้า"],
      ["Full Team", "เต็มแล้ว"],
    ]);
    expect(moveDestinationOptions(board, null)[0]?.groupId).toBe(leaf.id);
  });

  it("requires successors only when moving a populated group's leader", () => {
    expect(successorCandidates(leaf, ada.id)).toEqual([bo]);
    expect(successorCandidates(leaf, bo.id)).toEqual([]);
    expect(successorCandidates(undefined, cy.id)).toEqual([]);
  });

  it("explains why approval is unavailable", () => {
    expect(approveBlockedReason(leaf, board)).toBeNull();
    expect(approveBlockedReason(root, board)).toBe(
      "กลุ่มล็อกอยู่ ปลดล็อกก่อนอนุมัติ",
    );
    expect(
      approveBlockedReason(group({ meetsMinimumSize: false }), board),
    ).toBe("ต้องมีสมาชิกอย่างน้อย 2 คนก่อนอนุมัติ");
    expect(approveBlockedReason(group({ status: "approved" }), board)).toBe(
      "ครูอนุมัติกลุ่มนี้แล้ว",
    );
  });
});

describe("teacher outcome copy", () => {
  it("summarizes moves, locks, deletes, and archives", () => {
    expect(
      moveOutcomeMessage("Ada", "Root Team", {
        outcome: "moved",
        sourceGroupId: leaf.id,
        destinationGroupId: root.id,
        studentId: ada.id,
        leaderChanged: true,
      }),
    ).toBe("ย้าย Ada ไป Root Team แล้ว · กลุ่มเดิมมีหัวหน้าคนใหม่แล้ว");
    expect(
      moveOutcomeMessage("Bo", null, {
        outcome: "moved",
        sourceGroupId: leaf.id,
        destinationGroupId: null,
        studentId: bo.id,
        leaderChanged: false,
      }),
    ).toBe("นำ Bo ออกจากกลุ่มแล้ว");
    expect(
      lockOutcomeMessage("Leaf Team", {
        outcome: "locked",
        groupId: leaf.id,
        classId,
        cancelledInvitations: 2,
      }),
    ).toBe("ล็อกกลุ่ม Leaf Team แล้ว · ยกเลิกคำเชิญที่รอตอบ 2 รายการ");
    const deleted = {
      outcome: "deleted" as const,
      groupId: leaf.id,
      classId,
      releasedMembers: 2,
      remainingGroupSlots: 2,
    };
    expect(deleteOutcomeMessage("Leaf Team", deleted)).toBe(
      "ลบกลุ่ม Leaf Team แล้ว · สมาชิก 2 คนกลับไปยังไม่มีกลุ่ม · เหลือช่องกลุ่ม 2 กลุ่ม",
    );
    expect(
      deleteOutcomeMessage("Leaf Team", { ...deleted, outcome: "archived" }),
    ).toBe(
      "เก็บถาวรกลุ่ม Leaf Team แทนการลบ เพราะมีประวัติกิจกรรม · สมาชิก 2 คนกลับไปยังไม่มีกลุ่ม",
    );
  });

  it("explains claim state and reset blockers", () => {
    const claim: CreationClaim = {
      claimId: "50000000-0000-4000-8000-000000005301",
      student: ada,
      groupId: leaf.id,
      groupName: leaf.name,
      groupState: "current",
      studentInGroup: true,
      canReset: false,
      cannotResetReason: "INVALID_STATUS_TRANSITION",
      claimedAt: "2026-09-12T01:00:00.000000+00:00",
    };
    expect(claimGroupStateLabel(claim)).toBe(
      "กลุ่มเดิมยังอยู่ และนักเรียนยังเป็นสมาชิก",
    );
    expect(claimResetBlockedMessage(claim)).toContain("ลบหรือเก็บถาวรกลุ่ม");
    expect(
      claimResetBlockedMessage({
        ...claim,
        cannotResetReason: "GROUP_IN_ACTIVE_SESSION",
      }),
    ).toContain("ระหว่างกิจกรรม");
    expect(
      claimResetBlockedMessage({
        ...claim,
        groupState: "deleted",
        canReset: true,
        cannotResetReason: null,
      }),
    ).toBeNull();
  });

  it("addresses teachers rather than students in error copy", () => {
    const error = new GroupApiRequestError({
      code: "GROUP_LIMIT_REACHED",
      message: "",
      retryable: false,
      details: {},
    });
    expect(
      presentTeacherGroupError(groupErrorCodeOf(error)).description,
    ).toContain("เพิ่มจำนวนกลุ่มในการตั้งค่าชั้นเรียน");
    expect(presentTeacherGroupError("FORBIDDEN").description).toContain("ครู");
    expect(presentTeacherGroupError("GROUP_FULL").title).toBe(
      "กลุ่มนี้เต็มแล้ว",
    );
    expect(presentTeacherGroupError("NETWORK").title).toBe(
      "เชื่อมต่อไม่สำเร็จ",
    );
  });
});
