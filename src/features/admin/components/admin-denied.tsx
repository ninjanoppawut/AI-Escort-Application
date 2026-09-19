import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { ADMIN_ERROR_PRESENTATIONS } from "../contracts";

/**
 * The refusal every admin page shows without an active grant. It never says
 * whether the requested record exists.
 */
export function AdminDenied() {
  const presentation = ADMIN_ERROR_PRESENTATIONS.ADMIN_REQUIRED;
  return (
    <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
      <section
        className="border-border bg-card mx-auto max-w-2xl rounded-xl border p-4"
        data-error-code="ADMIN_REQUIRED"
        role="alert"
      >
        <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
        <h1 className="mt-2 font-semibold">{presentation.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          {presentation.description}
        </p>
        <Link
          className="border-border bg-background mt-3 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
          href="/app"
        >
          {presentation.action}
        </Link>
      </section>
    </main>
  );
}
