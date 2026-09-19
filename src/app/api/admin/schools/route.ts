import { createSchoolSchema } from "@/features/admin/directory-contracts";
import { createSchool, listSchools } from "@/features/admin/server/directory";
import {
  handleAdminList,
  handleAdminMutation,
} from "@/features/admin/server/routes";

// Admin schools (API_AND_REALTIME.md admin routes; ADM-002, ADM-012).
export async function GET(request: Request) {
  return handleAdminList(request, (supabase, page, params) => {
    const status = params.get("status");
    return listSchools(supabase, {
      ...page,
      status: status === "active" || status === "archived" ? status : null,
    });
  });
}

export async function POST(request: Request) {
  return handleAdminMutation(request, createSchoolSchema, (supabase, body) =>
    createSchool(supabase, body.name),
  );
}
