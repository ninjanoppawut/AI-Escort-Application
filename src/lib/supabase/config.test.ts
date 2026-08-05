// @vitest-environment node

import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

let config = "";

beforeAll(async () => {
  config = await readFile(
    new URL("../../../supabase/config.toml", import.meta.url),
    "utf8",
  );
});

describe("local Supabase Auth configuration", () => {
  it("requires verified email/password identities", () => {
    const authSection = config.split("[auth.rate_limit]")[0] ?? "";
    const emailSection = config
      .split("[auth.email]")[1]
      ?.split("[auth.sms]")[0];

    expect(authSection).toContain("enable_anonymous_sign_ins = false");
    expect(authSection).toContain("minimum_password_length = 10");
    expect(emailSection).toContain("enable_confirmations = true");
    expect(emailSection).toContain("secure_password_change = true");
  });

  it("uses Mailpit and exact local Auth callback routes", () => {
    expect(config).toContain("[local_smtp]");
    expect(config).toContain("port = 54624");
    expect(config).toContain('"http://localhost:3000/auth/callback"');
    expect(config).toContain('"http://localhost:3000/api/auth/callback"');
    expect(config).toContain('"http://localhost:3000/auth/update-password"');
  });
});
