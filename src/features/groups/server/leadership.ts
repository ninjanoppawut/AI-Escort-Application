import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { groupFailure } from "../create-result";
import { mapPostgresGroupError } from "../errors";
import {
  interpretReadyRow,
  interpretRemoveRow,
  interpretTransferRow,
} from "../leadership";

type Client = SupabaseClient<Database>;

export async function markGroupReady(supabase: Client, groupId: string) {
  const { data, error } = await supabase.rpc("mark_group_ready", {
    target_group_id: groupId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretReadyRow(data?.[0]);
}

export async function transferGroupLeadership(
  supabase: Client,
  groupId: string,
  newLeaderId: string,
) {
  const { data, error } = await supabase.rpc("transfer_group_leadership", {
    target_group_id: groupId,
    target_new_leader_id: newLeaderId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretTransferRow(data?.[0]);
}

export async function removeGroupMember(
  supabase: Client,
  groupId: string,
  studentId: string,
) {
  const { data, error } = await supabase.rpc("remove_group_member", {
    target_group_id: groupId,
    target_student_id: studentId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretRemoveRow(data?.[0]);
}
