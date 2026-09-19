import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { mapPostgresReviewError } from "@/features/observations/review/errors";
import {
  reviewDenial,
  reviewFailure,
  type ReviewOperationResult,
} from "@/features/observations/review/results";
import type { Database } from "@/lib/supabase/database.types";

import {
  SYNC_EXPORT_ROW_LIMIT,
  exportRowsSchema,
  exportViewSchema,
  type ExportRequest,
  type ExportView,
} from "../contracts";
import { exportFile, exportFileName } from "../format";

type Client = SupabaseClient<Database>;

export const EXPORTS_BUCKET = "activity-exports";
/** Download links live one minute and are signed per request (API §24). */
export const EXPORT_DOWNLOAD_TTL_SECONDS = 60;

const requestRowSchema = z.object({
  outcome: z.enum(["requested", "existing", "denied"]),
  error_code: z.string().nullable(),
  error_details: z.unknown().nullable(),
  export_id: z.uuid().nullable(),
  export_status: z.string().nullable(),
  row_estimate: z.number().int().nullable(),
});

const claimRowSchema = z.object({
  outcome: z.string(),
  export_type: z.string().nullable(),
  class_id: z.uuid().nullable(),
  session_id: z.uuid().nullable(),
  storage_path: z.string().nullable(),
});

export async function getExport(
  supabase: Client,
  exportId: string,
): Promise<ReviewOperationResult<ExportView>> {
  const { data, error } = await supabase.rpc("get_export", {
    target_export_id: exportId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = exportViewSchema.safeParse(data);
  return parsed.success ? { data: parsed.data } : reviewFailure("FORBIDDEN");
}

/**
 * Generates a queued export once: claim (SKIP LOCKED), read the reauthorized
 * rows, write the private artifact, and mark it ready (which notifies on
 * commit). Another worker holding the claim is left to finish it.
 */
export async function processExport(
  supabase: Client,
  exportId: string,
): Promise<ReviewOperationResult<ExportView>> {
  const { data: claimData, error: claimError } = await supabase.rpc(
    "claim_export",
    { target_export_id: exportId },
  );
  if (claimError) {
    return reviewFailure(mapPostgresReviewError(claimError.message));
  }
  const claim = claimRowSchema.safeParse(claimData?.[0]);
  if (!claim.success) return reviewFailure("FORBIDDEN");

  if (claim.data.outcome === "claimed" && claim.data.storage_path) {
    const failed = async (code: string) => {
      await supabase.rpc("finish_export", {
        target_export_id: exportId,
        export_succeeded: false,
        result_row_count: null,
        result_byte_size: null,
        result_failure_code: code,
      } as unknown as Database["public"]["Functions"]["finish_export"]["Args"]);
    };

    const { data: rowsData, error: rowsError } = await supabase.rpc(
      "export_rows",
      { target_export_id: exportId },
    );
    const rows = exportRowsSchema.safeParse(rowsData);
    if (rowsError || !rows.success || rows.data.type === "research_csv") {
      await failed("rows_unavailable");
      return getExport(supabase, exportId);
    }

    const file = exportFile(rows.data.type, rows.data.rows);
    const bytes = new TextEncoder().encode(file.body);
    const { error: uploadError } = await supabase.storage
      .from(EXPORTS_BUCKET)
      .upload(claim.data.storage_path, bytes, {
        contentType: file.contentType,
        // A claim is generated once; upsert would need read access first.
        upsert: false,
      });
    if (uploadError) {
      await failed("upload_failed");
      return getExport(supabase, exportId);
    }

    const { error: finishError } = await supabase.rpc("finish_export", {
      target_export_id: exportId,
      export_succeeded: true,
      result_row_count: rows.data.rows.length,
      result_byte_size: bytes.byteLength,
      result_failure_code: null,
    } as unknown as Database["public"]["Functions"]["finish_export"]["Args"]);
    if (finishError) {
      return reviewFailure(mapPostgresReviewError(finishError.message));
    }
  }

  return getExport(supabase, exportId);
}

/** Requests an export; small scopes finish in this request (API §24). */
export async function requestExport(
  supabase: Client,
  input: ExportRequest,
  idempotencyKey: string,
): Promise<
  ReviewOperationResult<{
    outcome: "requested" | "existing";
    exportId: string;
    status: ExportView["status"];
  }>
> {
  const { data, error } = await supabase.rpc("request_export", {
    target_class_id: input.classId,
    target_session_id: input.sessionId,
    requested_type: input.type,
    requested_filters: input.filters,
    request_idempotency_key: idempotencyKey,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = requestRowSchema.safeParse(data?.[0]);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const row = parsed.data;
  if (row.outcome === "denied") return reviewDenial(row);
  if (!row.export_id) return reviewFailure("FORBIDDEN");

  let status = row.export_status ?? "queued";
  if (
    row.outcome === "requested" &&
    (row.row_estimate ?? 0) <= SYNC_EXPORT_ROW_LIMIT
  ) {
    const processed = await processExport(supabase, row.export_id);
    if (processed.data) status = processed.data.status;
  }
  const view = exportViewSchema.shape.status.safeParse(status);
  return {
    data: {
      outcome: row.outcome,
      exportId: row.export_id,
      status: view.success ? view.data : "queued",
    },
  };
}

/** A one-minute download link, signed only after reauthorizing the scope. */
export async function exportDownloadUrl(
  supabase: Client,
  exportId: string,
): Promise<ReviewOperationResult<string>> {
  const { data, error } = await supabase.rpc("get_export", {
    target_export_id: exportId,
  });
  if (error) return reviewFailure(mapPostgresReviewError(error.message));
  const parsed = exportViewSchema
    .extend({ storagePath: z.string().nullable() })
    .safeParse(data);
  if (!parsed.success) return reviewFailure("FORBIDDEN");
  const view = parsed.data;
  if (view.status !== "ready" || !view.storagePath) {
    return reviewFailure("INVALID_STATUS_TRANSITION", {
      reason: view.status === "expired" ? "expired" : "not_ready",
    });
  }
  const { data: signed, error: signError } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .createSignedUrl(view.storagePath, EXPORT_DOWNLOAD_TTL_SECONDS, {
      download: exportFileName(
        view.type === "geojson" ? "geojson" : "csv",
        view.sessionTitle,
        view.id,
      ),
    });
  if (signError || !signed?.signedUrl) return reviewFailure("FORBIDDEN");
  return { data: signed.signedUrl };
}
