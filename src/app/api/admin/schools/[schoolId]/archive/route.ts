import { z } from "zod";

import { reasonSchema } from "@/features/admin/directory-contracts";
import { archiveSchool } from "@/features/admin/server/directory";
import {
  handleAdminMutation,
  invalidIdResponse,
} from "@/features/admin/server/routes";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ schoolId: string }> },
) {
  const { schoolId } = await params;
  if (!z.uuid().safeParse(schoolId).success) return invalidIdResponse(request);
  return handleAdminMutation(request, reasonSchema, (supabase, body) =>
    archiveSchool(supabase, schoolId, body.reason),
  );
}
