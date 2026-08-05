import { describe, expect, it } from "vitest";

import {
  AUTH_ERROR_PRESENTATIONS,
  AUTH_UI_ERROR_CODES,
  isRateLimitError,
  mapPasswordError,
  mapSignInError,
} from "@/features/auth/errors";

describe("auth error contracts", () => {
  it("has exactly one Thai UI mapping for every P1 auth error", () => {
    expect(Object.keys(AUTH_ERROR_PRESENTATIONS).sort()).toEqual(
      [...AUTH_UI_ERROR_CODES].sort(),
    );
    for (const value of Object.values(AUTH_ERROR_PRESENTATIONS)) {
      expect(value.title).not.toBe("");
      expect(value.action).not.toBe("");
    }
  });

  it("maps provider errors without returning raw provider messages", () => {
    expect(mapSignInError({ code: "email_not_confirmed" })).toBe(
      "EMAIL_NOT_CONFIRMED",
    );
    expect(mapSignInError({ code: "user_banned" })).toBe("ACCOUNT_DISABLED");
    expect(mapSignInError({ message: "arbitrary provider detail" })).toBe(
      "INVALID_CREDENTIALS",
    );
    expect(mapPasswordError({ code: "weak_password" })).toBe(
      "PASSWORD_POLICY_FAILED",
    );
  });

  it("recognizes status and provider-code rate limits", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ code: "over_email_send_rate_limit" })).toBe(true);
  });
});
