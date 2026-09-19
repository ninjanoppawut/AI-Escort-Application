import "server-only";

import type { ApiError } from "@/lib/http/envelope";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  ADMIN_DIRECTORY_ERRORS,
  adminPageOf,
  isAdminDirectoryErrorCode,
  type AdminCursor,
  type AdminDirectoryErrorCode,
  type AdminInvitation,
  type AdminSchool,
  type AdminUser,
  type IssuedInvitation,
} from "../directory-contracts";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type AdminResult<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: ApiError; status: number };

export function adminError(code: AdminDirectoryErrorCode): {
  data: null;
  error: ApiError;
  status: number;
} {
  const known = ADMIN_DIRECTORY_ERRORS[code];
  return {
    data: null,
    error: {
      code,
      message: known.message,
      retryable: false,
      details: {},
    },
    status: known.status,
  };
}

/** Maps a raised database code to a safe envelope; anything else is a denial. */
function failureOf(error: { message?: string } | null) {
  const code = error?.message;
  return adminError(isAdminDirectoryErrorCode(code) ? code : "FORBIDDEN");
}

/** Drops undefined values so optional RPC arguments are simply omitted. */
function args<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

function ok<T>(data: T, status = 200): AdminResult<T> {
  return { data, error: null, status };
}

interface SchoolRow {
  school_id: string;
  name: string;
  status: string;
  created_at: string;
  teacher_count: number;
  student_count: number;
  class_count: number;
  pending_invitation_count: number;
}

function toSchool(row: SchoolRow): AdminSchool {
  return {
    id: row.school_id,
    name: row.name,
    status: row.status === "archived" ? "archived" : "active",
    createdAt: row.created_at,
    teacherCount: Number(row.teacher_count),
    studentCount: Number(row.student_count),
    classCount: Number(row.class_count),
    pendingInvitationCount: Number(row.pending_invitation_count),
  };
}

export async function listSchools(
  supabase: Client,
  input: {
    status: "active" | "archived" | null;
    cursor: AdminCursor | undefined;
    pageSize: number;
  },
) {
  const { data, error } = await supabase.rpc(
    "admin_list_schools",
    args({
      status_filter: input.status ?? undefined,
      cursor_created_at: input.cursor?.c,
      cursor_id: input.cursor?.i,
      page_size: input.pageSize,
    }),
  );
  if (error) return failureOf(error);
  return ok(adminPageOf((data ?? []).map(toSchool), input.pageSize));
}

export async function getSchool(supabase: Client, schoolId: string) {
  const { data, error } = await supabase.rpc("admin_get_school", {
    target_school_id: schoolId,
  });
  const row = data?.[0];
  if (error || !row) return failureOf(error);
  return ok(toSchool(row));
}

export async function createSchool(supabase: Client, name: string) {
  const { data, error } = await supabase.rpc("admin_create_school", {
    school_name: name,
  });
  const row = data?.[0];
  if (error || !row) return failureOf(error);
  return ok(
    toSchool({
      ...row,
      teacher_count: 0,
      student_count: 0,
      class_count: 0,
      pending_invitation_count: 0,
    }),
    201,
  );
}

export async function archiveSchool(
  supabase: Client,
  schoolId: string,
  reason: string,
) {
  const { data, error } = await supabase.rpc("admin_archive_school", {
    target_school_id: schoolId,
    reason,
  });
  const row = data?.[0];
  if (error || !row) return failureOf(error);
  return ok({
    id: row.school_id,
    status: "archived" as const,
    changed: row.changed,
  });
}

export async function listTeacherInvitations(
  supabase: Client,
  schoolId: string,
  input: { cursor: AdminCursor | undefined; pageSize: number },
) {
  const { data, error } = await supabase.rpc("admin_list_teacher_invitations", {
    target_school_id: schoolId,
    ...args({
      cursor_created_at: input.cursor?.c,
      cursor_id: input.cursor?.i,
      page_size: input.pageSize,
    }),
  });
  if (error) return failureOf(error);
  const items: AdminInvitation[] = (data ?? []).map((row) => ({
    id: row.invitation_id,
    email: row.email,
    status: row.status as AdminInvitation["status"],
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  }));
  return ok(adminPageOf(items, input.pageSize));
}

export async function issueTeacherInvitation(
  supabase: Client,
  schoolId: string,
  input: { email: string; expiresInDays: number },
): Promise<AdminResult<IssuedInvitation>> {
  const expiresAt = new Date(
    Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase.rpc("issue_teacher_invitation", {
    target_school_id: schoolId,
    target_email: input.email,
    invitation_expires_at: expiresAt,
  });
  const row = data?.[0];
  if (error || !row) return failureOf(error);
  return ok(
    {
      invitationId: row.invitation_id,
      token: row.token,
      expiresAt: row.expires_at,
    },
    201,
  );
}

export async function revokeTeacherInvitation(
  supabase: Client,
  invitationId: string,
  reason: string,
) {
  const { data, error } = await supabase.rpc("revoke_teacher_invitation", {
    invitation_id: invitationId,
    reason,
  });
  const row = data?.[0];
  if (error || !row) return failureOf(error);
  return ok({ id: row.id, status: "revoked" as const });
}

export async function listUsers(
  supabase: Client,
  input: {
    type: "student" | "teacher" | null;
    q: string | null;
    cursor: AdminCursor | undefined;
    pageSize: number;
  },
) {
  const { data, error } = await supabase.rpc(
    "admin_list_users",
    args({
      account_filter: input.type ?? undefined,
      search: input.q ?? undefined,
      cursor_created_at: input.cursor?.c,
      cursor_id: input.cursor?.i,
      page_size: input.pageSize,
    }),
  );
  if (error) return failureOf(error);
  const items: AdminUser[] = (data ?? []).map((row) => ({
    id: row.user_id,
    displayName: row.display_name,
    email: row.email,
    accountType: row.account_type === "teacher" ? "teacher" : "student",
    status: row.status === "deactivated" ? "deactivated" : "active",
    createdAt: row.created_at,
    isAdmin: row.is_admin,
    schoolNames: row.school_names ?? [],
    classCount: Number(row.class_count),
  }));
  return ok(adminPageOf(items, input.pageSize));
}
