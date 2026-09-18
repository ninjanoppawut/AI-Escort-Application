"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Flag,
  Loader2,
  Navigation,
  Pause,
  Plus,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  activityErrorCodeOf,
  fetchActivityJson,
  presentActivityError,
  sendActivityJson,
  type ActivityClientErrorCode,
} from "@/features/activities/client/request";
import {
  activityListSchema,
  activityQueryKeys,
} from "@/features/activities/contracts";
import type { ActivityUiErrorCode } from "@/features/activities/errors";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";

import {
  SESSION_STATUS_LABELS,
  SESSION_TITLE_MAX_LENGTH,
  sessionListSchema,
  sessionQueryKeys,
  type SessionList,
  type SessionStatus,
} from "../contracts";
import type { CreatedSession } from "../results";

const createFormSchema = z.object({
  activityId: z.uuid("เลือกกิจกรรมที่เผยแพร่แล้ว"),
  title: z
    .string()
    .trim()
    .min(1, "กรอกชื่อรอบสำรวจ")
    .max(
      SESSION_TITLE_MAX_LENGTH,
      `ชื่อรอบสำรวจยาวได้ไม่เกิน ${SESSION_TITLE_MAX_LENGTH} ตัวอักษร`,
    ),
  scheduledAt: z.string(),
});

type CreateFormInput = z.input<typeof createFormSchema>;
type CreateFormOutput = z.output<typeof createFormSchema>;

