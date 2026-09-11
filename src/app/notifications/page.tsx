import { redirect } from "next/navigation";

import { NotificationCenter } from "@/features/notifications/client/notification-center";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { listNotifications } from "@/features/notifications/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const identity = await getActiveIdentity();
  if (identity.error) {
    if (
      identity.error === "AUTH_REQUIRED" ||
      identity.error === "EMAIL_NOT_CONFIRMED"
    ) {
      const query = new URLSearchParams({
        error: identity.error,
        returnTo: "/notifications",
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${identity.error}`);
  }

  const notificationResult = await listNotifications(
    await createSupabaseServerClient(),
    { status: "all", limit: 20 },
  );

  if ("error" in notificationResult) {
    redirect(`/auth/error?code=${notificationResult.error.code}`);
  }

  return (
    <main className="bg-background min-h-dvh px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <NotificationCenter initialPage={notificationResult.data} />
      </div>
    </main>
  );
}
