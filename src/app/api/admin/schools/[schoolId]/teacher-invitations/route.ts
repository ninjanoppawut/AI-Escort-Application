import { z } from "zod";

import { issueInvitationSchema } from "@/features/admin/directory-contracts";
import {
  issueTeacherInvitation,
  listTeacherInvitations,
} from "@/features/admin/server/directory";
import {
  handleAdminList,
  handleAdminMutation,
  invalidIdResponse,
} from "@/features/admin/server/routes";

// Teacher invitations for one school. The raw token is returned once, at
// issue, so the admin can share the link; lists never include it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ schoolId: string }> },
) {
  const { schoolId } = await params;
  if (!z.uuid().safeParse(schoolId).success) return invalidIdResponse(request);
  return handleAdminList(request, (supabase, page) =>
    listTeacherInvitations(supabase, schoolId, page),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ schoolId: string }> },
) {
  const { schoolId } = await params;
  if (!z.uuid().safeParse(schoolId).success) return invalidIdResponse(request);
  return handleAdminMutation(request, issueInvitationSchema, (supabase, body) =>
    issueTeacherInvitation(supabase, schoolId, body),
  );
}
