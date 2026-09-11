import { describe, expect, it } from "vitest";

import { API_ERROR_CODES } from "@/lib/http/error-code";

import { createStudentGroupRequestSchema } from "./contracts";
import {
  GROUP_CREATION_DENIAL_CODES,
  GROUP_ERROR_PRESENTATIONS,
  GROUP_UI_ERROR_CODES,
  groupApiError,
  httpStatusForGroupError,
  mapPostgresGroupError,
} from "./errors";

const classId = "20000000-0000-4000-8000-000000003201";

describe("P3-02 student group contracts", () => {
  it("accepts the documented payload and normalizes text", () => {
    const parsed = createStudentGroupRequestSchema.parse({
      classId,
      name: "  Green Explorers  ",
      description: "  ",
    });

    expect(parsed).toEqual({
      classId,
      name: "Green Explorers",
      description: null,
    });
  });

  it("rejects blank or oversized names and browser-controlled fields", () => {
    expect(
      createStudentGroupRequestSchema.safeParse({ classId, name: "   " })
        .success,
    ).toBe(false);
    expect(
      createStudentGroupRequestSchema.safeParse({
        classId,
        name: "x".repeat(121),
      }).success,
    ).toBe(false);
    expect(
      createStudentGroupRequestSchema.safeParse({
        classId,
        name: "Green Explorers",
        leaderId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
    expect(
      createStudentGroupRequestSchema.safeParse({
        classId: "not-a-uuid",
        name: "Green Explorers",
      }).success,
    ).toBe(false);
  });
});

describe("P3-02 group error mapping", () => {
  it("maps every group UI code to a stable API code with Thai presentation", () => {
    for (const code of GROUP_UI_ERROR_CODES) {
      expect(API_ERROR_CODES).toContain(code);
      expect(GROUP_ERROR_PRESENTATIONS[code].title).toMatch(/[฀-๿]/);
      expect(GROUP_ERROR_PRESENTATIONS[code].action).not.toBe("");
    }
  });

  it("treats every creation denial as a non-retryable state conflict", () => {
    for (const code of GROUP_CREATION_DENIAL_CODES) {
      expect(httpStatusForGroupError(code)).toBe(409);
      expect(groupApiError(code).retryable).toBe(false);
    }
    expect(GROUP_ERROR_PRESENTATIONS.GROUP_LIMIT_REACHED.title).toBe(
      "กลุ่มครบจำนวนแล้ว",
    );
  });

  it("maps Postgres messages to known codes and hides unknown failures", () => {
    expect(mapPostgresGroupError("class_not_active")).toBe("CLASS_NOT_ACTIVE");
    expect(mapPostgresGroupError("AUTH_REQUIRED")).toBe("AUTH_REQUIRED");
    expect(mapPostgresGroupError("permission denied for function")).toBe(
      "FORBIDDEN",
    );
    expect(httpStatusForGroupError("AUTH_REQUIRED")).toBe(401);
    expect(httpStatusForGroupError("FORBIDDEN")).toBe(403);
  });
});
