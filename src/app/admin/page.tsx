import type { Metadata } from "next";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminHome, AdminShell } from "@/features/admin/components/admin-shell";
import { requireAdminForPage } from "@/features/admin/server/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ผู้ดูแลระบบ" };

export default async function AdminHomePage() {
  const access = await requireAdminForPage("home", "/admin");
  if (!access.allowed) return <AdminDenied />;
  return (
    <AdminShell current="home" title="ภาพรวมผู้ดูแลระบบ">
      <AdminHome />
    </AdminShell>
  );
}
