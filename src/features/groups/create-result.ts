import type { Database } from "@/lib/supabase/database.types";

import type {
  CreateStudentGroupRequest,
  CreatedStudentGroup,
  GroupStatus,
} from "./contracts";
import {
  groupApiError,
  httpStatusForGroupError,
  isGroupCreationDenialCode,
  type GroupUiErrorCode,
} from "./errors";

export type GroupOperationResult<T> =
  | { data: T; error?: never; status?: never }
  | { data?: never; error: ReturnType<typeof groupApiError>; status: number };

type CreateStudentGroupFunction =
  Database["public"]["Functions"]["create_student_group"];
export type CreateStudentGroupRow =
  CreateStudentGroupFunction["Returns"][number];

export function groupFailure(
  code: GroupUiErrorCode,
  details: Record<string, unknown> = {},
): GroupOperationResult<never> {
  return {
    error: groupApiError(code, details),
    status: httpStatusForGroupError(code),
  };
}

export function buildCreateStudentGroupArgs(
  input: CreateStudentGroupRequest,
): CreateStudentGroupFunction["Args"] {
  const args: CreateStudentGroupFunction["Args"] = {
    target_class_id: input.classId,
    group_name: input.name,
  };
  if (input.description) args.group_description = input.description;
  return args;
}

export function interpretCreateStudentGroupRow(
  row: CreateStudentGroupRow | undefined,
): GroupOperationResult<CreatedStudentGroup> {
  if (!row) return groupFailure("FORBIDDEN");

  const slots = {
    currentGroupCount: row.current_group_count,
    maximumGroups: row.maximum_groups,
    remainingGroupSlots: row.remaining_group_slots,
  };

  if (row.outcome === "denied") {
    return isGroupCreationDenialCode(row.error_code)
      ? groupFailure(row.error_code, slots)
      : groupFailure("FORBIDDEN");
  }

  if (
    row.outcome !== "created" ||
    !row.group_id ||
    !row.leader_id ||
    !row.name ||
    !row.status ||
    !row.created_at
  ) {
    return groupFailure("FORBIDDEN");
  }

  return {
    data: {
      group: {
        id: row.group_id,
        classId: row.class_id,
        name: row.name,
        description: row.description,
        status: row.status as GroupStatus,
        leaderId: row.leader_id,
        createdAt: row.created_at,
      },
      slots,
    },
  };
}
