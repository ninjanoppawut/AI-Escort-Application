import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { groupFailure } from "../create-result";
import { mapPostgresGroupError } from "../errors";
import {
  eligibleClassmatesSchema,
  groupDetailSchema,
  groupInvitationDetailSchema,
  interpretAcceptRow,
  interpretSendRow,
  interpretStatusRow,
  parseReadModel,
} from "../invitations";

type Client = SupabaseClient<Database>;

export async function sendGroupInvitation(
  supabase: Client,
  groupId: string,
  inviteeId: string,
) {
  const { data, error } = await supabase.rpc("send_group_invitation", {
    target_group_id: groupId,
    target_invitee_id: inviteeId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretSendRow(data?.[0]);
}

export async function cancelGroupInvitation(
  supabase: Client,
  invitationId: string,
) {
  const { data, error } = await supabase.rpc("cancel_group_invitation", {
    target_invitation_id: invitationId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretStatusRow(data?.[0], "cancelled");
}

export async function acceptGroupInvitation(
  supabase: Client,
  invitationId: string,
) {
  const { data, error } = await supabase.rpc("accept_group_invitation", {
    target_invitation_id: invitationId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretAcceptRow(data?.[0]);
}

export async function declineGroupInvitation(
  supabase: Client,
  invitationId: string,
) {
  const { data, error } = await supabase.rpc("decline_group_invitation", {
    target_invitation_id: invitationId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretStatusRow(data?.[0], "declined");
}

export async function listGroupEligibleClassmates(
  supabase: Client,
  groupId: string,
) {
  const { data, error } = await supabase.rpc("list_group_eligible_classmates", {
    target_group_id: groupId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return parseReadModel(eligibleClassmatesSchema, data);
}

export async function getGroupDetail(supabase: Client, groupId: string) {
  const { data, error } = await supabase.rpc("get_group_detail", {
    target_group_id: groupId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return parseReadModel(groupDetailSchema, data);
}

export async function getGroupInvitation(
  supabase: Client,
  invitationId: string,
) {
  const { data, error } = await supabase.rpc("get_group_invitation", {
    target_invitation_id: invitationId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return parseReadModel(groupInvitationDetailSchema, data);
}
