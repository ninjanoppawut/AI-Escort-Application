import type { Metadata } from "next";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { ErrorsScreen } from "@/features/admin/components/errors-screen";
import { requireAdminForPage } from "@/features/admin/server/access";
import { TELEMETRY_FLOWS } from "@/lib/telemetry/contracts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ข้อผิดพลาด · ผู้ดูแลระบบ" };

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow } = await searchParams;
  const access = await requireAdminForPage("errors", "/admin/errors");
  if (!access.allowed) return <AdminDenied />;
  const initialFlow =
    flow && (TELEMETRY_FLOWS as readonly string[]).includes(flow) ? flow : null;
  return (
    <AdminShell current="errors" title="ข้อผิดพลาดตามขั้นตอน">
      <ErrorsScreen initialFlow={initialFlow} />
    </AdminShell>
  );
}
