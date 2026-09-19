import type { Metadata } from "next";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { IncidentsScreen } from "@/features/admin/components/incidents-screen";
import { requireAdminForPage } from "@/features/admin/server/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "เหตุการณ์ · ผู้ดูแลระบบ" };

export default async function AdminIncidentsPage() {
  const access = await requireAdminForPage("incidents", "/admin/incidents");
  if (!access.allowed) return <AdminDenied />;
  return (
    <AdminShell current="incidents" title="เหตุการณ์">
      <IncidentsScreen />
    </AdminShell>
  );
}
