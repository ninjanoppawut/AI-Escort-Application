import type { Metadata } from "next";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { UsersScreen } from "@/features/admin/components/users-screen";
import { requireAdminForPage } from "@/features/admin/server/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ผู้ใช้ · ผู้ดูแลระบบ" };

export default async function AdminUsersPage() {
  const access = await requireAdminForPage("users", "/admin/users");
  if (!access.allowed) return <AdminDenied />;
  return (
    <AdminShell current="users" title="ครูและนักเรียน">
      <UsersScreen />
    </AdminShell>
  );
}
