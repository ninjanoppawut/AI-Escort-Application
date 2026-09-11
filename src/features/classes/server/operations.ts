import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { buildJoinUrl } from "../invite-url";
import {
  classApiError,
  httpStatusForClassError,
  mapPostgresClassError,
} from "../errors";
import type {
  AuthorizedClassSummary,
  ClassMemberPage,
  ClassMemberListQuery,
  ClassMemberSummary,
  ClassGroupSettings,
  CreateClassRequest,
  IssueClassInviteRequest,
  JoinClassRequest,
} from "../contracts";

export interface ClassOperationFailure {
  error: ReturnType<typeof classApiError>;
  status: number;
}

export type ClassOperationResult<T> =
  | { data: T; error?: never; status?: never }
  | { data?: never; error: ReturnType<typeof classApiError>; status: number };

function failure(message?: string): ClassOperationFailure {
  const code = mapPostgresClassError(message);
  return { error: classApiError(code), status: httpStatusForClassError(code) };
}

interface MemberCursor {
  displayName: string;
  memberId: string;
}

function encodeMemberCursor(item: ClassMemberSummary) {
  const payload: MemberCursor = {
    displayName: item.display_name,
    memberId: item.member_id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeMemberCursor(cursor?: string): MemberCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<MemberCursor>;
    if (
      typeof parsed.displayName !== "string" ||
      typeof parsed.memberId !== "string"
    ) {
      return null;
    }
    return { displayName: parsed.displayName, memberId: parsed.memberId };
  } catch {
    return null;
  }
}

export async function listAuthorizedClasses(
  supabase: SupabaseClient<Database>,
) {
  const { data, error } = await supabase.rpc("list_authorized_classes");
  if (error) return failure(error.message);
  return {
    data: (data ?? []).map((row) => ({
      ...row,
      id: row.class_id,
    })) as AuthorizedClassSummary[],
  };
}

export async function createClass(
  supabase: SupabaseClient<Database>,
  input: CreateClassRequest,
) {
  const { data, error } = await supabase.rpc("create_class", {
    target_school_id: input.schoolId,
    class_name: input.name,
    class_subject: input.subject ?? "",
    class_academic_year: input.academicYear ?? "",
    class_semester: input.semester ?? "",
    class_description: input.description ?? "",
    minimum_group_size: input.groupSettings.minimumSize,
    maximum_group_size: input.groupSettings.maximumSize,
    maximum_group_count: input.groupSettings.maximumGroups,
    allow_student_group_creation: input.groupSettings.allowStudentGroups,
    initial_formation_status: input.groupSettings.formationStatus,
  });

  if (error) return failure(error.message);
  const created = data[0];
  if (!created) return failure("FORBIDDEN");
  return { data: { ...created, id: created.class_id } };
}

export async function updateClassGroupSettings(
  supabase: SupabaseClient<Database>,
  classId: string,
  input: ClassGroupSettings,
) {
  const { data, error } = await supabase.rpc("update_class_group_settings", {
    target_class_id: classId,
    minimum_group_size: input.minimumSize,
    maximum_group_size: input.maximumSize,
    maximum_group_count: input.maximumGroups,
    allow_student_group_creation: input.allowStudentGroups,
    formation_status: input.formationStatus,
  });

  if (error) return failure(error.message);
  const updated = data[0];
  if (!updated) return failure("FORBIDDEN");
  return { data: updated };
}

export async function issueClassInvite(
  supabase: SupabaseClient<Database>,
  classId: string,
  input: IssueClassInviteRequest,
  origin: string,
) {
  const args: Database["public"]["Functions"]["issue_class_invite"]["Args"] = {
    target_class_id: classId,
  };
  if (input.expiresAt) args.invitation_expires_at = input.expiresAt;
  if (input.maxUses) args.maximum_uses = input.maxUses;
  const { data, error } = await supabase.rpc("issue_class_invite", args);

  if (error) return failure(error.message);
  const invite = data[0];
  if (!invite) return failure("INVITE_INVALID");
  return {
    data: {
      ...invite,
      id: invite.invite_id,
      class_id: classId,
      join_url: buildJoinUrl(origin, invite.token),
    },
  };
}

export async function disableClassInvite(
  supabase: SupabaseClient<Database>,
  inviteId: string,
) {
  const { data, error } = await supabase.rpc("disable_class_invite", {
    target_invite_id: inviteId,
  });

  if (error) return failure(error.message);
  return { data: data[0] };
}

export async function verifyClassInviteRoute(
  supabase: SupabaseClient<Database>,
  classId: string,
  inviteId: string,
): Promise<ClassOperationResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("class_invites")
    .select("id")
    .eq("id", inviteId)
    .eq("class_id", classId)
    .maybeSingle();

  if (error) return failure(error.message);
  if (!data) return failure("INVITE_INVALID");
  return { data };
}

export async function rotateClassInvite(
  supabase: SupabaseClient<Database>,
  inviteId: string,
  classId: string,
  input: IssueClassInviteRequest,
  origin: string,
) {
  const args: Database["public"]["Functions"]["rotate_class_invite"]["Args"] = {
    target_invite_id: inviteId,
  };
  if (input.expiresAt) args.invitation_expires_at = input.expiresAt;
  if (input.maxUses) args.maximum_uses = input.maxUses;
  const { data, error } = await supabase.rpc("rotate_class_invite", args);

  if (error) return failure(error.message);
  const invite = data[0];
  if (!invite) return failure("INVITE_INVALID");
  return {
    data: {
      ...invite,
      id: invite.invite_id,
      class_id: classId,
      join_url: buildJoinUrl(origin, invite.token),
    },
  };
}

export async function joinClassWithInvite(
  supabase: SupabaseClient<Database>,
  input: JoinClassRequest,
) {
  const args: Database["public"]["Functions"]["join_class_with_invite"]["Args"] =
    {};
  if (input.inviteCode) args.invite_code = input.inviteCode;
  if (input.token) args.invitation_token = input.token;
  const { data, error } = await supabase.rpc("join_class_with_invite", args);

  if (error) return failure(error.message);
  const joined = data[0];
  if (!joined) return failure("INVITE_INVALID");
  return { data: joined };
}

export async function listClassMembers(
  supabase: SupabaseClient<Database>,
  classId: string,
  query: ClassMemberListQuery,
): Promise<ClassOperationResult<ClassMemberPage>> {
  const decodedCursor = decodeMemberCursor(query.cursor);
  if (query.cursor && !decodedCursor) {
    return {
      error: {
        code: "INVALID_CURSOR",
        message: "Invalid cursor",
        retryable: false,
        details: {},
      },
      status: 422,
    };
  }

  const requestedLimit = query.limit ?? 50;
  const args: Database["public"]["Functions"]["list_class_members"]["Args"] = {
    target_class_id: classId,
    status_filter: query.status,
    page_limit: requestedLimit + 1,
  };
  if (query.role) args.role_filter = query.role;
  if (decodedCursor) {
    args.cursor_display_name = decodedCursor.displayName;
    args.cursor_member_id = decodedCursor.memberId;
  }
  const { data, error } = await supabase.rpc("list_class_members", args);

  if (error) return failure(error.message);

  const rows = (data ?? []).map((row) => ({
    ...row,
    id: row.member_id,
  })) as ClassMemberSummary[];
  const items = rows.slice(0, requestedLimit);
  return {
    data: {
      items,
      hasMore: rows.length > requestedLimit,
      nextCursor:
        rows.length > requestedLimit && items.at(-1)
          ? encodeMemberCursor(items.at(-1)!)
          : null,
    },
  };
}
