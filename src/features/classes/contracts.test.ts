import { describe, expect, it } from "vitest";

import {
  createClassRequestSchema,
  classMemberListQuerySchema,
  issueClassInviteRequestSchema,
  joinClassRequestSchema,
  updateClassSettingsRequestSchema,
} from "./contracts";
import { mapPostgresClassError } from "./errors";
import { buildJoinUrl } from "./invite-url";

describe("P1-03 class contracts", () => {
  it("accepts the documented class creation payload and normalizes optional text", () => {
    const parsed = createClassRequestSchema.parse({
      schoolId: "10000000-0000-4000-8000-000000000301",
      name: "  Biology M4  ",
      subject: " Biology ",
      academicYear: "2569",
      semester: "1",
      description: "",
      groupSettings: {
        minimumSize: 3,
        maximumSize: 5,
        maximumGroups: 6,
        allowStudentGroups: true,
        formationStatus: "open",
      },
    });

    expect(parsed.name).toBe("Biology M4");
    expect(parsed.description).toBeNull();
    expect(parsed.groupSettings.maximumSize).toBe(5);
  });

  it("rejects invalid group limits and unknown browser-controlled fields", () => {
    expect(() =>
      createClassRequestSchema.parse({
        schoolId: "10000000-0000-4000-8000-000000000301",
        name: "Biology",
        createdBy: "00000000-0000-0000-0000-000000000301",
        groupSettings: {
          minimumSize: 5,
          maximumSize: 3,
          maximumGroups: 1,
          allowStudentGroups: true,
          formationStatus: "open",
        },
      }),
    ).toThrow();
  });

  it("validates settings and invite expiry/use limits at the server boundary", () => {
    expect(() =>
      updateClassSettingsRequestSchema.parse({
        minimumSize: 2,
        maximumSize: 4,
        maximumGroups: 0,
        allowStudentGroups: false,
        formationStatus: "closed",
      }),
    ).toThrow();

    expect(() =>
      issueClassInviteRequestSchema.parse({
        expiresAt: new Date(Date.now() - 10_000).toISOString(),
        maxUses: 1,
      }),
    ).toThrow();
  });

  it("maps stable database messages and builds canonical join URLs", () => {
    expect(mapPostgresClassError("CLASS_NOT_ACTIVE")).toBe("CLASS_NOT_ACTIVE");
    expect(mapPostgresClassError("INVITE_EXPIRED")).toBe("INVITE_EXPIRED");
    expect(mapPostgresClassError("unexpected")).toBe("FORBIDDEN");
    expect(buildJoinUrl("https://app.example.edu", "opaque/token")).toBe(
      "https://app.example.edu/join/opaque%2Ftoken",
    );
  });

  it("accepts either a class code or link token for student join, never both", () => {
    expect(joinClassRequestSchema.parse({ inviteCode: " bio4-a7k9 " })).toEqual(
      { inviteCode: "BIO4-A7K9" },
    );
    expect(
      joinClassRequestSchema.parse({ token: "opaque-link-token-123" }),
    ).toEqual({ token: "opaque-link-token-123" });
    expect(() =>
      joinClassRequestSchema.parse({
        inviteCode: "BIO4-A7K9",
        token: "opaque-link-token-123",
      }),
    ).toThrow();
  });

  it("validates member-list filters and cursor pagination caps", () => {
    expect(classMemberListQuerySchema.parse({})).toEqual({
      status: "active",
      limit: 50,
    });
    expect(
      classMemberListQuerySchema.parse({
        role: "student",
        status: "active",
        limit: "100",
        cursor: "opaque-cursor",
      }),
    ).toEqual({
      role: "student",
      status: "active",
      limit: 100,
      cursor: "opaque-cursor",
    });
    expect(() => classMemberListQuerySchema.parse({ role: "admin" })).toThrow();
    expect(() => classMemberListQuerySchema.parse({ limit: "101" })).toThrow();
  });
});
