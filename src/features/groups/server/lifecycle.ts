import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { groupFailure } from "../create-result";
import { mapPostgresGroupError } from "../errors";
import { parseReadModel } from "../invitations";
import {
  creationClaimsSchema,
  interpretApproveRow,
  interpretDeleteOrArchiveRow,
  interpretLockRow,
  interpretResetClaimRow,
  interpretUnlockRow,
} from "../lifecycle";

type Client = SupabaseClient<Database>;

export async function approveGroup(supabase: Client, groupId: string) {
  const { data, error } = await supabase.rpc("approve_group", {
    target_group_id: groupId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretApproveRow(data?.[0]);
}

export async function lockGroup(supabase: Client, groupId: string) {
  const { data, error } = await supabase.rpc("lock_group", {
    target_group_id: groupId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretLockRow(data?.[0]);
}

export async function unlockGroup(supabase: Client, groupId: string) {
  const { data, error } = await supabase.rpc("unlock_group", {
    target_group_id: groupId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretUnlockRow(data?.[0]);
}

export async function deleteOrArchiveGroup(supabase: Client, groupId: string) {
  const { data, error } = await supabase.rpc("delete_or_archive_group", {
    target_group_id: groupId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretDeleteOrArchiveRow(data?.[0]);
}

export async function listClassCreationClaims(
  supabase: Client,
  classId: string,
) {
  const { data, error } = await supabase.rpc("list_class_creation_claims", {
    target_class_id: classId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return parseReadModel(creationClaimsSchema, data);
}

export async function resetGroupCreationClaim(
  supabase: Client,
  classId: string,
  studentId: string,
  reason: string,
) {
  const { data, error } = await supabase.rpc("reset_group_creation_claim", {
    target_class_id: classId,
    target_student_id: studentId,
    reset_reason_text: reason,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretResetClaimRow(data?.[0]);
}
