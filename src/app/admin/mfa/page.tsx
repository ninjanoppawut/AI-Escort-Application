import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminDenied } from "@/features/admin/components/admin-denied";
import { AdminMfaScreen } from "@/features/admin/components/admin-mfa-screen";
import { safeAdminReturnPath } from "@/features/admin/contracts";
import { getAdminMfaGate } from "@/features/admin/server/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ยืนยันตัวตนสองขั้นตอน" };

export default async function AdminMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeAdminReturnPath((await searchParams).returnTo);
  const gate = await getAdminMfaGate(
    `/admin/mfa?${new URLSearchParams({ returnTo }).toString()}`,
  );
  if (gate === "denied") return <AdminDenied />;
  if (gate === "already_verified") redirect(returnTo);
  return <AdminMfaScreen returnTo={returnTo} />;
}
