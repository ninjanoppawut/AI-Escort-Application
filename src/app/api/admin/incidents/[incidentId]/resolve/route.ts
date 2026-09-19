import { z } from "zod";

import { resolveIncidentSchema } from "@/features/admin/incident-contracts";
import { resolveIncident } from "@/features/admin/server/incidents";
import {
  handleAdminMutation,
  invalidIdResponse,
} from "@/features/admin/server/routes";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await params;
  if (!z.uuid().safeParse(incidentId).success)
    return invalidIdResponse(request);
  return handleAdminMutation(request, resolveIncidentSchema, (supabase, body) =>
    resolveIncident(supabase, incidentId, body.resolution),
  );
}
