import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getActiveIdentity } from "@/features/auth/server/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { openAdminConsoleRowSchema, type AdminView } from "../contracts";

function redirectForIdentityError(code: string, returnTo: string): never {
  if (code === "AUTH_REQUIRED" || code === "EMAIL_NOT_CONFIRMED") {
    const query = new URLSearchParams({ error: code, returnTo });
    redirect(`/auth/sign-in?${query.toString()}`);
  }
  redirect(`/auth/error?code=${code}`);
}

/**
 * Page guard for the admin console (ADM-001): an active relational grant and
 * an aal2 session, checked and audited by `open_admin_console`. A grant
 * without aal2 goes to the MFA step; anything else is refused.
 */
export async function requireAdminForPage(
  view: AdminView,
  returnTo: string,
): Promise<{ allowed: true; adminId: string } | { allowed: false }> {
  const identity = await getActiveIdentity();
  if (identity.error) redirectForIdentityError(identity.error, returnTo);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("open_admin_console", {
    view_key: view,
  });
  const row = openAdminConsoleRowSchema.safeParse(data?.[0]);
  if (error || !row.success) return { allowed: false };
  if (row.data.outcome === "ok" && row.data.admin_user_id) {
    return { allowed: true, adminId: row.data.admin_user_id };
  }
  if (row.data.error_code === "MFA_REQUIRED") {
    redirect(`/admin/mfa?${new URLSearchParams({ returnTo }).toString()}`);
  }
  if (
    row.data.error_code === "AUTH_REQUIRED" ||
    row.data.error_code === "EMAIL_NOT_CONFIRMED" ||
    row.data.error_code === "ACCOUNT_DISABLED"
  ) {
    redirectForIdentityError(row.data.error_code, returnTo);
  }
  return { allowed: false };
}

const aalClaimsSchema = z.object({ aal: z.enum(["aal1", "aal2"]) });

/**
 * The MFA step is open to an active grant holder at any assurance level; an
 * aal2 session has nothing left to do there.
 */
export async function getAdminMfaGate(
  returnTo: string,
): Promise<"enroll_or_verify" | "already_verified" | "denied"> {
  const identity = await getActiveIdentity();
  if (identity.error) redirectForIdentityError(identity.error, returnTo);

  const supabase = await createSupabaseServerClient();
  const { data: grant } = await supabase
    .from("platform_admins")
    .select("status")
    .eq("user_id", identity.identity.id)
    .maybeSingle();
  if (grant?.status !== "active") return "denied";

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = aalClaimsSchema.safeParse(claimsData?.claims);
  return claims.success && claims.data.aal === "aal2"
    ? "already_verified"
    : "enroll_or_verify";
}
