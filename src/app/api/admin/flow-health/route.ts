import { HEALTH_WINDOWS } from "@/features/admin/operations-contracts";
import { flowHealth } from "@/features/admin/server/operations";
import { handleAdminRead } from "@/features/admin/server/routes";

// Flow health (ADM-006/ADM-007): window of 1, 24 (default), or 168 hours.
export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("hours"));
  const hours = (HEALTH_WINDOWS as readonly number[]).includes(requested)
    ? requested
    : 24;
  return handleAdminRead(request, (supabase) => flowHealth(supabase, hours));
}
