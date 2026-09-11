import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  activityDetailSchema,
  activityListSchema,
  type ActivityDraft,
} from "../contracts";
import { mapPostgresActivityError } from "../errors";
import {
  activityFailure,
  buildSaveActivityArgs,
  interpretPublishActivityRow,
  interpretSaveActivityRow,
  parseActivityReadModel,
} from "../results";

type Client = SupabaseClient<Database>;

export async function createActivity(
  supabase: Client,
  classId: string,
  draft: ActivityDraft,
) {
  const { data, error } = await supabase.rpc(
    "save_activity_draft",
    buildSaveActivityArgs({ draft, classId }),
  );
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretSaveActivityRow(data?.[0]);
}

export async function saveActivityDraft(
  supabase: Client,
  activityId: string,
  expectedVersion: number,
  draft: ActivityDraft,
) {
  const { data, error } = await supabase.rpc(
    "save_activity_draft",
    buildSaveActivityArgs({ draft, activityId, expectedVersion }),
  );
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretSaveActivityRow(data?.[0]);
}

export async function publishActivity(
  supabase: Client,
  activityId: string,
  expectedVersion: number,
) {
  const { data, error } = await supabase.rpc("publish_activity", {
    target_activity_id: activityId,
    expected_version_number: expectedVersion,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return interpretPublishActivityRow(data?.[0]);
}

export async function listClassActivities(supabase: Client, classId: string) {
  const { data, error } = await supabase.rpc("list_class_activities", {
    target_class_id: classId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return parseActivityReadModel(activityListSchema, data);
}

export async function getActivityDetail(supabase: Client, activityId: string) {
  const { data, error } = await supabase.rpc("get_activity_detail", {
    target_activity_id: activityId,
  });
  if (error) return activityFailure(mapPostgresActivityError(error.message));
  return parseActivityReadModel(activityDetailSchema, data);
}
