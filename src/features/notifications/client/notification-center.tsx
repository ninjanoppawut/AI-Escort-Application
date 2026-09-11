"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  ArrowRightLeft,
  BadgeCheck,
  Ban,
  Bell,
  BookOpen,
  CheckCheck,
  CircleHelp,
  ClipboardClock,
  Copy,
  Crown,
  Download,
  ExternalLink,
  Flag,
  FlagTriangleRight,
  ListStart,
  LockKeyhole,
  LockOpen,
  MailPlus,
  MailX,
  MessageSquarePlus,
  Navigation,
  RefreshCw,
  RotateCcw,
  School,
  Send,
  Trash2,
  TriangleAlert,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ApiEnvelope } from "@/lib/http/envelope";
import { cn } from "@/lib/utils";

import {
  type NotificationLayout,
  type NotificationPage,
  type NotificationSummary,
} from "../contracts";
import { notificationQueryKeys } from "./realtime";

const iconMap = {
  Archive,
  ArrowRightLeft,
  BadgeCheck,
  Ban,
  CircleHelp,
  ClipboardClock,
  Copy,
  Crown,
  Download,
  Flag,
  FlagTriangleRight,
  ListStart,
  LockKeyhole,
  LockOpen,
  MailPlus,
  MailX,
  MapPinWarning: TriangleAlert,
  MessageSquarePlus,
  Navigation,
  RefreshCw,
  RotateCcw,
  School,
  Send,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} satisfies Record<string, LucideIcon>;

const layoutTone = {
  invitation: "border-sky-200 bg-sky-50 text-sky-950",
  membership: "border-emerald-200 bg-emerald-50 text-emerald-950",
  group_status: "border-lime-200 bg-lime-50 text-lime-950",
  session_status: "border-blue-200 bg-blue-50 text-blue-950",
  observation_status: "border-amber-200 bg-amber-50 text-amber-950",
  request: "border-violet-200 bg-violet-50 text-violet-950",
  warning: "border-red-200 bg-red-50 text-red-950",
  export: "border-slate-300 bg-slate-50 text-slate-950",
} satisfies Record<NotificationLayout, string>;

const layoutLabel = {
  invitation: "คำเชิญ",
  membership: "สมาชิก",
  group_status: "สถานะกลุ่ม",
  session_status: "รอบกิจกรรม",
  observation_status: "รายการพืช",
  request: "ต้องดำเนินการ",
  warning: "คำเตือน",
  export: "ส่งออกข้อมูล",
} satisfies Record<NotificationLayout, string>;

const layoutAction = {
  invitation: "เปิดคำเชิญ",
  membership: "ดูรายละเอียด",
  group_status: "เปิดกลุ่ม",
  session_status: "เปิดกิจกรรม",
  observation_status: "เปิดรายการพืช",
  request: "เปิดคำขอ",
  warning: "ตรวจสอบ",
  export: "เปิดไฟล์",
} satisfies Record<NotificationLayout, string>;

type StatusFilter = "all" | "unread";

interface NotificationCenterProps {
  initialPage: NotificationPage;
}

async function readEnvelope<T>(response: Response) {
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || body.error) {
    throw (
      body.error ?? {
        code: "FORBIDDEN",
        message: "Forbidden",
        retryable: false,
        details: {},
      }
    );
  }
  return body.data;
}

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isPastExpiry(value: string | null) {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

function notificationUrl(filter: StatusFilter, cursor?: string | null) {
  const params = new URLSearchParams({
    status: filter,
    limit: "20",
  });
  if (cursor) params.set("cursor", cursor);
  return `/api/notifications?${params.toString()}`;
}

function notificationStateTitle(error: unknown) {
  if (!navigator.onLine) return "ออฟไลน์อยู่";
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code?: unknown }).code);
    if (code === "AUTH_REQUIRED") return "กรุณาเข้าสู่ระบบ";
    if (code === "ACCOUNT_DISABLED") return "บัญชีนี้ใช้งานไม่ได้";
    if (code === "INVALID_CURSOR") return "หน้ารายการไม่ถูกต้อง";
    if (code === "FORBIDDEN") return "ไม่มีสิทธิ์ดูการแจ้งเตือนนี้";
  }
  return "โหลดการแจ้งเตือนไม่สำเร็จ";
}

function NotificationRow({ item }: { item: NotificationSummary }) {
  const Icon = iconMap[item.icon as keyof typeof iconMap] ?? Bell;
  const read = Boolean(item.readAt);
  const unavailable = !item.deepLink || isPastExpiry(item.expiresAt);

  return (
    <div
      className={cn(
        "border-border bg-card grid gap-3 border-b p-4 sm:grid-cols-[auto_1fr_auto]",
        !read && "bg-secondary/50",
      )}
    >
      <div
        className={cn(
          "grid size-11 place-items-center rounded-lg border",
          layoutTone[item.layout],
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold",
              layoutTone[item.layout],
            )}
          >
            {layoutLabel[item.layout]}
          </span>
          {!read ? (
            <span className="inline-flex items-center rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-900">
              ยังไม่ได้อ่าน
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">อ่านแล้ว</span>
          )}
          {unavailable ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950">
              <TriangleAlert className="size-3" aria-hidden="true" />
              ปลายทางอาจไม่พร้อม
            </span>
          ) : null}
        </div>
        <p className="mt-2 font-semibold break-words">{item.title}</p>
        <p className="text-muted-foreground mt-1 text-sm break-words">
          {item.message}
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          {formatNotificationTime(item.createdAt)}
        </p>
      </div>
      <div className="flex items-center sm:justify-end">
        {item.deepLink ? (
          <Link
            className="border-border bg-background inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold"
            href={item.deepLink}
          >
            {layoutAction[item.layout]}
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-muted-foreground inline-flex min-h-10 items-center rounded-full border px-4 text-sm">
            ปลายทางถูกลบหรือหมดอายุ
          </span>
        )}
      </div>
    </div>
  );
}

