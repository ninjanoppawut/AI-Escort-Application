import type { Metadata } from "next";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { SchoolsScreen } from "@/features/admin/components/schools-screen";
import { requireAdminForPage } from "@/features/admin/server/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "โรงเรียน · ผู้ดูแลระบบ" };

export default async function AdminSchoolsPage() {
  const access = await requireAdminForPage("schools", "/admin/schools");
  if (!access.allowed) return <AdminDenied />;
  return (
    <AdminShell current="schools" title="โรงเรียนและการเชิญครู">
      <SchoolsScreen />
    </AdminShell>
  );
}
