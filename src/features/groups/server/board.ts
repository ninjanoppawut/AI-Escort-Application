import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { parseGroupBoard, type GroupBoard } from "../board";
import { groupFailure, type GroupOperationResult } from "../create-result";
import { mapPostgresGroupError } from "../errors";

export async function getClassGroupBoard(
  supabase: SupabaseClient<Database>,
  classId: string,
): Promise<GroupOperationResult<GroupBoard>> {
  const { data, error } = await supabase.rpc("get_class_group_board", {
    target_class_id: classId,
  });
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return parseGroupBoard(data);
}