export function NotificationCenter({ initialPage }: NotificationCenterProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationSummary[]>(initialPage.items);

  const queryKey = useMemo(
    () => notificationQueryKeys.list({ status: filter, cursor }),
    [cursor, filter],
  );

  const notificationsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const page = await readEnvelope<NotificationPage>(
        await fetch(notificationUrl(filter, cursor)),
      );
      setItems((current) =>
        cursor ? [...current, ...page.items] : page.items,
      );
      return page;
    },
    initialData: filter === "all" && !cursor ? initialPage : undefined,
  });

  const markOne = useMutation({
    mutationFn: async (id: string) =>
      readEnvelope<{ id: string; readAt: string }>(
        await fetch(`/api/notifications/${id}/read`, { method: "POST" }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.all,
      });
    },
  });

  const markAll = useMutation({
    mutationFn: async () =>
      readEnvelope<{ updatedCount: number; readAt: string }>(
        await fetch("/api/notifications/read-all", { method: "POST" }),
      ),
    onSuccess: async () => {
      setCursor(null);
      await queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.all,
      });
    },
  });

  const currentPage = notificationsQuery.data;
  const visibleItems = items.length ? items : (currentPage?.items ?? []);
  const unreadCount = currentPage?.unreadCount ?? initialPage.unreadCount;
  const hasMore = currentPage?.hasMore ?? false;
  const nextCursor = currentPage?.nextCursor ?? null;
  const isEmpty = !visibleItems.length && !notificationsQuery.isLoading;

  function changeFilter(nextFilter: StatusFilter) {
    setFilter(nextFilter);
    setCursor(null);
    setItems([]);
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Link
            className="text-muted-foreground inline-flex items-center gap-2 text-sm font-semibold"
            href="/app"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            กลับหน้าหลัก
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            การแจ้งเตือน
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {unreadCount > 0
              ? `มี ${unreadCount} รายการที่ยังไม่ได้อ่าน`
              : "ไม่มีรายการที่ยังไม่ได้อ่าน"}
          </p>
        </div>
        <Button
          disabled={!unreadCount || markAll.isPending}
          onClick={() => markAll.mutate()}
          variant="outline"
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          อ่านทั้งหมด
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          aria-pressed={filter === "all"}
          onClick={() => changeFilter("all")}
          variant={filter === "all" ? "default" : "outline"}
        >
          ทั้งหมด
        </Button>
        <Button
          aria-pressed={filter === "unread"}
          onClick={() => changeFilter("unread")}
          variant={filter === "unread" ? "default" : "outline"}
        >
          ยังไม่ได้อ่าน
        </Button>
      </div>

      {notificationsQuery.isFetching && !notificationsQuery.isLoading ? (
        <div className="border-border bg-card flex items-center gap-2 rounded-lg border p-3 text-sm">
          <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
          กำลังตรวจข้อมูลล่าสุด
        </div>
      ) : null}

      {notificationsQuery.isLoading ? (
        <div className="border-border bg-card rounded-lg border p-5">
          กำลังโหลดการแจ้งเตือน...
        </div>
      ) : null}

      {notificationsQuery.error ? (
        <div className="border-border bg-card rounded-lg border p-5">
          <TriangleAlert className="mb-2 size-5 text-red-700" />
          <p className="font-semibold">
            {notificationStateTitle(notificationsQuery.error)}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            ข้อมูลเดิมจะยังคงอยู่ถ้ามีอยู่แล้ว ลองโหลดใหม่เมื่อพร้อม
          </p>
          <Button
            className="mt-4"
            onClick={() => notificationsQuery.refetch()}
            variant="outline"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            โหลดใหม่
          </Button>
        </div>
      ) : null}

      {isEmpty ? (
        <div className="border-border bg-card rounded-lg border p-6">
          <Bell className="text-muted-foreground mb-3 size-8" />
          <p className="font-semibold">
            {filter === "unread"
              ? "ไม่มีรายการที่ยังไม่ได้อ่าน"
              : "ยังไม่มีการแจ้งเตือน"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            เมื่อมีคำเชิญ คำขอ หรือผลการตรวจ
            ระบบจะแสดงไว้ที่นี่และเก็บไว้หลังเปิดแอปใหม่
          </p>
        </div>
      ) : null}

      {visibleItems.length ? (
        <div className="border-border overflow-hidden rounded-lg border">
          <ul>
            {visibleItems.map((item) => (
              <li className="relative" key={item.id}>
                <NotificationRow item={item} />
                {!item.readAt ? (
                  <button
                    className="text-muted-foreground absolute right-3 bottom-3 text-xs font-semibold underline-offset-4 hover:underline disabled:opacity-50"
                    disabled={markOne.isPending}
                    onClick={() => markOne.mutate(item.id)}
                    type="button"
                  >
                    ทำเครื่องหมายว่าอ่านแล้ว
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasMore ? (
        <Button
          className="justify-self-start"
          disabled={notificationsQuery.isFetching}
          onClick={() => setCursor(nextCursor)}
          variant="outline"
        >
          <BookOpen className="size-4" aria-hidden="true" />
          โหลดเพิ่มเติม
        </Button>
      ) : null}
    </section>
  );
}
