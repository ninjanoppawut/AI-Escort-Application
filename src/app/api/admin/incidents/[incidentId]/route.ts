import { z } from "zod";

import { getIncident } from "@/features/admin/server/incidents";
import {
  handleAdminRead,
  invalidIdResponse,
} from "@/features/admin/server/routes";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await params;
  if (!z.uuid().safeParse(incidentId).success)
    return invalidIdResponse(request);
  return handleAdminRead(request, (supabase) =>
    getIncident(supabase, incidentId),
  );
}
