import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  adminPageOf,
  isAdminDirectoryErrorCode,
  type AdminCursor,
} from "../directory-contracts";
import { incidentSchema, type IncidentSummary } from "../incident-contracts";
import { adminError, type AdminResult } from "./directory";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function failureOf(error: { message?: string } | null) {
  const code = error?.message;
  return adminError(isAdminDirectoryErrorCode(code) ? code : "FORBIDDEN");
}

function incidentResult(
  data: unknown,
  error: { message?: string } | null,
  status = 200,
) {
  const parsed = incidentSchema.safeParse(data);
  if (error || !parsed.success) return failureOf(error);
  return { data: parsed.data, error: null, status } as const;
}

export async function openIncident(
  supabase: Client,
  input: { title: string; severity: string; flow: string | null },
) {
  const { data, error } = await supabase.rpc("admin_open_incident", {
    incident_title: input.title,
    incident_severity: input.severity,
    ...(input.flow ? { incident_flow: input.flow } : {}),
  });
  return incidentResult(data, error, 201);
}

export async function getIncident(supabase: Client, id: string) {
  const { data, error } = await supabase.rpc("admin_get_incident", {
    target_incident_id: id,
  });
  return incidentResult(data, error);
}

export async function acknowledgeIncident(supabase: Client, id: string) {
  const { data, error } = await supabase.rpc(
    "acknowledge_operational_incident",
    { target_incident_id: id },
  );
  return incidentResult(data, error);
}

export async function appendIncidentNote(
  supabase: Client,
  id: string,
  input: { note: string; clientNoteId: string },
) {
  const { data, error } = await supabase.rpc(
    "append_operational_incident_note",
    {
      target_incident_id: id,
      note_text: input.note,
      client_note_id: input.clientNoteId,
    },
  );
  return incidentResult(data, error);
}

export async function resolveIncident(
  supabase: Client,
  id: string,
  resolution: string,
) {
  const { data, error } = await supabase.rpc("admin_resolve_incident", {
    target_incident_id: id,
    resolution_text: resolution,
  });
  return incidentResult(data, error);
}

export async function listIncidents(
  supabase: Client,
  status: string | null,
  page: { cursor: AdminCursor | undefined; pageSize: number },
) {
  const { data, error } = await supabase.rpc("admin_list_incidents", {
    ...(status ? { status_filter: status } : {}),
    ...(page.cursor
      ? { cursor_created_at: page.cursor.c, cursor_id: page.cursor.i }
      : {}),
    page_size: page.pageSize,
  });
  if (error) return failureOf(error);
  const items: IncidentSummary[] = (data ?? []).map((row) => ({
    id: row.incident_id,
    title: row.title,
    severity: row.severity as IncidentSummary["severity"],
    status: row.status as IncidentSummary["status"],
    flow: row.flow,
    createdAt: row.created_at,
    noteCount: Number(row.note_count),
  }));
  return {
    data: adminPageOf(items, page.pageSize),
    error: null,
    status: 200,
  } satisfies AdminResult<unknown>;
}
