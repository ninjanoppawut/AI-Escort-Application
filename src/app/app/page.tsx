import { Leaf, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ClassMemberBrowser } from "@/features/classes/components/class-member-browser";
import { SignOutButton } from "@/features/auth/components/auth-forms";
import { getActiveIdentity } from "@/features/auth/server/identity";
import { listAuthorizedClasses } from "@/features/classes/server/operations";
import { NotificationBadge } from "@/features/notifications/client/notification-badge";
import { listNotifications } from "@/features/notifications/server/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProtectedHomePage() {
  const result = await getActiveIdentity();

  if (result.error) {
    if (
      result.error === "AUTH_REQUIRED" ||
      result.error === "EMAIL_NOT_CONFIRMED"
    ) {
      const query = new URLSearchParams({
        error: result.error,
        returnTo: "/app",
      });
      redirect(`/auth/sign-in?${query.toString()}`);
    }
    redirect(`/auth/error?code=${result.error}`);
  }

  const supabase = await createSupabaseServerClient();
  const [classResult, notificationResult] = await Promise.all([
    listAuthorizedClasses(supabase),
    listNotifications(supabase, { status: "unread", limit: 1 }),
  ]);
  const classes = "data" in classResult ? classResult.data : [];
  const unreadCount =
    "data" in notificationResult ? notificationResult.data.unreadCount : 0;

  return (
    <main className="bg-background min-h-dvh px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground grid size-11 place-items-center rounded-full">
              <Leaf aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="font-bold">AI Escort</p>
              <p className="text-muted-foreground text-xs">
                พื้นที่ที่ป้องกันแล้ว
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <NotificationBadge initialUnreadCount={unreadCount} />
            <SignOutButton />
          </div>
        </header>

        <section className="border-border bg-card mt-10 rounded-[1.75rem] border p-6 sm:p-9">
          <ShieldCheck aria-hidden="true" className="text-success size-10" />
          <p className="text-primary mt-5 font-mono text-xs font-semibold tracking-[0.14em] uppercase">
            ยืนยันตัวตนแล้ว · {result.identity.account_type}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            สวัสดี {result.identity.display_name}
          </h1>
          <p className="text-muted-foreground mt-3 leading-7">
            อีเมลของคุณได้รับการยืนยันแล้ว
            โปรไฟล์นักเรียนถูกสร้างจากระบบฐานข้อมูลโดยอัตโนมัติ
            และสิทธิ์จะตรวจจากข้อมูลเชิงสัมพันธ์ทุกครั้ง
          </p>
          <dl className="border-border mt-6 grid gap-3 border-t pt-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">อีเมล</dt>
              <dd className="mt-1 font-medium break-all">
                {result.identity.email}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ประเภทบัญชี</dt>
              <dd className="mt-1 font-medium">
                {result.identity.account_type === "student"
                  ? "นักเรียน"
                  : "ครู"}
              </dd>
            </div>
          </dl>
          {result.identity.account_type === "teacher" ? (
            <Link
              className="bg-primary text-primary-foreground mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
              href="/teacher/classes"
            >
              จัดการชั้นเรียน
            </Link>
          ) : null}
        </section>

        {result.identity.account_type === "student" ? (
          <div className="mt-6">
            <ClassMemberBrowser initialClasses={classes} mode="student" />
          </div>
        ) : null}
      </div>
    </main>
  );
}
