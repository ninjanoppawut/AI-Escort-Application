import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { IncidentDetailScreen } from "@/features/admin/components/incident-detail-screen";
import { requireAdminForPage } from "@/features/admin/server/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "เหตุการณ์ · ผู้ดูแลระบบ" };

export default async function AdminIncidentPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;
  if (!z.uuid().safeParse(incidentId).success) notFound();
  const access = await requireAdminForPage(
    "incidents",
    `/admin/incidents/${incidentId}`,
  );
  if (!access.allowed) return <AdminDenied />;
  return (
    <AdminShell current="incidents" title="รายละเอียดเหตุการณ์">
      <IncidentDetailScreen incidentId={incidentId} />
    </AdminShell>
  );
}
