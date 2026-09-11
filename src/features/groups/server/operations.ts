import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type {
  CreateStudentGroupRequest,
  CreatedStudentGroup,
} from "../contracts";
import {
  buildCreateStudentGroupArgs,
  groupFailure,
  interpretCreateStudentGroupRow,
  type GroupOperationResult,
} from "../create-result";
import { mapPostgresGroupError } from "../errors";

export async function createStudentGroup(
  supabase: SupabaseClient<Database>,
  input: CreateStudentGroupRequest,
): Promise<GroupOperationResult<CreatedStudentGroup>> {
  const { data, error } = await supabase.rpc(
    "create_student_group",
    buildCreateStudentGroupArgs(input),
  );
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretCreateStudentGroupRow(data?.[0]);
}
