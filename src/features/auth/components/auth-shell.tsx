import { Leaf, LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="bg-background min-h-dvh px-4 py-5 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <Link
          className="focus-visible:ring-ring mb-8 inline-flex items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:outline-none"
          href="/"
        >
          <span className="bg-primary text-primary-foreground grid size-11 place-items-center rounded-full">
            <Leaf aria-hidden="true" className="size-5" />
          </span>
          <span>
            <span className="block text-base font-bold">AI Escort</span>
            <span className="text-muted-foreground block text-[0.68rem] tracking-[0.14em] uppercase">
              Field learning
            </span>
          </span>
        </Link>

        <section className="border-border bg-card rounded-[1.75rem] border p-5 shadow-[0_20px_60px_rgba(20,71,47,0.10)] sm:p-8">
          <p className="text-primary font-mono text-xs font-semibold tracking-[0.16em] uppercase">
            {eyebrow}
          </p>
          <h1 className="text-foreground mt-3 text-3xl leading-tight font-bold tracking-tight text-balance">
            {title}
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {description}
          </p>
          <div className="mt-7">{children}</div>
        </section>

        <p className="text-muted-foreground mt-5 flex items-start justify-center gap-2 px-4 text-center text-xs leading-5">
          <LockKeyhole
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          ใช้อีเมลที่ยืนยันแล้ว ระบบจะไม่ให้หน้าเว็บเลือกสิทธิ์นักเรียนหรือครู
        </p>
      </div>
    </main>
  );
}
