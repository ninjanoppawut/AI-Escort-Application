import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { groupFailure } from "../create-result";
import { mapPostgresGroupError } from "../errors";
import {
  buildCreateTeacherGroupArgs,
  buildMoveStudentArgs,
  interpretCreateTeacherGroupRow,
  interpretMoveStudentRow,
  type CreateTeacherGroupRequest,
  type MoveStudentRequest,
} from "../teacher";

type Client = SupabaseClient<Database>;

export async function createTeacherGroup(
  supabase: Client,
  classId: string,
  input: CreateTeacherGroupRequest,
) {
  const { data, error } = await supabase.rpc(
    "create_teacher_group",
    buildCreateTeacherGroupArgs(classId, input),
  );
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretCreateTeacherGroupRow(data?.[0]);
}

export async function moveStudentBetweenGroups(
  supabase: Client,
  classId: string,
  input: MoveStudentRequest,
) {
  const { data, error } = await supabase.rpc(
    "move_student_between_groups",
    buildMoveStudentArgs(classId, input),
  );
  if (error) return groupFailure(mapPostgresGroupError(error.message));
  return interpretMoveStudentRow(data?.[0]);
}
