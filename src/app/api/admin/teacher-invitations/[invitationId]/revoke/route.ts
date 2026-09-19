import { z } from "zod";

import { reasonSchema } from "@/features/admin/directory-contracts";
import { revokeTeacherInvitation } from "@/features/admin/server/directory";
import {
  handleAdminMutation,
  invalidIdResponse,
} from "@/features/admin/server/routes";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const { invitationId } = await params;
  if (!z.uuid().safeParse(invitationId).success) {
    return invalidIdResponse(request);
  }
  return handleAdminMutation(request, reasonSchema, (supabase, body) =>
    revokeTeacherInvitation(supabase, invitationId, body.reason),
  );
}