const STATUS_ICONS: Record<SessionStatus, typeof CalendarClock> = {
  scheduled: CalendarClock,
  open: Navigation,
  paused: Pause,
  completed: Flag,
};

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function TeacherSessionList({
  classId,
  initialSessions,
  initialErrorCode,
}: {
  classId: string;
  initialSessions: SessionList | null;
  initialErrorCode: ActivityUiErrorCode | null;
}) {
  const router = useRouter();
  const online = useOnlineStatus();

  const sessionsQuery = useQuery({
    queryKey: sessionQueryKeys.list(classId),
    queryFn: () =>
      fetchActivityJson(`/api/sessions?classId=${classId}`, sessionListSchema),
    ...(initialSessions ? { initialData: initialSessions } : {}),
    refetchOnWindowFocus: "always",
    retry: false,
  });

  const activitiesQuery = useQuery({
    queryKey: activityQueryKeys.list(classId),
    queryFn: () =>
      fetchActivityJson(
        `/api/activities?classId=${classId}`,
        activityListSchema,
      ),
    retry: false,
  });

  const form = useForm<CreateFormInput, unknown, CreateFormOutput>({
    resolver: zodResolver(createFormSchema),
    defaultValues: { activityId: "", title: "", scheduledAt: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateFormOutput) =>
      sendActivityJson<CreatedSession>("POST", "/api/sessions", {
        activityId: values.activityId,
        title: values.title,
        scheduledAt: values.scheduledAt
          ? new Date(values.scheduledAt).toISOString()
          : null,
      }),
    onSuccess: (result) =>
      router.push(`/teacher/classes/${classId}/sessions/${result.sessionId}`),
  });

  const sessions =
    sessionsQuery.data?.viewerRole === "teacher"
      ? sessionsQuery.data
      : undefined;
  const errorCode: ActivityClientErrorCode | null = sessionsQuery.error
    ? activityErrorCodeOf(sessionsQuery.error)
    : sessionsQuery.data && !sessions
      ? "FORBIDDEN"
      : !sessions
        ? initialErrorCode
        : null;
  const errorPresentation = errorCode ? presentActivityError(errorCode) : null;
  const createError = createMutation.error
    ? presentActivityError(activityErrorCodeOf(createMutation.error))
    : null;
  const publishedActivities = (activitiesQuery.data?.items ?? []).filter(
    (item) => item.publishedVersionNumber !== null,
  );

  return (
    <main className="bg-background min-h-dvh px-4 pt-5 pb-8 sm:px-8">
      <div className="mx-auto grid max-w-3xl gap-4">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับรายการชั้นเรียน"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href="/teacher/classes"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {sessions?.className ?? "ชั้นเรียน"}
            </p>
            <h1 className="text-2xl font-bold">รอบสำรวจ</h1>
          </div>
          <Link
            className="border-border bg-card ml-auto inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
            href={`/teacher/classes/${classId}/activities`}
          >
            กิจกรรม
          </Link>
        </header>

        {!online ? (
          <p
            className="flex items-center gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="size-5 shrink-0" />
            ออฟไลน์อยู่ · รายการอาจไม่เป็นปัจจุบัน
          </p>
        ) : null}

        {!sessions && errorPresentation ? (
          <section
            className="border-border bg-card rounded-xl border p-4"
            role="alert"
          >
            <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
            <h2 className="mt-2 font-semibold">{errorPresentation.title}</h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {errorPresentation.description}
            </p>
          </section>
        ) : null}

        {!sessions && !errorPresentation ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            กำลังโหลดรอบสำรวจ...
          </p>
        ) : null}

        {sessions ? (
          <>
            <form
              aria-labelledby="create-session-heading"
              className="border-border bg-card grid gap-2 rounded-xl border p-4"
              noValidate
              onSubmit={form.handleSubmit((values) =>
                createMutation.mutate(values),
              )}
            >
              <h2 className="font-semibold" id="create-session-heading">
                ตั้งรอบสำรวจใหม่
              </h2>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">
                  กิจกรรมที่เผยแพร่แล้ว
                </span>
                <select
                  aria-invalid={Boolean(form.formState.errors.activityId)}
                  className="border-border bg-background min-h-11 rounded-[10px] border px-3 text-base"
                  {...form.register("activityId")}
                >
                  <option value="">เลือกกิจกรรม</option>
                  {publishedActivities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.title} · ฉบับที่{" "}
                      {activity.publishedVersionNumber}
                    </option>
                  ))}
                </select>
              </label>
              {form.formState.errors.activityId ? (
                <p className="text-[13px] text-[#B3261E]" role="alert">
                  {form.formState.errors.activityId.message}
                </p>
              ) : null}
              {!publishedActivities.length ? (
                <p className="text-muted-foreground text-[13px]">
                  ยังไม่มีกิจกรรมที่เผยแพร่ ·{" "}
                  <Link
                    className="underline underline-offset-4"
                    href={`/teacher/classes/${classId}/activities`}
                  >
                    ไปเผยแพร่กิจกรรม
                  </Link>
                </p>
              ) : null}
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">ชื่อรอบสำรวจ</span>
                <input
                  aria-invalid={Boolean(form.formState.errors.title)}
                  autoComplete="off"
                  className="border-border bg-background min-h-11 rounded-[10px] border px-3 text-base"
                  maxLength={SESSION_TITLE_MAX_LENGTH}
                  {...form.register("title")}
                />
              </label>
              {form.formState.errors.title ? (
                <p className="text-[13px] text-[#B3261E]" role="alert">
                  {form.formState.errors.title.message}
                </p>
              ) : null}
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">
                  วันและเวลา (ไม่บังคับ)
                </span>
                <input
                  className="border-border bg-background min-h-11 rounded-[10px] border px-3 text-base"
                  type="datetime-local"
                  {...form.register("scheduledAt")}
                />
              </label>
              {createError ? (
                <p className="text-sm" role="alert">
                  <span className="font-semibold">{createError.title}</span>{" "}
                  {createError.description}
                </p>
              ) : null}
              <Button
                className="w-fit"
                disabled={createMutation.isPending || !online}
                type="submit"
              >
                {createMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Plus aria-hidden="true" className="size-4" />
                )}
                ตั้งรอบสำรวจ
              </Button>
              <p className="text-muted-foreground text-[13px]">
                ตั้งรอบไว้ก่อน แล้วจัดลำดับคิวกลุ่มก่อนเปิดรอบจริง
              </p>
            </form>

            <section aria-labelledby="sessions-heading" className="grid gap-3">
              <h2 className="text-lg font-semibold" id="sessions-heading">
                รอบสำรวจทั้งหมด ({sessions.items.length})
              </h2>
              {sessions.items.length ? (
                <ul className="grid gap-3">
                  {sessions.items.map((session) => {
                    const StatusIcon = STATUS_ICONS[session.status];
                    return (
                      <li
                        className="border-border bg-card rounded-xl border p-4"
                        key={session.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="min-w-0 font-semibold break-words">
                            <Link
                              className="underline-offset-4 hover:underline focus-visible:underline"
                              href={`/teacher/classes/${classId}/sessions/${session.id}`}
                            >
                              {session.title}
                            </Link>
                          </h3>
                          <span className="border-border bg-background inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[13px] font-medium">
                            <StatusIcon
                              aria-hidden="true"
                              className="size-3.5"
                            />
                            {SESSION_STATUS_LABELS[session.status]}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm break-words">
                          {session.activityTitle}
                        </p>
                        <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                          {session.scheduledAt ? (
                            <span>
                              นัดไว้ {formatDateTime(session.scheduledAt)}
                            </span>
                          ) : null}
                          {session.openedAt ? (
                            <span>
                              เปิดเมื่อ {formatDateTime(session.openedAt)}
                            </span>
                          ) : null}
                          <span>
                            {session.groupCount} กลุ่ม ·{" "}
                            {session.participantCount} คน
                          </span>
                        </p>
                        {session.status === "open" ||
                        session.status === "paused" ? (
                          <Link
                            aria-label={`ควบคุมรอบสด ${session.title}`}
                            className="bg-primary text-primary-foreground mt-3 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold"
                            href={`/teacher/classes/${classId}/sessions/${session.id}/live`}
                          >
                            <Navigation aria-hidden="true" className="size-4" />
                            ควบคุมรอบสด
                          </Link>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="border-border bg-card rounded-xl border p-4 text-sm leading-6">
                  ยังไม่มีรอบสำรวจ ตั้งรอบแรกจากกิจกรรมที่เผยแพร่แล้ว
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
