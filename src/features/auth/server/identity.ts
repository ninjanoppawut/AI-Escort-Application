import "server-only";

import { z } from "zod";

import {
  type ActiveIdentity,
  type IdentityResult,
  validateActiveProfile,
} from "@/features/auth/profile-gate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signedClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  is_anonymous: z.literal(false),
  amr: z
    .array(z.object({ method: z.string(), timestamp: z.number() }))
    .optional(),
});

export type {
  ActiveIdentity,
  IdentityResult,
} from "@/features/auth/profile-gate";

export function hasRecoveryMethod(claims: unknown) {
  const result = signedClaimsSchema.safeParse(claims);
  return (
    result.success &&
    result.data.amr?.some((entry) => entry.method === "recovery") === true
  );
}

export async function getActiveIdentity(
  allowedAccountTypes: readonly ActiveIdentity["account_type"][] = [
    "student",
    "teacher",
  ],
): Promise<IdentityResult> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const claims = signedClaimsSchema.safeParse(claimsData?.claims);

  if (claimsError || !claims.success) {
    return { identity: null, error: "AUTH_REQUIRED" };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || user.id !== claims.data.sub) {
    return { identity: null, error: "AUTH_REQUIRED" };
  }

  if (!user.email_confirmed_at) {
    return { identity: null, error: "EMAIL_NOT_CONFIRMED" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,display_name,account_type,status,email_verified_at")
    .eq("id", claims.data.sub)
    .maybeSingle();

  return validateActiveProfile(profile, allowedAccountTypes);
}
