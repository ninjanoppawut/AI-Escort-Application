import { z } from "zod";

import { incidentNoteInputSchema } from "@/features/admin/incident-contracts";
import { appendIncidentNote } from "@/features/admin/server/incidents";
import {
  handleAdminMutation,
  invalidIdResponse,
} from "@/features/admin/server/routes";

// Append-only notes; a retried client note ID is not added twice.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await params;
  if (!z.uuid().safeParse(incidentId).success)
    return invalidIdResponse(request);
  return handleAdminMutation(
    request,
    incidentNoteInputSchema,
    (supabase, body) => appendIncidentNote(supabase, incidentId, body),
  );
}
