import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { reviewErrorPresentation } from "../errors";

/** The refusal teacher-only review pages show to anyone else. */
export function TeacherAccessDenied({ detail }: { detail: string }) {
  const presentation = reviewErrorPresentation("FORBIDDEN");
  return (
    <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
      <section
        className="border-border bg-card mx-auto max-w-2xl rounded-xl border p-4"
        data-error-code="FORBIDDEN"
        role="alert"
      >
        <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
        <h1 className="mt-2 font-semibold">{presentation.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm leading-6">{detail}</p>
        <Link
          className="border-border bg-background mt-3 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
          href="/app"
        >
          กลับหน้าหลัก
        </Link>
      </section>
    </main>
  );
}
