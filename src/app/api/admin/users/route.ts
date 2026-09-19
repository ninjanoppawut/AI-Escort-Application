import { listUsers } from "@/features/admin/server/directory";
import { handleAdminList } from "@/features/admin/server/routes";

// Teacher/student directory (ADM-003): filter by type, optional search.
export async function GET(request: Request) {
  return handleAdminList(request, (supabase, page, params) => {
    const type = params.get("type");
    const q = params.get("q")?.trim().slice(0, 120) || null;
    return listUsers(supabase, {
      ...page,
      type: type === "student" || type === "teacher" ? type : null,
      q,
    });
  });
}
