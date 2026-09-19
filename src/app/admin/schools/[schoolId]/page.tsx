import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { SchoolDetailScreen } from "@/features/admin/components/school-detail-screen";
import { requireAdminForPage } from "@/features/admin/server/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "โรงเรียน · ผู้ดูแลระบบ" };

export default async function AdminSchoolPage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  if (!z.uuid().safeParse(schoolId).success) notFound();
  const access = await requireAdminForPage(
    "schools",
    `/admin/schools/${schoolId}`,
  );
  if (!access.allowed) return <AdminDenied />;
  return (
    <AdminShell current="schools" title="รายละเอียดโรงเรียน">
      <SchoolDetailScreen schoolId={schoolId} />
    </AdminShell>
  );
}
