import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

import { adminPageOf, type AdminCursor } from "../directory-contracts";
import {
  flowHealthReportSchema,
  type AuditEvent,
  type AuditFilter,
  type ErrorEvent,
  type ErrorFilter,
} from "../operations-contracts";
import { adminError, type AdminResult } from "./directory";
import { isAdminDirectoryErrorCode } from "../directory-contracts";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type OperationsCode = "TIME_RANGE_TOO_LARGE";

function failureOf(error: { message?: string } | null) {
  const code = error?.message;
  if (code === ("TIME_RANGE_TOO_LARGE" satisfies OperationsCode)) {
    return {
      data: null,
      error: {
        code: "TIME_RANGE_TOO_LARGE" as const,
        message: "ช่วงเวลากว้างเกินไป เลือกไม่เกิน 31 วัน",
        retryable: false,
        details: {},
      },
      status: 400,
    };
  }
  return adminError(isAdminDirectoryErrorCode(code) ? code : "FORBIDDEN");
}

/** Drops null filters so optional RPC arguments are simply omitted. */
function args(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );
}

export async function flowHealth(supabase: Client, hours: number) {
  const { data, error } = await supabase.rpc("admin_flow_health", {
    window_hours: hours,
  });
  const report = flowHealthReportSchema.safeParse(data);
  if (error || !report.success) return failureOf(error);
  return { data: report.data, error: null, status: 200 } as const;
}

export async function listAuditEvents(
  supabase: Client,
  filter: AuditFilter,
  page: { cursor: AdminCursor | undefined; pageSize: number },
) {
  const { data, error } = await supabase.rpc(
    "admin_list_audit_events",
    args({
      range_from: filter.from,
      range_to: filter.to,
      actor_filter: filter.actorId,
      action_filter: filter.action,
      resource_type_filter: filter.resourceType,
      outcome_filter: filter.outcome,
      request_filter: filter.requestId,
      cursor_created_at: page.cursor?.c,
      cursor_id: page.cursor?.i,
      page_size: page.pageSize,
    }),
  );
  if (error) return failureOf(error);
  const items: AuditEvent[] = (data ?? []).map((row) => ({
    id: row.event_id,
    createdAt: row.created_at,
    actorId: row.actor_id,
    actorKind: row.actor_kind,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    schoolId: row.school_id,
    classId: row.class_id,
    outcome: row.outcome as AuditEvent["outcome"],
    requestId: row.request_id,
    traceId: row.trace_id,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  }));
  return {
    data: adminPageOf(items, page.pageSize),
    error: null,
    status: 200,
  } satisfies AdminResult<unknown>;
}

export async function listErrorEvents(
  supabase: Client,
  filter: ErrorFilter,
  page: { cursor: AdminCursor | undefined; pageSize: number },
) {
  const { data, error } = await supabase.rpc(
    "admin_list_error_events",
    args({
      range_from: filter.from,
      range_to: filter.to,
      flow_filter: filter.flow,
      stage_filter: filter.stage,
      code_filter: filter.code,
      release_filter: filter.release,
      environment_filter: filter.environment,
      request_filter: filter.requestId,
      trace_filter: filter.traceId,
      cursor_created_at: page.cursor?.c,
      cursor_id: page.cursor?.i,
      page_size: page.pageSize,
    }),
  );
  if (error) return failureOf(error);
  const items: ErrorEvent[] = (data ?? []).map((row) => ({
    id: row.event_id,
    createdAt: row.occurred_at,
    receivedAt: row.received_at,
    environment: row.environment,
    releaseVersion: row.release_version,
    flow: row.flow,
    stage: row.stage,
    errorCode: row.error_code,
    severity: row.severity as ErrorEvent["severity"],
    source: row.source as ErrorEvent["source"],
    fingerprint: row.fingerprint,
    requestId: row.request_id,
    traceId: row.trace_id,
    context: (row.redacted_context ?? {}) as Record<string, unknown>,
  }));
  return {
    data: adminPageOf(items, page.pageSize),
    error: null,
    status: 200,
  } satisfies AdminResult<unknown>;
}
