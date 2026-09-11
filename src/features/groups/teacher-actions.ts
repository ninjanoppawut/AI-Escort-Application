import type { GroupBoard, GroupBoardGroup } from "./board";
import { presentGroupError, type GroupClientErrorCode } from "./client/request";
import type { GroupUiErrorCode } from "./errors";
import type {
  CreationClaims,
  DeleteOrArchiveResult,
  LockGroupResult,
} from "./lifecycle";
import type { MoveStudentResult } from "./teacher";

export type BoardPerson = GroupBoard["unassignedStudents"][number];
export type CreationClaim = CreationClaims["claims"][number];

export const TEACHER_GROUP_FILTERS = [
  "all",
  "forming",
  "ready",
  "approved",
  "locked",
  "below_minimum",
] as const;

export type TeacherGroupFilter = (typeof TEACHER_GROUP_FILTERS)[number];

export const TEACHER_GROUP_FILTER_LABELS: Record<TeacherGroupFilter, string> = {
  all: "ทั้งหมด",
  forming: "กำลังจัดกลุ่ม",
  ready: "พร้อมส่งให้ครู",
  approved: "ครูอนุมัติแล้ว",
  locked: "ล็อกกลุ่มแล้ว",
  below_minimum: "ยังไม่ครบขั้นต่ำ",
};

export function matchesTeacherGroupFilter(
  group: GroupBoardGroup,
  filter: TeacherGroupFilter,
) {
  if (filter === "all") return true;
  if (filter === "below_minimum") return !group.meetsMinimumSize;
  return group.status === filter;
}

export function teacherBoardCounts(board: GroupBoard) {
  return {
    awaitingApproval: board.groups.filter((group) => group.status === "ready")
      .length,
    locked: board.groups.filter((group) => group.status === "locked").length,
    belowMinimum: board.groups.filter((group) => !group.meetsMinimumSize)
      .length,
    unassigned: board.unassignedStudents.length,
  };
}

export interface MoveDestinationOption {
  /** Null returns the student to the unassigned list. */
  groupId: string | null;
  name: string;
  detail: string;
  disabledReason: string | null;
}

export function moveDestinationKey(option: MoveDestinationOption) {
  return option.groupId ?? "unassigned";
}

/** Destinations offered in the move dialog; the RPC still revalidates all of them. */
export function moveDestinationOptions(
  board: GroupBoard,
  sourceGroupId: string | null,
): MoveDestinationOption[] {
  const groups = board.groups
    .filter(
      (group) => group.id !== sourceGroupId && group.status !== "archived",
    )
    .map((group) => ({
      groupId: group.id,
      name: group.name,
      detail: `${group.memberCount}/${group.maximumSize} คน · ว่าง ${group.availableSeats} ที่`,
      disabledReason:
        group.status === "locked"
          ? "ล็อกอยู่ ปลดล็อกก่อนย้ายเข้า"
          : group.availableSeats === 0
            ? "เต็มแล้ว"
            : null,
    }));
  if (!sourceGroupId) return groups;
  return [
    {
      groupId: null,
      name: "ยังไม่มีกลุ่ม",
      detail: "นำออกจากกลุ่มโดยไม่ย้ายเข้ากลุ่มอื่น",
      disabledReason: null,
    },
    ...groups,
  ];
}

/** Members who can take over when the moving student leads a populated group. */
export function successorCandidates(
  source: GroupBoardGroup | undefined,
  studentId: string,
): BoardPerson[] {
  const moving = source?.members.find((member) => member.id === studentId);
  if (!source || moving?.role !== "leader") return [];
  return source.members
    .filter((member) => member.id !== studentId)
    .map(({ id, displayName }) => ({ id, displayName }));
}

export function approveBlockedReason(
  group: GroupBoardGroup,
  board: Pick<GroupBoard, "minimumGroupSize">,
) {
  if (group.status === "approved") return "ครูอนุมัติกลุ่มนี้แล้ว";
  if (group.status === "locked") return "กลุ่มล็อกอยู่ ปลดล็อกก่อนอนุมัติ";
  if (!group.meetsMinimumSize) {
    return `ต้องมีสมาชิกอย่างน้อย ${board.minimumGroupSize} คนก่อนอนุมัติ`;
  }
  return null;
}

