// @vitest-environment node

import { describe, expect, it } from "vitest";

import { validateActiveProfile } from "@/features/auth/profile-gate";
import { hasRecoveryMethod } from "@/features/auth/recovery";

const activeStudent = {
  id: "2f40bd98-783d-419f-9377-39d618f6ba80",
  email: "student@example.edu",
  display_name: "Student",
  account_type: "student",
  status: "active",
  email_verified_at: "2026-08-05T12:00:00.000Z",
};

describe("protected identity profile gate", () => {
  it("accepts only signed recovery sessions for password updates", () => {
    expect(
      hasRecoveryMethod({
        sub: activeStudent.id,
        email: activeStudent.email,
        is_anonymous: false,
        amr: [{ method: "recovery", timestamp: 1_785_958_400 }],
      }),
    ).toBe(true);

    expect(
      hasRecoveryMethod({
        sub: activeStudent.id,
        email: activeStudent.email,
        is_anonymous: false,
        amr: [{ method: "password", timestamp: 1_785_958_400 }],
      }),
    ).toBe(false);
    expect(
      hasRecoveryMethod({
        sub: activeStudent.id,
        email: activeStudent.email,
        is_anonymous: true,
        amr: [{ method: "recovery", timestamp: 1_785_958_400 }],
      }),
    ).toBe(false);
  });

  it("accepts an active account with an allowed relational role", () => {
    expect(validateActiveProfile(activeStudent, ["student"])).toEqual({
      identity: activeStudent,
      error: null,
    });
  });

  it("denies missing or inactive profiles", () => {
    expect(validateActiveProfile(null)).toEqual({
      identity: null,
      error: "ACCOUNT_DISABLED",
    });
    expect(
      validateActiveProfile({ ...activeStudent, status: "inactive" }),
    ).toEqual({ identity: null, error: "ACCOUNT_DISABLED" });
  });

  it("denies an active account whose relational role is not allowed", () => {
    expect(validateActiveProfile(activeStudent, ["teacher"])).toEqual({
      identity: null,
      error: "FORBIDDEN",
    });
  });
});
