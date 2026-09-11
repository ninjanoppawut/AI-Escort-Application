import type { Database, Json } from "@/lib/supabase/database.types";

import {
  notificationTypeRegistry,
  type NotificationSummary,
} from "./contracts";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

interface NotificationCursor {
  createdAt: string;
  id: string;
}

export function encodeNotificationCursor(item: NotificationSummary) {
  const payload: NotificationCursor = {
    createdAt: item.createdAt,
    id: item.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeNotificationCursor(
  cursor?: string,
): NotificationCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<NotificationCursor>;
    if (
      typeof parsed.createdAt !== "string" ||
      Number.isNaN(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parsed.id,
      )
    ) {
      return null;
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function isJsonObject(value: Json): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadString(payload: Json, key: string) {
  if (!isJsonObject(payload)) return null;
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function placeholderValue(row: NotificationRow, placeholder: string) {
  const directValues: Record<string, string | null> = {
    classId: row.class_id,
    groupId: row.group_id,
    invitationId: row.group_invitation_id,
    activityId: row.activity_id,
    sessionId: row.session_id,
    observationId: row.observation_id,
    requestId: row.request_id,
    reportId: row.report_id,
    exportId: row.export_id,
  };

  return directValues[placeholder] ?? payloadString(row.payload, placeholder);
}

export function buildNotificationDeepLink(row: NotificationRow) {
  const registry =
    notificationTypeRegistry[row.type as keyof typeof notificationTypeRegistry];
  if (!registry) return null;

  const placeholders = registry.deepLinkTemplate.match(/\{[A-Za-z]+}/g) ?? [];
  let path = registry.deepLinkTemplate as string;
  for (const token of placeholders) {
    const placeholder = token.slice(1, -1);
    const value = placeholderValue(row, placeholder);
    if (!value) return null;
    path = path.replace(token, encodeURIComponent(value));
  }

  return path;
}
