import type { Metadata } from "next";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { HealthScreen } from "@/features/admin/components/health-screen";
import { requireAdminForPage } from "@/features/admin/server/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ระบบ · ผู้ดูแลระบบ" };

export default async function Page() {
  const access = await requireAdminForPage("health", "/admin/health");
  if (!access.allowed) return <AdminDenied />;
  return (
    <AdminShell current="health" title="สุขภาพระบบ">
      <HealthScreen />
    </AdminShell>
  );
}
