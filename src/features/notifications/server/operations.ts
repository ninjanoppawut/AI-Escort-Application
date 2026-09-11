import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  buildNotificationDeepLink,
  decodeNotificationCursor,
  encodeNotificationCursor,
} from "../deep-link";
import {
  notificationApiError,
  httpStatusForNotificationError,
  mapPostgresNotificationError,
} from "../errors";
import {
  notificationTypeRegistry,
  type NotificationListQuery,
  type NotificationPage,
  type NotificationSummary,
  type NotificationType,
} from "../contracts";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export type NotificationOperationResult<T> =
  | { data: T; error?: never; status?: never }
  | {
      data?: never;
      error: ReturnType<typeof notificationApiError>;
      status: number;
    };

function failure(message?: string) {
  const code = mapPostgresNotificationError(message);
  return {
    error: notificationApiError(code),
    status: httpStatusForNotificationError(code),
  };
}

function toNotificationSummary(row: NotificationRow): NotificationSummary {
  const type = row.type as NotificationType;
  const registry = notificationTypeRegistry[type];
  return {
    id: row.id,
    type,
    layout: registry.layout,
    icon: registry.icon,
    copyKey: registry.copyKey,
    title: row.title,
    message: row.message,
    payload: row.payload,
    entityType: row.entity_type,
    entityId: row.entity_id,
    deepLink: buildNotificationDeepLink(row),
    readAt: row.read_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function listNotifications(
  supabase: SupabaseClient<Database>,
  query: NotificationListQuery,
): Promise<NotificationOperationResult<NotificationPage>> {
  const decodedCursor = decodeNotificationCursor(query.cursor);
  if (query.cursor && !decodedCursor) {
    return {
      error: notificationApiError("INVALID_CURSOR"),
      status: httpStatusForNotificationError("INVALID_CURSOR"),
    };
  }

  const requestedLimit = query.limit ?? 50;
  let listQuery = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(requestedLimit + 1);

  if (query.status === "unread") {
    listQuery = listQuery.is("read_at", null);
  }
  if (decodedCursor) {
    listQuery = listQuery.or(
      `created_at.lt.${decodedCursor.createdAt},and(created_at.eq.${decodedCursor.createdAt},id.lt.${decodedCursor.id})`,
    );
  }

  const unreadCountQuery = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  const [listResult, unreadCountResult] = await Promise.all([
    listQuery,
    unreadCountQuery,
  ]);

  if (listResult.error) return failure(listResult.error.message);
  if (unreadCountResult.error) return failure(unreadCountResult.error.message);

  const rows = (listResult.data ?? []) as NotificationRow[];
  const items = rows.slice(0, requestedLimit).map(toNotificationSummary);
  return {
    data: {
      items,
      unreadCount: unreadCountResult.count ?? 0,
      hasMore: rows.length > requestedLimit,
      nextCursor:
        rows.length > requestedLimit && items.at(-1)
          ? encodeNotificationCursor(items.at(-1)!)
          : null,
    },
  };
}

export async function markNotificationRead(
  supabase: SupabaseClient<Database>,
  notificationId: string,
): Promise<NotificationOperationResult<{ id: string; readAt: string }>> {
  const readAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: readAt })
    .eq("id", notificationId)
    .select("id,read_at")
    .maybeSingle();

  if (error) return failure(error.message);
  if (!data?.read_at) {
    return { error: notificationApiError("FORBIDDEN"), status: 404 };
  }
  return { data: { id: data.id, readAt: data.read_at } };
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient<Database>,
): Promise<
  NotificationOperationResult<{ updatedCount: number; readAt: string }>
> {
  const readAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: readAt })
    .is("read_at", null)
    .select("id");

  if (error) return failure(error.message);
  return { data: { updatedCount: data?.length ?? 0, readAt } };
}
