"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getBrowserEnvironment } from "@/lib/env/browser";
import type { Database } from "@/lib/supabase/database.types";

export function createSupabaseBrowserClient() {
  const environment = getBrowserEnvironment();

  return createBrowserClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
