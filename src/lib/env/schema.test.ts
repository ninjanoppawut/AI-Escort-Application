import { describe, expect, it } from "vitest";

import {
  EnvironmentConfigurationError,
  parseBrowserEnvironment,
  parseServerEnvironment,
} from "@/lib/env/schema";

const validBrowserEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value_long_enough",
  NEXT_PUBLIC_APP_ENV: "local",
};

describe("environment validation", () => {
  it("accepts browser-safe Supabase configuration", () => {
    expect(parseBrowserEnvironment(validBrowserEnvironment)).toEqual(
      validBrowserEnvironment,
    );
  });

  it("reports field names without leaking values", () => {
    const exposedValue = "not-a-valid-secret-value";

    expect.assertions(3);

    try {
      parseBrowserEnvironment({
        ...validBrowserEnvironment,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: exposedValue,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect((error as EnvironmentConfigurationError).fields).toEqual([
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ]);
      expect((error as Error).message).not.toContain(exposedValue);
    }
  });

  it("requires complete custom SMTP settings in production", () => {
    expect(() =>
      parseServerEnvironment({
        ...validBrowserEnvironment,
        NEXT_PUBLIC_APP_ENV: "production",
      }),
    ).toThrow(EnvironmentConfigurationError);
  });

  it("accepts a complete production SMTP configuration", () => {
    const result = parseServerEnvironment({
      ...validBrowserEnvironment,
      NEXT_PUBLIC_APP_ENV: "production",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "test-only-password",
      SMTP_FROM: "noreply@example.com",
    });

    expect(result.SMTP_PORT).toBe(587);
  });
});
