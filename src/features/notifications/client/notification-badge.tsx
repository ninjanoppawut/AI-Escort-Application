"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";

import type { ApiEnvelope } from "@/lib/http/envelope";
import { cn } from "@/lib/utils";

import type { NotificationPage } from "../contracts";
import { notificationQueryKeys } from "./realtime";

interface NotificationBadgeProps {
  initialUnreadCount: number;
}

async function fetchUnreadCount() {
  const response = await fetch("/api/notifications?status=unread&limit=1");
  const body = (await response.json()) as ApiEnvelope<NotificationPage>;
  if (!response.ok || body.error) throw body.error;
  return body.data.unreadCount;
}

export function NotificationBadge({
  initialUnreadCount,
}: NotificationBadgeProps) {
  const unreadQuery = useQuery({
    queryKey: notificationQueryKeys.list({ status: "unread", limit: 1 }),
    queryFn: fetchUnreadCount,
    initialData: initialUnreadCount,
  });
  const unreadCount = unreadQuery.data ?? 0;

  return (
    <Link
      className={cn(
        "border-border bg-card relative inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold",
        unreadCount > 0 && "border-emerald-300 bg-emerald-50",
      )}
      href="/notifications"
    >
      <Bell className="size-4" aria-hidden="true" />
      แจ้งเตือน
      {unreadCount > 0 ? (
        <span className="absolute -top-2 -right-2 grid min-w-6 place-items-center rounded-full bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
