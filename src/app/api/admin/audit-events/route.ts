import {
  auditFilterSchema,
  filterFromParams,
} from "@/features/admin/operations-contracts";
import { adminError } from "@/features/admin/server/directory";
import { listAuditEvents } from "@/features/admin/server/operations";
import { handleAdminList } from "@/features/admin/server/routes";

// Audit explorer (ADM-004): bounded time range, filters, keyset pages.
export async function GET(request: Request) {
  return handleAdminList(request, async (supabase, page, params) => {
    const filter = filterFromParams(auditFilterSchema, params);
    if (!filter) return adminError("VALIDATION_FAILED");
    return listAuditEvents(supabase, filter, page);
  });
}
