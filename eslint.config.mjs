import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".claude/**",
    ".impeccable/**",
    ".next/**",
    "coverage/**",
    "design/**",
    "node_modules/**",
    "playwright-report/**",
    "supabase/.temp/**",
    "test-results/**",
  ]),
]);
