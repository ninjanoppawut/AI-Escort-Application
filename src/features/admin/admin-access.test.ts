import { describe, expect, it, vi } from "vitest";

import { loadMfaStep } from "./components/admin-mfa-screen";
import { safeAdminReturnPath, totpCodeSchema } from "./contracts";

function mfaClient(factors: {
  totp: { id: string; status: string }[];
  all: { id: string; status: string; factor_type: string }[];
}) {
  return {
    listFactors: vi.fn().mockResolvedValue({ data: factors, error: null }),
    unenroll: vi.fn().mockResolvedValue({ data: {}, error: null }),
    enroll: vi.fn().mockResolvedValue({
      data: {
        id: "factor-new",
        totp: {
          qr_code: "data:image/svg+xml;utf-8,<svg/>",
          secret: "JBSWY3DP",
        },
      },
      error: null,
    }),
    challengeAndVerify: vi.fn(),
  };
}

describe("admin MFA step", () => {
  it("challenges an existing verified factor without enrolling another", async () => {
    const mfa = mfaClient({
      totp: [{ id: "factor-1", status: "verified" }],
      all: [{ id: "factor-1", status: "verified", factor_type: "totp" }],
    });
    expect(await loadMfaStep(mfa)).toEqual({
      kind: "verify",
      factorId: "factor-1",
    });
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it("clears stale unverified factors, then enrolls one", async () => {
    const mfa = mfaClient({
      totp: [],
      all: [{ id: "stale", status: "unverified", factor_type: "totp" }],
    });
    const step = await loadMfaStep(mfa);
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale" });
    expect(step).toMatchObject({ kind: "enroll", factorId: "factor-new" });
  });

  it("reports a failed factor lookup for retry", async () => {
    const mfa = mfaClient({ totp: [], all: [] });
    mfa.listFactors.mockResolvedValue({ data: null, error: new Error("x") });
    expect(await loadMfaStep(mfa)).toEqual({ kind: "load_failed" });
  });
});

describe("admin contracts", () => {
  it("returns only to admin console paths", () => {
    expect(safeAdminReturnPath("/admin/audit")).toBe("/admin/audit");
    expect(safeAdminReturnPath("/admin")).toBe("/admin");
    expect(safeAdminReturnPath("https://evil.example/admin")).toBe("/admin");
    expect(safeAdminReturnPath("//evil.example")).toBe("/admin");
    expect(safeAdminReturnPath("/teacher/classes")).toBe("/admin");
    expect(safeAdminReturnPath(undefined)).toBe("/admin");
  });

  it("accepts only six-digit codes", () => {
    expect(totpCodeSchema.safeParse({ code: " 123456 " }).success).toBe(true);
    expect(totpCodeSchema.safeParse({ code: "12345" }).success).toBe(false);
    expect(totpCodeSchema.safeParse({ code: "12a456" }).success).toBe(false);
  });
});
