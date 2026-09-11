import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import { groupStatusSchema } from "./contracts";
import { groupFailure, type GroupOperationResult } from "./create-result";
import { isGroupTeacherDenialCode } from "./errors";

type Functions = Database["public"]["Functions"];
type ApproveRow = Functions["approve_group"]["Returns"][number];
type LockRow = Functions["lock_group"]["Returns"][number];
type UnlockRow = Functions["unlock_group"]["Returns"][number];
type ResetClaimRow = Functions["reset_group_creation_claim"]["Returns"][number];
type DeleteOrArchiveRow =
  Functions["delete_or_archive_group"]["Returns"][number];

export const claimResetRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict();

export const classStudentParamSchema = z
  .object({ id: z.uuid(), studentId: z.uuid() })
  .strict();

export const creationClaimsSchema = z.object({
  classId: z.uuid(),
  claims: z.array(
    z.object({
      claimId: z.uuid(),
      student: z.object({ id: z.uuid(), displayName: z.string() }),
      groupId: z.uuid().nullable(),
      groupName: z.string().nullable(),
      groupState: z.enum(["current", "deleted", "archived"]).nullable(),
      studentInGroup: z.boolean(),
      canReset: z.boolean(),
      cannotResetReason: z
        .enum(["INVALID_STATUS_TRANSITION", "GROUP_IN_ACTIVE_SESSION"])
        .nullable(),
      claimedAt: z.string(),
    }),
  ),
  refreshedAt: z.string(),
});

export type ClaimResetRequest = z.infer<typeof claimResetRequestSchema>;
export type CreationClaims = z.infer<typeof creationClaimsSchema>;

export interface GroupStatusChangeResult {
  outcome: "approved" | "unlocked";
  groupId: string;
  classId: string;
  status: z.infer<typeof groupStatusSchema>;
}

export interface LockGroupResult {
  outcome: "locked";
  groupId: string;
  classId: string;
  cancelledInvitations: number;
}

export interface ResetClaimResult {
  outcome: "reset";
  claimId: string;
  auditLogId: string;
}

export interface DeleteOrArchiveResult {
  outcome: "deleted" | "archived";
  groupId: string;
  classId: string;
  releasedMembers: number;
  remainingGroupSlots: number;
}

function denial(row: { error_code: string | null }) {
  return isGroupTeacherDenialCode(row.error_code)
    ? groupFailure(row.error_code)
    : groupFailure("FORBIDDEN");
}

function interpretStatusChange(
  row: ApproveRow | UnlockRow | undefined,
  successOutcome: "approved" | "unlocked",
): GroupOperationResult<GroupStatusChangeResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") return denial(row);
  const status = groupStatusSchema.safeParse(row.status);
  if (row.outcome !== successOutcome || !status.success) {
    return groupFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: successOutcome,
      groupId: row.group_id,
      classId: row.class_id,
      status: status.data,
    },
  };
}

export function interpretApproveRow(row: ApproveRow | undefined) {
  return interpretStatusChange(row, "approved");
}

export function interpretUnlockRow(row: UnlockRow | undefined) {
  return interpretStatusChange(row, "unlocked");
}

export function interpretLockRow(
  row: LockRow | undefined,
): GroupOperationResult<LockGroupResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") return denial(row);
  if (row.outcome !== "locked") return groupFailure("FORBIDDEN");
  return {
    data: {
      outcome: "locked",
      groupId: row.group_id,
      classId: row.class_id,
      cancelledInvitations: row.cancelled_invitations,
    },
  };
}

export function interpretResetClaimRow(
  row: ResetClaimRow | undefined,
): GroupOperationResult<ResetClaimResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") return denial(row);
  if (row.outcome !== "reset" || !row.claim_id || !row.audit_log_id) {
    return groupFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: "reset",
      claimId: row.claim_id,
      auditLogId: row.audit_log_id,
    },
  };
}

export function interpretDeleteOrArchiveRow(
  row: DeleteOrArchiveRow | undefined,
): GroupOperationResult<DeleteOrArchiveResult> {
  if (!row) return groupFailure("FORBIDDEN");
  if (row.outcome === "denied") return denial(row);
  if (row.outcome !== "deleted" && row.outcome !== "archived") {
    return groupFailure("FORBIDDEN");
  }
  return {
    data: {
      outcome: row.outcome,
      groupId: row.group_id,
      classId: row.class_id,
      releasedMembers: row.released_members,
      remainingGroupSlots: row.remaining_group_slots,
    },
  };
}
