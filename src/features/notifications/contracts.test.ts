import { describe, expect, it } from "vitest";

import {
  notificationLayouts,
  notificationListQuerySchema,
  notificationTypeRegistry,
  notificationTypes,
  notificationTypeSchema,
} from "./contracts";

const expectedTypes = [
  "class_joined",
  "student_joined_class",
  "group_invitation_received",
  "group_invitation_accepted",
  "group_invitation_declined",
  "group_invitation_cancelled",
  "student_moved_group",
  "leadership_assigned",
  "leadership_transferred",
  "group_minimum_reached",
  "group_approval_requested",
  "group_approved",
  "group_locked",
  "group_unlocked",
  "group_archived",
  "group_deleted",
  "session_group_next",
  "session_group_active",
  "session_completed",
  "observation_submitted",
  "observation_resubmitted",
  "observation_revision_requested",
  "revision_access_requested",
  "revision_access_granted",
  "observation_verified",
  "observation_unable_to_verify",
  "observation_rejected",
  "same_species_warning",
  "observation_issue_reported",
  "location_session_warning",
  "export_ready",
] as const;

describe("notification contracts", () => {
  it("covers every registered notification type exactly once", () => {
    expect(notificationTypes).toEqual(expectedTypes);
    expect(new Set(notificationTypes).size).toBe(expectedTypes.length);
  });

  it("keeps layout, copy key, and deep-link metadata renderable", () => {
    for (const [type, config] of Object.entries(notificationTypeRegistry)) {
      expect(notificationLayouts).toContain(config.layout);
      expect(config.icon).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
      expect(config.copyKey).toBe(`notifications.${type}`);
      expect(config.deepLinkTemplate).toMatch(/^\//);
      expect(config.deepLinkTemplate).not.toContain("?");
    }
  });

  it("validates only approved notification types", () => {
    expect(notificationTypeSchema.parse("class_joined")).toBe("class_joined");
    expect(() => notificationTypeSchema.parse("unknown_type")).toThrow();
  });

  it("validates list filters and pagination caps", () => {
    expect(notificationListQuerySchema.parse({})).toEqual({
      status: "all",
      limit: 50,
    });
    expect(
      notificationListQuerySchema.parse({
        status: "unread",
        limit: "100",
        cursor: "opaque-cursor",
      }),
    ).toEqual({
      status: "unread",
      limit: 100,
      cursor: "opaque-cursor",
    });
    expect(() =>
      notificationListQuerySchema.parse({ status: "archived" }),
    ).toThrow();
    expect(() => notificationListQuerySchema.parse({ limit: "101" })).toThrow();
  });
});
