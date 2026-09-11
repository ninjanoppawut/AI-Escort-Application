import { describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

import {
  buildNotificationDeepLink,
  decodeNotificationCursor,
  encodeNotificationCursor,
} from "../deep-link";
import type { NotificationSummary } from "../contracts";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

const baseRow: NotificationRow = {
  activity_id: null,
  actor_id: null,
  class_id: "20000000-0000-4000-8000-000000000001",
  created_at: "2026-08-12T01:00:00.000Z",
  deep_link_path: null,
  entity_id: "20000000-0000-4000-8000-000000000001",
  entity_type: "class",
  expires_at: null,
  export_id: null,
  group_id: null,
  group_invitation_id: null,
  id: "50000000-0000-4000-8000-000000000001",
  message: "Joined class",
  observation_id: null,
  payload: {},
  read_at: null,
  recipient_id: "00000000-0000-4000-8000-000000000001",
  report_id: null,
  request_id: null,
  schema_version: 1,
  school_id: "10000000-0000-4000-8000-000000000001",
  session_id: null,
  title: "Joined",
  type: "class_joined",
};

describe("notification operations", () => {
  it("round-trips opaque notification cursors and rejects malformed values", () => {
    const cursor = encodeNotificationCursor({
      id: baseRow.id,
      type: "class_joined",
      layout: "membership",
      icon: "School",
      copyKey: "notifications.class_joined",
      title: baseRow.title,
      message: baseRow.message,
      payload: baseRow.payload,
      entityType: baseRow.entity_type,
      entityId: baseRow.entity_id,
      deepLink: "/classes/20000000-0000-4000-8000-000000000001",
      readAt: null,
      createdAt: baseRow.created_at,
      expiresAt: null,
    } satisfies NotificationSummary);

    expect(decodeNotificationCursor(cursor)).toEqual({
      createdAt: baseRow.created_at,
      id: baseRow.id,
    });
    expect(decodeNotificationCursor("not-json")).toBeNull();
  });

  it("builds deep links from registry templates and relational IDs", () => {
    expect(buildNotificationDeepLink(baseRow)).toBe(
      "/classes/20000000-0000-4000-8000-000000000001",
    );
    expect(
      buildNotificationDeepLink({
        ...baseRow,
        class_id: null,
        payload: { classId: "20000000-0000-4000-8000-000000000002" },
      }),
    ).toBe("/classes/20000000-0000-4000-8000-000000000002");
  });

  it("returns null when a registered deep link cannot be safely resolved", () => {
    expect(
      buildNotificationDeepLink({
        ...baseRow,
        class_id: null,
        payload: {},
      }),
    ).toBeNull();
    expect(
      buildNotificationDeepLink({ ...baseRow, type: "missing" }),
    ).toBeNull();
  });
});
