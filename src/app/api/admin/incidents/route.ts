import { openIncidentSchema } from "@/features/admin/incident-contracts";
import { listIncidents, openIncident } from "@/features/admin/server/incidents";
import {
  handleAdminList,
  handleAdminMutation,
} from "@/features/admin/server/routes";

// Incidents (ADM-008): list by status, open a new incident.
export async function GET(request: Request) {
  return handleAdminList(request, (supabase, page, params) => {
    const status = params.get("status");
    return listIncidents(
      supabase,
      status && ["open", "acknowledged", "resolved", "active"].includes(status)
        ? status
        : null,
      page,
    );
  });
}

export async function POST(request: Request) {
  return handleAdminMutation(request, openIncidentSchema, (supabase, body) =>
    openIncident(supabase, body),
  );
}
