// @vitest-environment node

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const browserReachableModules = [
  new URL("./browser.ts", import.meta.url),
  new URL("../supabase/client.ts", import.meta.url),
];

const forbiddenServerVariables = [
  "SUPABASE_SECRET_KEY",
  "GEMINI_API_KEY",
  "SMTP_PASSWORD",
  "ADMIN_BOOTSTRAP",
];

describe("browser configuration boundary", () => {
  it("does not reference server-only configuration from browser modules", async () => {
    const contents = await Promise.all(
      browserReachableModules.map((path) => readFile(path, "utf8")),
    );

    for (const content of contents) {
      for (const variable of forbiddenServerVariables) {
        expect(content).not.toContain(variable);
      }
    }
  });
});
