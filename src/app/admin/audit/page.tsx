import type { Metadata } from "next";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { AuditScreen } from "@/features/admin/components/audit-screen";
import { requireAdminForPage } from "@/features/admin/server/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "บันทึกการใช้งาน · ผู้ดูแลระบบ" };

export default async function Page() {
  const access = await requireAdminForPage("audit", "/admin/audit");
  if (!access.allowed) return <AdminDenied />;
  return (
    <AdminShell current="audit" title="บันทึกการใช้งาน">
      <AuditScreen />
    </AdminShell>
  );
}
