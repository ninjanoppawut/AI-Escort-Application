import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { mapPostgresActivityError } from "@/features/activities/errors";
import {
  activityFailure,
  parseActivityReadModel,
} from "@/features/activities/results";
import type { Database } from "@/lib/supabase/database.types";

import {
  sessionListSchema,
  sessionLiveSchema,
  sessionParticipantViewSchema,
  sessionSetupSchema,
  type CreateSessionRequest,
} from "../contracts";
import {
  buildCreateSessionArgs,
  interpretActivateSessionGroupRow,
  interpretCompleteSessionGroupRow,
  interpretCompleteSessionRow,
  interpretCreateSessionRow,
  interpretOpenSessionRow,
  interpretPauseSessionRow,
  interpretResumeSessionRow,
} from "../results";

type Client = SupabaseClient<Database>;

export async function createSession(
  supabase: Client,
  input: CreateSessionRequest,
) {
  const { data, error } = await supabase.rpc(
    "create_exploration_session",
    buildCreateSessionArgs(input),
  );
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretCreateSessionRow(data?.[0]);
}

export async function openSession(
  supabase: Client,
  sessionId: string,
  groupOrder: string[],
) {
  const { data, error } = await supabase.rpc("open_exploration_session", {
    target_session_id: sessionId,
    group_order: groupOrder,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretOpenSessionRow(data?.[0]);
}

export async function getSessionSetup(supabase: Client, sessionId: string) {
  const { data, error } = await supabase.rpc("get_session_setup", {
    target_session_id: sessionId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return parseActivityReadModel(sessionSetupSchema, data);
}

export async function listClassSessions(supabase: Client, classId: string) {
  const { data, error } = await supabase.rpc("list_class_sessions", {
    target_class_id: classId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return parseActivityReadModel(sessionListSchema, data);
}

// P7-02 session control. Authorization, locking, and state transitions live in
// the RPCs; these wrappers only map arguments and validate the returned rows.

export async function activateSessionGroup(
  supabase: Client,
  sessionId: string,
  groupId: string,
) {
  const { data, error } = await supabase.rpc("activate_session_group", {
    target_session_id: sessionId,
    target_group_id: groupId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretActivateSessionGroupRow(data?.[0], sessionId, groupId);
}

export async function pauseSession(supabase: Client, sessionId: string) {
  const { data, error } = await supabase.rpc("pause_exploration_session", {
    target_session_id: sessionId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretPauseSessionRow(data?.[0], sessionId);
}

export async function resumeSession(supabase: Client, sessionId: string) {
  const { data, error } = await supabase.rpc("resume_exploration_session", {
    target_session_id: sessionId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretResumeSessionRow(data?.[0], sessionId);
}

/**
 * The RPC reports the promoted queue entry's exploration_session_groups ID.
 * Snapshot identity is immutable, so reading its class group afterwards cannot
 * disagree with the committed completion; a failed read only leaves it null.
 */
async function queueEntryGroupId(
  supabase: Client,
  sessionId: string,
  sessionGroupId: string,
) {
  const { data } = await supabase
    .from("exploration_session_groups")
    .select("group_id")
    .eq("id", sessionGroupId)
    .eq("session_id", sessionId)
    .maybeSingle();
  const groupId = z.uuid().safeParse(data?.group_id);
  return groupId.success ? groupId.data : null;
}

export async function completeSessionGroup(
  supabase: Client,
  sessionId: string,
  groupId: string,
) {
  const { data, error } = await supabase.rpc("complete_session_group", {
    target_session_id: sessionId,
    target_group_id: groupId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  const result = interpretCompleteSessionGroupRow(
    data?.[0],
    sessionId,
    groupId,
  );
  if (result.error || !result.data.nextReadySessionGroupId) return result;
  return {
    data: {
      ...result.data,
      nextReadyGroupId: await queueEntryGroupId(
        supabase,
        sessionId,
        result.data.nextReadySessionGroupId,
      ),
    },
  };
}

export async function completeSession(supabase: Client, sessionId: string) {
  const { data, error } = await supabase.rpc("complete_exploration_session", {
    target_session_id: sessionId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretCompleteSessionRow(data?.[0], sessionId);
}

/** Teacher live read model: queue, participants, counts, allowed actions. */
export async function getSessionLive(supabase: Client, sessionId: string) {
  const { data, error } = await supabase.rpc("get_session_live", {
    target_session_id: sessionId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return parseActivityReadModel(sessionLiveSchema, data);
}

/** Participant read model: own group, queue position, and permissions. */
export async function getSessionParticipantView(
  supabase: Client,
  sessionId: string,
) {
  const { data, error } = await supabase.rpc("get_session_participant_view", {
    target_session_id: sessionId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return parseActivityReadModel(sessionParticipantViewSchema, data);
}