export function moveOutcomeMessage(
  studentName: string,
  destinationName: string | null,
  result: MoveStudentResult,
) {
  if (result.outcome === "unchanged") {
    return `${studentName} อยู่ในตำแหน่งนี้อยู่แล้ว ไม่มีการเปลี่ยนแปลง`;
  }
  const moved = destinationName
    ? `ย้าย ${studentName} ไป ${destinationName} แล้ว`
    : `นำ ${studentName} ออกจากกลุ่มแล้ว`;
  return result.leaderChanged
    ? `${moved} · กลุ่มเดิมมีหัวหน้าคนใหม่แล้ว`
    : moved;
}

export function lockOutcomeMessage(groupName: string, result: LockGroupResult) {
  return result.cancelledInvitations > 0
    ? `ล็อกกลุ่ม ${groupName} แล้ว · ยกเลิกคำเชิญที่รอตอบ ${result.cancelledInvitations} รายการ`
    : `ล็อกกลุ่ม ${groupName} แล้ว`;
}

export function deleteOutcomeMessage(
  groupName: string,
  result: DeleteOrArchiveResult,
) {
  const released =
    result.releasedMembers > 0
      ? ` · สมาชิก ${result.releasedMembers} คนกลับไปยังไม่มีกลุ่ม`
      : "";
  return result.outcome === "archived"
    ? `เก็บถาวรกลุ่ม ${groupName} แทนการลบ เพราะมีประวัติกิจกรรม${released}`
    : `ลบกลุ่ม ${groupName} แล้ว${released} · เหลือช่องกลุ่ม ${result.remainingGroupSlots} กลุ่ม`;
}

export function claimGroupStateLabel(claim: CreationClaim) {
  switch (claim.groupState) {
    case "current":
      return claim.studentInGroup
        ? "กลุ่มเดิมยังอยู่ และนักเรียนยังเป็นสมาชิก"
        : "กลุ่มเดิมยังอยู่ แต่นักเรียนออกแล้ว";
    case "deleted":
      return "กลุ่มเดิมถูกลบแล้ว";
    case "archived":
      return "กลุ่มเดิมเก็บถาวรแล้ว";
    default:
      return "ไม่พบกลุ่มเดิม";
  }
}

export function claimResetBlockedMessage(claim: CreationClaim) {
  if (claim.canReset) return null;
  if (claim.cannotResetReason === "GROUP_IN_ACTIVE_SESSION") {
    return "รีเซ็ตไม่ได้ระหว่างกิจกรรม เพราะกลุ่มเดิมอยู่ในรอบสำรวจที่กำลังทำงาน";
  }
  return "รีเซ็ตได้เมื่อจัดการกลุ่มเดิมแล้ว: ลบหรือเก็บถาวรกลุ่ม หรือย้ายนักเรียนออกจากกลุ่มนั้น";
}

// Student-facing copy for these codes addresses the student; teachers need
// the teacher's way out instead.
const TEACHER_ERROR_OVERRIDES: Partial<
  Record<GroupUiErrorCode, { title: string; description: string }>
> = {
  FORBIDDEN: {
    title: "คุณไม่มีสิทธิ์จัดการกลุ่มนี้",
    description: "ต้องเป็นครูของชั้นเรียนนี้จึงจะจัดการกลุ่มได้",
  },
  GROUP_LIMIT_REACHED: {
    title: "กลุ่มครบจำนวนแล้ว",
    description:
      "ครบจำนวนกลุ่มสูงสุดของชั้นเรียนแล้ว เพิ่มจำนวนกลุ่มในการตั้งค่าชั้นเรียนก่อน",
  },
  STUDENT_ALREADY_IN_GROUP: {
    title: "นักเรียนอยู่ในกลุ่มอื่นแล้ว",
    description: "ใช้การย้ายนักเรียนแทน หรือรีเฟรชข้อมูลกลุ่ม",
  },
  GROUP_LOCKED: {
    title: "กลุ่มถูกล็อกแล้ว",
    description: "ปลดล็อกกลุ่มก่อนเปลี่ยนสมาชิกหรือหัวหน้ากลุ่ม",
  },
};

export function presentTeacherGroupError(code: GroupClientErrorCode) {
  return code === "NETWORK"
    ? presentGroupError(code)
    : (TEACHER_ERROR_OVERRIDES[code] ?? presentGroupError(code));
}
