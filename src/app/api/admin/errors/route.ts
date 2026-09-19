import {
  errorFilterSchema,
  filterFromParams,
} from "@/features/admin/operations-contracts";
import { adminError } from "@/features/admin/server/directory";
import { listErrorEvents } from "@/features/admin/server/operations";
import { handleAdminList } from "@/features/admin/server/routes";

// Redacted error explorer (ADM-005): bounded time range, filters, pages.
export async function GET(request: Request) {
  return handleAdminList(request, async (supabase, page, params) => {
    const filter = filterFromParams(errorFilterSchema, params);
    if (!filter) return adminError("VALIDATION_FAILED");
    return listErrorEvents(supabase, filter, page);
  });
}
