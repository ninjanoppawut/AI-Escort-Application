import { NextRequest } from "next/server";

import {
  authJsonError,
  hasSafeRequestOrigin,
} from "@/features/auth/server/request";
import { createRequestContext } from "@/lib/http/request-context";
import { jsonSuccess } from "@/lib/http/route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { requestId } = createRequestContext(request.headers);

  if (!hasSafeRequestOrigin(request)) {
    return authJsonError("FORBIDDEN", requestId, 403);
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    await supabase.auth.signOut({ scope: "local" });
  }

  return jsonSuccess({ signedOut: true }, requestId);
}
