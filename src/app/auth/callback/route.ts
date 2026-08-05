import { NextRequest, NextResponse } from "next/server";

import { safeReturnPath } from "@/features/auth/redirect";
import {
  getActiveIdentity,
  hasRecoveryMethod,
} from "@/features/auth/server/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithoutCache(url: URL) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function callbackErrorUrl(request: NextRequest, recovery: boolean) {
  const errorUrl = new URL("/auth/error", request.url);
  errorUrl.searchParams.set(
    "code",
    recovery ? "RECOVERY_LINK_INVALID" : "AUTH_CALLBACK_INVALID",
  );
  return errorUrl;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const recovery = request.nextUrl.searchParams.get("flow") === "recovery";

  if (!code || request.nextUrl.searchParams.has("error")) {
    return redirectWithoutCache(callbackErrorUrl(request, recovery));
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return redirectWithoutCache(callbackErrorUrl(request, recovery));
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return redirectWithoutCache(callbackErrorUrl(request, recovery));
  }

  if (recovery) {
    if (!hasRecoveryMethod(claimsData.claims)) {
      await supabase.auth.signOut({ scope: "local" });
      return redirectWithoutCache(callbackErrorUrl(request, true));
    }
    return redirectWithoutCache(new URL("/auth/update-password", request.url));
  }

  const identity = await getActiveIdentity();
  if (identity.error) {
    await supabase.auth.signOut({ scope: "local" });
    const errorUrl = new URL("/auth/error", request.url);
    errorUrl.searchParams.set("code", identity.error);
    return redirectWithoutCache(errorUrl);
  }

  const destination = safeReturnPath(request.nextUrl.searchParams.get("next"));
  return redirectWithoutCache(new URL(destination, request.url));
}
