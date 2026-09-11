import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPostgresActivityError } from "@/features/activities/errors";
import {
  activityFailure,
  parseActivityReadModel,
} from "@/features/activities/results";
import type { Database } from "@/lib/supabase/database.types";

import {
  sessionListSchema,
  sessionSetupSchema,
  type CreateSessionRequest,
} from "../contracts";
import {
  buildCreateSessionArgs,
  interpretCreateSessionRow,
  interpretOpenSessionRow,
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
