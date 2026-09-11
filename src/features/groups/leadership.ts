import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import { groupFailure, type GroupOperationResult } from "./create-result";
import { isGroupLeadershipDenialCode } from "./errors";

type Functions = Database["public"]["Functions"];
type ReadyRow = Functions["mark_group_ready"]["Returns"][number];
type TransferRow = Functions["transfer_group_leadership"]["Returns"][number];
type RemoveRow = Functions["remove_group_member"]["Returns"][number];

export const transferLeadershipRequestSchema = z
  .object({ newLeaderId: z.uuid() })
  .strict();

export const groupMemberParamSchema = z
  .object({ id: z.uuid(), studentId: z.uuid() })
  .strict();

export interface MarkGroupReadyResult {
  outcome: "ready";
  groupId: string;
  classId: string;
  memberCount: number;
  minimumSize: number;
}

export interface TransferLeadershipResult {
  outcome: "transferred";
  groupId: string;
  classId: string;
  leaderId: string;
  previousLeaderId: string;
}

export interface RemoveGroupMemberResult {
  outcome: "removed";
  groupId: string;
  classId: string;
  memberCount: number;
  status: string;
}

function denial(
  row: { error_code: string | null },
  details: Record<string, unknown> = {},
) {
  return isGroupLeadershipDenialCode(row.error_code)
    ? groupFailure(row.error_code, details)
    : groupFailure("FORBIDDEN");
}

export function interpretReadyRow(
  row: ReadyRow | undefined,
): GroupOperationResult<MarkGroupReadyResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") {
    return denial(row, {
      memberCount: row.member_count,
      minimumSize: row.minimum_size,
    });
  }
  if (row.outcome !== "ready") return groupFailure("FORBIDDEN");
  return {
    data: {
      outcome: "ready",
      groupId: row.group_id,
      classId: row.class_id,
      memberCount: row.member_count,
      minimumSize: row.minimum_size,
    },
  };
}

export function interpretTransferRow(
  row: TransferRow | undefined,
): GroupOperationResult<TransferLeadershipResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") return denial(row);
  if (row.outcome !== "transferred" || !row.leader_id) {
    return groupFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: "transferred",
      groupId: row.group_id,
      classId: row.class_id,
      leaderId: row.leader_id,
      previousLeaderId: row.previous_leader_id,
    },
  };
}

export function interpretRemoveRow(
  row: RemoveRow | undefined,
): GroupOperationResult<RemoveGroupMemberResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") {
    return denial(row, { memberCount: row.member_count });
  }
  if (row.outcome !== "removed") return groupFailure("FORBIDDEN");
  return {
    data: {
      outcome: "removed",
      groupId: row.group_id,
      classId: row.class_id,
      memberCount: row.member_count,
      status: row.status,
    },
  };
}
