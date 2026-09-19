import { z } from "zod";

import { acknowledgeIncident } from "@/features/admin/server/incidents";
import {
  handleAdminMutation,
  invalidIdResponse,
} from "@/features/admin/server/routes";

// Idempotent: acknowledging an acknowledged incident returns it unchanged.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await params;
  if (!z.uuid().safeParse(incidentId).success)
    return invalidIdResponse(request);
  return handleAdminMutation(request, z.object({}), (supabase) =>
    acknowledgeIncident(supabase, incidentId),
  );
}
