import { describe, expect, it } from "vitest";

import {
  adminPageOf,
  decodeAdminCursor,
  encodeAdminCursor,
  issueInvitationSchema,
  parsePageSize,
} from "./directory-contracts";

const id = "a0000000-0000-4000-8000-000000000001";
const createdAt = "2026-09-19T08:00:00.123456+00:00";

describe("admin keyset cursors (ADM-012)", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = encodeAdminCursor(createdAt, id);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAdminCursor(cursor)).toEqual({ c: createdAt, i: id });
  });

  it("separates an absent cursor from an invalid one", () => {
    expect(decodeAdminCursor(null)).toBeUndefined();
    expect(decodeAdminCursor("")).toBeUndefined();
    expect(decodeAdminCursor("not a cursor!")).toBeNull();
    expect(decodeAdminCursor("eyJjIjoxfQ")).toBeNull();
    expect(decodeAdminCursor("x".repeat(201))).toBeNull();
  });

  it("defaults to 50 rows and caps pages at 100", () => {
    expect(parsePageSize(null)).toBe(50);
    expect(parsePageSize("20")).toBe(20);
    expect(parsePageSize("500")).toBe(100);
    expect(parsePageSize("0")).toBe(50);
    expect(parsePageSize("abc")).toBe(50);
  });

  it("offers a next cursor only after a full page", () => {
    const rows = [{ id, createdAt }];
    expect(adminPageOf(rows, 1).nextCursor).toBe(
      encodeAdminCursor(createdAt, id),
    );
    expect(adminPageOf(rows, 50).nextCursor).toBeNull();
    expect(adminPageOf([], 50).nextCursor).toBeNull();
  });
});

describe("teacher invitation input", () => {
  it("normalizes email and bounds the lifetime to 30 days", () => {
    expect(
      issueInvitationSchema.parse({
        email: " New.Teacher@Example.EDU ",
        expiresInDays: "7",
      }),
    ).toEqual({ email: "new.teacher@example.edu", expiresInDays: 7 });
    expect(
      issueInvitationSchema.safeParse({ email: "a@b.co", expiresInDays: 31 })
        .success,
    ).toBe(false);
  });
});
