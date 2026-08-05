import { describe, expect, it } from "vitest";

import { authCallbackUrl, safeReturnPath } from "@/features/auth/redirect";

describe("auth redirect validation", () => {
  it("allows only documented same-origin application destinations", () => {
    expect(safeReturnPath("/app/observations?status=draft")).toBe(
      "/app/observations?status=draft",
    );
    expect(safeReturnPath("/join/opaque_token-123")).toBe(
      "/join/opaque_token-123",
    );
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal",
    "/auth/update-password",
    "/join/short",
  ])("falls back for unsafe destination %s", (destination) => {
    expect(safeReturnPath(destination)).toBe("/app");
  });

  it("builds a PKCE callback without copying an unsafe redirect", () => {
    const callback = new URL(
      authCallbackUrl(
        "https://app.example",
        "https://evil.example/steal",
        "signup",
      ),
    );

    expect(callback.origin).toBe("https://app.example");
    expect(callback.pathname).toBe("/api/auth/callback");
    expect(callback.searchParams.get("next")).toBe("/app");
    expect(callback.searchParams.get("flow")).toBe("signup");
  });
});
