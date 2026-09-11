import { z } from "zod";

const signedRecoveryClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  is_anonymous: z.literal(false),
  amr: z
    .array(z.object({ method: z.string(), timestamp: z.number() }))
    .optional(),
});

export function hasRecoveryMethod(claims: unknown) {
  const result = signedRecoveryClaimsSchema.safeParse(claims);
  return (
    result.success &&
    result.data.amr?.some((entry) => entry.method === "recovery") === true
  );
}
