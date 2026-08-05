// @vitest-environment node

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("SSR authentication boundary", () => {
  it("refreshes and protects identity with validated claims, never getSession", async () => {
    const files = await Promise.all([
      readFile(new URL("../../proxy.ts", import.meta.url), "utf8"),
      readFile(new URL("./server/identity.ts", import.meta.url), "utf8"),
      readFile(new URL("../../lib/supabase/proxy.ts", import.meta.url), "utf8"),
    ]);
    const source = files.join("\n");

    expect(source).toContain("getClaims()");
    expect(source).toContain("getUser()");
    expect(source).not.toContain("getSession(");
    expect(source).not.toContain("SUPABASE_SECRET_KEY");
  });
});
