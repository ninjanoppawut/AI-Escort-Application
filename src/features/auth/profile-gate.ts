import { z } from "zod";

import type { AuthUiErrorCode } from "@/features/auth/errors";

const profileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  display_name: z.string().min(1),
  account_type: z.enum(["student", "teacher"]),
  status: z.literal("active"),
  email_verified_at: z.string().datetime({ offset: true }),
});

export type ActiveIdentity = z.infer<typeof profileSchema>;

export type IdentityResult =
  | { identity: ActiveIdentity; error: null }
  | { identity: null; error: AuthUiErrorCode };

export function validateActiveProfile(
  profile: unknown,
  allowedAccountTypes: readonly ActiveIdentity["account_type"][] = [
    "student",
    "teacher",
  ],
): IdentityResult {
  const parsedProfile = profileSchema.safeParse(profile);

  if (!parsedProfile.success) {
    return { identity: null, error: "ACCOUNT_DISABLED" };
  }

  if (!allowedAccountTypes.includes(parsedProfile.data.account_type)) {
    return { identity: null, error: "FORBIDDEN" };
  }

  return { identity: parsedProfile.data, error: null };
}
