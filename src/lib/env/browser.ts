import {
  parseBrowserEnvironment,
  type BrowserEnvironment,
} from "@/lib/env/schema";

let cachedEnvironment: BrowserEnvironment | undefined;

export function getBrowserEnvironment(): BrowserEnvironment {
  cachedEnvironment ??= parseBrowserEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  });

  return cachedEnvironment;
}
