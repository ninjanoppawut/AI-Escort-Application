import "server-only";

import { createClient } from "@supabase/supabase-js";

import { EnvironmentConfigurationError } from "@/lib/env/schema";
import { getServerEnvironment } from "@/lib/env/server";

export function createSupabaseSecretClient() {
  const environment = getServerEnvironment();

  if (!environment.SUPABASE_SECRET_KEY) {
    throw new EnvironmentConfigurationError(["SUPABASE_SECRET_KEY"]);
  }

  return createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
