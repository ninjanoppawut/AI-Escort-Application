import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
} from "./contracts";
import { groupFailure, type GroupOperationResult } from "./create-result";
import { isGroupTeacherDenialCode } from "./errors";

type Functions = Database["public"]["Functions"];
type CreateTeacherGroupRow =
  Functions["create_teacher_group"]["Returns"][number];
type MoveStudentRow =
  Functions["move_student_between_groups"]["Returns"][number];

export const createTeacherGroupRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH),
    description: z
      .preprocess(
        (value) => (value === null ? undefined : value),
        z.string().trim().max(GROUP_DESCRIPTION_MAX_LENGTH).optional(),
      )
      .transform((value) => (value ? value : null)),
    leaderStudentId: z.uuid().nullable().default(null),
    memberStudentIds: z.array(z.uuid()).max(50).default([]),
  })
  .strict();

export const moveStudentRequestSchema = z
  .object({
    studentId: z.uuid(),
    destinationGroupId: z.uuid().nullable(),
    successorLeaderId: z.uuid().nullable().default(null),
  })
  .strict();

export type CreateTeacherGroupRequest = z.infer<
  typeof createTeacherGroupRequestSchema
>;
export type MoveStudentRequest = z.infer<typeof moveStudentRequestSchema>;

export interface CreateTeacherGroupResult {
  outcome: "created";
  groupId: string;
  classId: string;
  memberCount: number;
  currentGroupCount: number;
  maximumGroups: number;
  remainingGroupSlots: number;
}

export interface MoveStudentResult {
  outcome: "moved" | "unchanged";
  sourceGroupId: string | null;
  destinationGroupId: string | null;
  studentId: string;
  leaderChanged: boolean;
}

function denial(
  row: { error_code: string | null },
  details: Record<string, unknown> = {},
) {
  return isGroupTeacherDenialCode(row.error_code)
    ? groupFailure(row.error_code, details)
    : groupFailure("FORBIDDEN");
}

export function buildCreateTeacherGroupArgs(
  classId: string,
  input: CreateTeacherGroupRequest,
): Functions["create_teacher_group"]["Args"] {
  const args: Functions["create_teacher_group"]["Args"] = {
    target_class_id: classId,
    group_name: input.name,
    member_student_ids: input.memberStudentIds,
  };
  if (input.description) args.group_description = input.description;
  if (input.leaderStudentId) args.leader_student_id = input.leaderStudentId;
  return args;
}

export function buildMoveStudentArgs(
  classId: string,
  input: MoveStudentRequest,
): Functions["move_student_between_groups"]["Args"] {
  const args: Functions["move_student_between_groups"]["Args"] = {
    target_class_id: classId,
    target_student_id: input.studentId,
  };
  if (input.destinationGroupId) {
    args.target_destination_group_id = input.destinationGroupId;
  }
  if (input.successorLeaderId) {
    args.target_successor_leader_id = input.successorLeaderId;
  }
  return args;
}

export function interpretCreateTeacherGroupRow(
  row: CreateTeacherGroupRow | undefined,
): GroupOperationResult<CreateTeacherGroupResult> {
  if (!row) return groupFailure("FORBIDDEN");
  const slots = {
    currentGroupCount: row.current_group_count,
    maximumGroups: row.maximum_groups,
    remainingGroupSlots: row.remaining_group_slots,
  };
  if (row.outcome === "denied") return denial(row, slots);
  if (row.outcome !== "created" || !row.group_id) {
    return groupFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: "created",
      groupId: row.group_id,
      classId: row.class_id,
      memberCount: row.member_count,
      ...slots,
    },
  };
}

export function interpretMoveStudentRow(
  row: MoveStudentRow | undefined,
): GroupOperationResult<MoveStudentResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") return denial(row);
  if (row.outcome !== "moved" && row.outcome !== "unchanged") {
    return groupFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: row.outcome,
      sourceGroupId: row.source_group_id ?? null,
      destinationGroupId: row.destination_group_id ?? null,
      studentId: row.student_id,
      leaderChanged: row.leader_changed,
    },
  };
}
