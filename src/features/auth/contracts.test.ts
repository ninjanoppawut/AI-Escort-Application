import { describe, expect, it } from "vitest";

import {
  emailRequestSchema,
  signInRequestSchema,
  signUpRequestSchema,
  updatePasswordRequestSchema,
} from "@/features/auth/contracts";

describe("auth request contracts", () => {
  it("normalizes email without accepting a browser-selected role", () => {
    expect(
      signUpRequestSchema.parse({
        email: " Student.A1@Example.EDU ",
        password: "a long student passphrase",
        returnTo: "/app",
      }).email,
    ).toBe("student.a1@example.edu");

    expect(
      signUpRequestSchema.safeParse({
        email: "student.a1@example.edu",
        password: "a long student passphrase",
        role: "teacher",
      }).success,
    ).toBe(false);
  });

  it("enforces the documented password floor", () => {
    expect(
      signUpRequestSchema.safeParse({
        email: "student.a1@example.edu",
        password: "too-short",
      }).success,
    ).toBe(false);
    expect(
      updatePasswordRequestSchema.safeParse({ password: "123456789" }).success,
    ).toBe(false);
  });

  it("rejects invented fields on every public auth mutation", () => {
    expect(
      signInRequestSchema.safeParse({
        email: "student.a1@example.edu",
        password: "a long student passphrase",
        accountType: "teacher",
      }).success,
    ).toBe(false);
    expect(
      emailRequestSchema.safeParse({
        email: "student.a1@example.edu",
        schoolId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
});
