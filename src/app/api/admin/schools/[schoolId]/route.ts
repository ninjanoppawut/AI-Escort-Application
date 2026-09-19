import { z } from "zod";

import { getSchool } from "@/features/admin/server/directory";
import {
  handleAdminRead,
  invalidIdResponse,
} from "@/features/admin/server/routes";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ schoolId: string }> },
) {
  const { schoolId } = await params;
  if (!z.uuid().safeParse(schoolId).success) return invalidIdResponse(request);
  return handleAdminRead(request, (supabase) => getSchool(supabase, schoolId));
}
