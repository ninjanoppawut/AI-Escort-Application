import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { ADMIN_SECTIONS, type AdminView } from "../contracts";

/**
 * Admin console frame: shallow navigation to the built sections, the aal2
 * badge, and a reminder that every view is audited (ADM-009). Works from a
 * 360 px phone up to desktop, where the navigation becomes a side rail.
 */
export function AdminShell({
  current,
  title,
  children,
}: {
  current: AdminView;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-background min-h-dvh" data-admin-view={current}>
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-8">
          <Link
            className="flex min-h-11 items-center gap-2 font-semibold"
            href="/admin"
          >
            <ShieldCheck aria-hidden="true" className="size-5 text-[#1F5C3A]" />
            ผู้ดูแลระบบ
          </Link>
          <p
            className="rounded-full border border-[#9CC5AE] bg-[#EAF4EE] px-3 py-1 text-[13px] font-medium text-[#14472F]"
            data-admin-aal="aal2"
          >
            ยืนยันสองขั้นตอนแล้ว · ทุกการเปิดดูถูกบันทึก
          </p>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:px-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="เมนูผู้ดูแลระบบ" className="min-w-0">
          <ul className="flex gap-2 overflow-x-auto md:flex-col">
            <li>
              <NavLink active={current === "home"} href="/admin">
                ภาพรวม
              </NavLink>
            </li>
            {ADMIN_SECTIONS.map((section) => (
              <li key={section.view}>
                <NavLink active={current === section.view} href={section.href}>
                  {section.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="grid min-w-0 content-start gap-4">
          <h1 className="text-xl font-semibold">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap md:rounded-[10px]",
        active
          ? "border-[#1F5C3A] bg-[#1F5C3A] text-white"
          : "border-border bg-card",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

/** Home: the sections that exist, as large targets. */
export function AdminHome() {
  return (
    <section className="grid gap-3" aria-label="ส่วนของระบบผู้ดูแล">
      <p className="text-muted-foreground text-sm leading-6">
        ส่วนผู้ดูแลระบบใช้ดูแลโรงเรียน บัญชีครู และสุขภาพของระบบ ไม่แสดงรูปภาพ
        ตำแหน่งละเอียด หรือข้อความหลักฐานของนักเรียน
      </p>
      {ADMIN_SECTIONS.length === 0 ? (
        <p
          className="border-border bg-card rounded-xl border border-dashed p-4 text-sm"
          data-admin-empty=""
        >
          ยังไม่มีเครื่องมือผู้ดูแลที่เปิดใช้
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {ADMIN_SECTIONS.map((section) => (
            <li key={section.view}>
              <Link
                className="border-border bg-card grid min-h-11 gap-1 rounded-xl border p-4"
                href={section.href}
              >
                <span className="font-semibold">{section.title}</span>
                <span className="text-muted-foreground text-sm leading-6">
                  {section.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
