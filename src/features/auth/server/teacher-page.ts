import "server-only";

import { redirect } from "next/navigation";

import { getActiveIdentity } from "./identity";

/**
 * Page guard for teacher routes: sends signed-out or unconfirmed users to
 * sign in and returns whether the active account is a teacher. Pages render
 * their own refusal so a denial never reveals whether the record exists.
 */
export async function requireSignedInForPage(returnTo: string) {
  const identity = await getActiveIdentity();
  if (identity.error) {
    if (
      identity.error === "AUTH_REQUIRED" ||
      identity.error === "EMAIL_NOT_CONFIRMED"
    ) {
      const query = new URLSearchParams({ error: identity.error, returnTo });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }
  return { isTeacher: identity.identity.account_type === "teacher" };
}
