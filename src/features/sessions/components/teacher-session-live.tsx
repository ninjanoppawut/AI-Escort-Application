"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Crown,
  Flag,
  History,
  Loader2,
  LocateFixed,
  MapPinOff,
  Pause,
  Play,
  ShieldAlert,
  TriangleAlert,
  UserRound,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  activityErrorCodeOf,
  activityErrorDetailsOf,
  fetchActivityJson,
  presentActivityError,
  sendActivityJson,
  type ActivityClientErrorCode,
} from "@/features/activities/client/request";
import {
  SchematicPreview,
  type SchematicMarker,
} from "@/features/activities/components/schematic-preview";
import type { ActivityUiErrorCode } from "@/features/activities/errors";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import { cn } from "@/lib/utils";

import {
  SESSION_STATUS_LABELS,
  sessionLiveSchema,
  sessionQueryKeys,
  type SessionLive,
} from "../contracts";
import { useTeacherLiveLocations } from "../live-location/client/use-teacher-live-locations";
import { liveLocationQueryKeys } from "../live-location/contracts";
import {
  ACTIVATION_BLOCK_REASONS,
  accuracyLabel,
  activationBlock,
  currentQueueEntry,
  isPositionStale,
  liveLocationRows,
  nextQueueEntry,
  positionAgeLabel,
  positionAgeMs,
  type LiveLocationRow,
  type LiveQueueEntry,
} from "../live-view";
import type {
  ActivatedSessionGroup,
  CompletedSession,
  CompletedSessionGroup,
  SessionPauseResult,
  SessionResumeResult,
} from "../results";
import { formatClockTime, SessionFreshness } from "./session-freshness";
import { SessionGroupStatusBadge } from "./session-group-status-badge";

type ControlAction =
  | { kind: "activate"; groupId: string; groupName: string }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "complete-group"; groupId: string; groupName: string }
  | { kind: "complete-session" };

type ControlResult =
  | ActivatedSessionGroup
  | SessionPauseResult
  | SessionResumeResult
  | CompletedSessionGroup
  | CompletedSession;

function controlUrl(sessionId: string, action: ControlAction) {
  switch (action.kind) {
    case "activate":
      return `/api/sessions/${sessionId}/activate-group`;
    case "pause":
      return `/api/sessions/${sessionId}/pause`;
    case "resume":
      return `/api/sessions/${sessionId}/resume`;
    case "complete-group":
      return `/api/sessions/${sessionId}/groups/${action.groupId}/complete`;
    case "complete-session":
      return `/api/sessions/${sessionId}/complete`;
  }
}

function successNotice(
  action: ControlAction,
  result: ControlResult,
  live: SessionLive | undefined,
) {
  switch (action.kind) {
    case "activate":
      return `${action.groupName} เริ่มสำรวจแล้ว`;
    case "pause":
      return "พักรอบแล้ว · นักเรียนหยุดส่งตำแหน่ง";
    case "resume":
      return "เปิดรอบต่อแล้ว";
    case "complete-group": {
      const nextId =
        "nextReadyGroupId" in result ? result.nextReadyGroupId : null;
      const next = nextId
        ? live?.queue.find((entry) => entry.groupId === nextId)
        : null;
      return next
        ? `${action.groupName} สำรวจเสร็จแล้ว · กลุ่มถัดไป: ${next.groupName}`
        : `${action.groupName} สำรวจเสร็จแล้ว`;
    }
    case "complete-session":
      return "จบรอบสำรวจแล้ว · ทุกคนหยุดส่งตำแหน่ง";
  }
}

const CONTROL_REASON_COPY: Record<string, string> = {
  group_completed: "กลุ่มนี้สำรวจเสร็จแล้ว เปิดใหม่ในรอบนี้ไม่ได้",
  group_not_in_session: "กลุ่มนี้ไม่อยู่ในรอบสำรวจนี้",
};

/** Cause and way out for a refused or failed control, after a refetch. */
export function controlErrorMessage(
  error: unknown,
  live: SessionLive | undefined,
) {
  const code = activityErrorCodeOf(error);
  const details = activityErrorDetailsOf(error);
  if (code === "NETWORK") {
    return {
      title: "เชื่อมต่อไม่สำเร็จ",
      description: "ยังไม่มีการเปลี่ยนแปลงสถานะ ตรวจสอบสัญญาณแล้วลองอีกครั้ง",
    };
  }
  const presentation = presentActivityError(code);
  if (code === "ACTIVE_GROUP_CONFLICT") {
    const active = live?.queue.find(
      (entry) => entry.groupId === details.activeGroupId,
    );
    return {
      title: presentation.title,
      description: `${active ? active.groupName : "อีกกลุ่มหนึ่ง"} กำลังสำรวจอยู่ ดึงสถานะล่าสุดแล้ว · จบกลุ่มนั้นก่อนจึงเปิดกลุ่มใหม่ได้`,
    };
  }
  if (code === "SESSION_PAUSED") {
    return {
      title: presentation.title,
      description: "รอบสำรวจพักอยู่ เปิดรอบต่อก่อนจึงเปิดกลุ่มได้",
    };
  }
  if (code === "INVALID_STATUS_TRANSITION") {
    const reason =
      typeof details.reason === "string"
        ? CONTROL_REASON_COPY[details.reason]
        : undefined;
    return {
      title: presentation.title,
      description: reason
        ? `${reason} · ดึงสถานะล่าสุดแล้ว`
        : "สถานะรอบเปลี่ยนไปแล้ว ดึงสถานะล่าสุดแล้ว ตรวจอีกครั้งก่อนสั่งใหม่",
    };
  }
  return { title: presentation.title, description: presentation.description };
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function activeParticipantCount(entry: LiveQueueEntry) {
  return entry.participants.filter(
    (participant) => participant.participationStatus === "active",
  ).length;
}

export function TeacherSessionLive({
  classId,
  sessionId,
  initialLive,
  initialErrorCode,
}: {
  classId: string;
  sessionId: string;
  initialLive: SessionLive | null;
  initialErrorCode: ActivityUiErrorCode | null;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [confirming, setConfirming] = useState<
    "complete-group" | "complete-session" | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);

  const liveQuery = useQuery({
    queryKey: sessionQueryKeys.live(sessionId),
    queryFn: () =>
      fetchActivityJson(
        `/api/sessions/${sessionId}/group-queue`,
        sessionLiveSchema,
      ),
    ...(initialLive ? { initialData: initialLive } : {}),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const refetchQueue = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: sessionQueryKeys.live(sessionId),
    });
  }, [queryClient, sessionId]);

  const locations = useTeacherLiveLocations(sessionId, {
    onSignal: refetchQueue,
  });

  const control = useMutation({
    mutationFn: async (action: ControlAction) => ({
      action,
      result: await sendActivityJson<ControlResult>(
        "POST",
        controlUrl(sessionId, action),
        action.kind === "activate" ? { groupId: action.groupId } : {},
      ),
    }),
    onMutate: () => setNotice(null),
    onSuccess: ({ action, result }) => {
      setConfirming(null);
      setNotice(successNotice(action, result, liveQuery.data));
    },
    onError: () => setConfirming(null),
    // Refetch after every verdict: a refusal means the screen was stale.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: liveLocationQueryKeys.all }),
      ]),
  });

  const live = liveQuery.data;
  const errorCode: ActivityClientErrorCode | null = liveQuery.error
    ? activityErrorCodeOf(liveQuery.error)
    : !live
      ? initialErrorCode
      : null;

  if (!live || errorCode === "FORBIDDEN" || errorCode === "AUTH_REQUIRED") {
    const presentation =
      errorCode === "NETWORK"
        ? {
            title: "โหลดรอบสำรวจไม่สำเร็จ",
            description: "ตรวจสอบสัญญาณแล้วลองอีกครั้ง",
          }
        : errorCode
          ? presentActivityError(errorCode)
          : null;
    return (
      <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
        <div className="mx-auto grid max-w-3xl gap-4">
          {presentation ? (
            <section
              className="border-border bg-card rounded-xl border p-4"
              role="alert"
            >
              <ShieldAlert
                aria-hidden="true"
                className="size-6 text-[#B3261E]"
              />
              <h1 className="mt-2 font-semibold">{presentation.title}</h1>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                {presentation.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {errorCode === "NETWORK" ? (
                  <Button
                    disabled={liveQuery.isFetching}
                    onClick={() => void liveQuery.refetch()}
                    variant="outline"
                  >
                    ลองใหม่
                  </Button>
                ) : null}
                <Link
                  className="border-border bg-background inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
                  href="/teacher/classes"
                >
                  กลับรายการชั้นเรียน
                </Link>
              </div>
            </section>
          ) : (
            <p className="flex items-center gap-2 text-sm" role="status">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              กำลังโหลดรอบสำรวจสด...
            </p>
          )}
        </div>
      </main>
    );
  }

  const current = currentQueueEntry(live);
  const next = nextQueueEntry(live);
  const block = activationBlock(live, { online, pending: control.isPending });
  const blockReason = block ? ACTIVATION_BLOCK_REASONS[block] : null;
  const running =
    live.session.status === "open" || live.session.status === "paused";
  const controlsDisabled = !online || control.isPending;
  const controlError = control.error
    ? controlErrorMessage(control.error, live)
    : null;
  const remainingGroups = live.queue.filter(
    (entry) => entry.status !== "completed",
  ).length;

  return (
    <main className="bg-background min-h-dvh px-4 pt-5 pb-8 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-4">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับหน้ารอบสำรวจ"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={`/teacher/classes/${classId}/sessions/${sessionId}`}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {live.className} · {live.activity.title}
            </p>
            <h1 className="text-2xl font-bold">รอบสำรวจสด</h1>
          </div>
        </header>

        <section className="border-border bg-card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border p-3">
          <div className="min-w-0">
            <p className="font-semibold break-words">{live.session.title}</p>
            <p className="text-muted-foreground text-[13px]">
              {SESSION_STATUS_LABELS[live.session.status]} · สำรวจแล้ว{" "}
              {live.counts.completedGroups}/{live.counts.groups} กลุ่ม ·
              นักเรียน {live.counts.participants} คน
            </p>
          </div>
          <SessionFreshness
            isFetching={liveQuery.isFetching}
            realtime={locations.realtime}
            refreshedAt={live.refreshedAt}
          />
        </section>

        {!online ? (
          <p
            className="flex items-center gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="size-5 shrink-0" />
            ออฟไลน์อยู่ · สั่งงานรอบสำรวจได้เมื่อกลับมาออนไลน์
            สถานะอาจไม่เป็นปัจจุบัน
          </p>
        ) : null}

        {liveQuery.isError ? (
          <section
            className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
            role="alert"
          >
            <span>อัปเดตไม่สำเร็จ · กำลังแสดงสถานะล่าสุดที่โหลดได้</span>
            <Button
              disabled={liveQuery.isFetching}
              onClick={() => void liveQuery.refetch()}
              size="default"
              variant="outline"
            >
              ลองใหม่
            </Button>
          </section>
        ) : null}

        {notice ? (
          <p
            className="border-success/30 bg-success/10 flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold"
            role="status"
          >
            <CheckCircle2
              aria-hidden="true"
              className="text-success size-5 shrink-0"
            />
            {notice}
          </p>
        ) : null}

        {controlError ? (
          <section
            className="flex items-start gap-3 rounded-xl border border-[#F2C2BE] bg-[#FDF0EF] p-3 text-sm text-[#7A1C15]"
            role="alert"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0"
            />
            <div>
              <p className="font-semibold">{controlError.title}</p>
              <p className="mt-0.5 leading-6">{controlError.description}</p>
            </div>
          </section>
        ) : null}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid content-start gap-4">
            <section
              aria-labelledby="current-group-heading"
              className="border-border bg-card grid gap-3 rounded-xl border p-4"
            >
              <h2 className="font-semibold" id="current-group-heading">
                กลุ่มที่กำลังสำรวจ
              </h2>

              {live.session.status === "scheduled" ? (
                <div className="grid gap-2 text-sm">
                  <p>ยังไม่เปิดรอบ · จัดลำดับคิวและเปิดรอบจากหน้าตั้งค่าก่อน</p>
                  <Link
                    className="bg-primary text-primary-foreground inline-flex min-h-11 w-fit items-center rounded-full px-5 font-semibold"
                    href={`/teacher/classes/${classId}/sessions/${sessionId}`}
                  >
                    ไปตั้งค่ารอบ
                  </Link>
                </div>
              ) : null}

              {live.session.status === "completed" ? (
                <p className="flex items-center gap-2 text-sm">
                  <Flag aria-hidden="true" className="size-4 shrink-0" />
                  รอบสำรวจนี้จบแล้ว · สำรวจครบ {
                    live.counts.completedGroups
                  }{" "}
                  กลุ่ม
                </p>
              ) : null}

              {running && current ? (
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold break-words">
                      {current.groupName}
                    </span>
                    <SessionGroupStatusBadge status={current.status} />
                  </div>
                  <p className="text-muted-foreground text-[13px]">
                    คิวที่ {current.queuePosition} ·{" "}
                    {activeParticipantCount(current)} คน
                    {current.activatedAt ? (
                      <span suppressHydrationWarning>
                        {" "}
                        · เริ่ม {formatClockTime(current.activatedAt)}
                      </span>
                    ) : null}
                  </p>
                </div>
              ) : null}

              {running && !current ? (
                <p className="text-muted-foreground text-sm">
                  ยังไม่มีกลุ่มที่กำลังสำรวจ
                  {next ? ` · กลุ่มถัดไป: ${next.groupName}` : ""}
                </p>
              ) : null}

              {running ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {live.session.status === "open" ? (
                    <Button
                      disabled={
                        !live.allowedActions.canPause || controlsDisabled
                      }
                      onClick={() => control.mutate({ kind: "pause" })}
                      variant="outline"
                    >
                      <Pause aria-hidden="true" className="size-4" />
                      พักรอบ
                    </Button>
                  ) : (
                    <Button
                      disabled={
                        !live.allowedActions.canResume || controlsDisabled
                      }
                      onClick={() => control.mutate({ kind: "resume" })}
                    >
                      <Play aria-hidden="true" className="size-4" />
                      เปิดรอบต่อ
                    </Button>
                  )}
                  {current ? (
                    <Button
                      disabled={
                        !live.allowedActions.canComplete || controlsDisabled
                      }
                      onClick={() => {
                        control.reset();
                        setConfirming("complete-group");
                      }}
                      variant="outline"
                    >
                      <Flag aria-hidden="true" className="size-4" />
                      จบกลุ่มนี้
                    </Button>
                  ) : null}
                  {!current || current.status !== "active" ? (
                    <Button
                      aria-describedby="activation-reason"
                      className="disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:border disabled:opacity-100 sm:col-span-2"
                      disabled={block !== null || !next}
                      onClick={() =>
                        next
                          ? control.mutate({
                              kind: "activate",
                              groupId: next.groupId,
                              groupName: next.groupName,
                            })
                          : undefined
                      }
                    >
                      {control.isPending &&
                      control.variables?.kind === "activate" ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <Play aria-hidden="true" className="size-4" />
                      )}
                      เปิดกลุ่มถัดไป
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {running ? (
                <p
                  className="text-muted-foreground text-[13px] leading-5"
                  id="activation-reason"
                >
                  {blockReason ?? `พร้อมเปิด: ${next?.groupName ?? "-"}`}
                  {" · "}สำรวจได้ทีละกลุ่ม · “พักรอบ” กลับมาต่อได้ “จบกลุ่มนี้”
                  ย้อนกลับไม่ได้
                </p>
              ) : null}

              {confirming === "complete-group" && current ? (
                <section
                  aria-labelledby="complete-group-title"
                  className="rounded-xl border border-[#F2C2BE] bg-[#FDF0EF] p-4 text-[#3D0E0A]"
                  role="alertdialog"
                >
                  <p className="font-semibold" id="complete-group-title">
                    จบการสำรวจของ {current.groupName}?
                  </p>
                  <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm leading-6">
                    <li>
                      ย้อนกลับไม่ได้ — เปิดกลุ่มนี้ใหม่ในรอบสำรวจนี้ไม่ได้อีก
                    </li>
                    <li>
                      นักเรียน {activeParticipantCount(current)}{" "}
                      คนออกจากโหมดสนามและหยุดส่งตำแหน่งทันที
                    </li>
                    <li>รอบสำรวจยังไม่จบ กลุ่มถัดไปยังเปิดได้ตามคิว</li>
                    <li>ถ้าแค่อยากหยุดชั่วคราว ใช้ “พักรอบ” แทน</li>
                  </ul>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      disabled={control.isPending}
                      onClick={() => setConfirming(null)}
                      variant="outline"
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      className="bg-[#B3261E] text-white hover:bg-[#8F1E18]"
                      disabled={controlsDisabled}
                      onClick={() =>
                        control.mutate({
                          kind: "complete-group",
                          groupId: current.groupId,
                          groupName: current.groupName,
                        })
                      }
                    >
                      {control.isPending ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : null}
                      จบกลุ่มนี้
                    </Button>
                  </div>
                </section>
              ) : null}
            </section>

            <QueuePanel
              block={block}
              controlsPending={control.isPending}
              live={live}
              onActivate={(entry) =>
                control.mutate({
                  kind: "activate",
                  groupId: entry.groupId,
                  groupName: entry.groupName,
                })
              }
            />

            {running ? (
              <section
                aria-labelledby="complete-session-heading"
                className="border-border bg-card grid gap-2 rounded-xl border p-4"
              >
                <h2 className="font-semibold" id="complete-session-heading">
                  จบรอบสำรวจ
                </h2>
                <p className="text-muted-foreground text-[13px] leading-5">
                  ครูเป็นคนจบรอบเอง ระบบไม่จบให้อัตโนมัติ
                </p>
                {confirming === "complete-session" ? (
                  <section
                    aria-labelledby="complete-session-title"
                    className="rounded-xl border border-[#F2C2BE] bg-[#FDF0EF] p-4 text-[#3D0E0A]"
                    role="alertdialog"
                  >
                    <p className="font-semibold" id="complete-session-title">
                      จบรอบสำรวจ {live.session.title}?
                    </p>
                    <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm leading-6">
                      <li>ย้อนกลับไม่ได้ — เปิดรอบนี้ต่อไม่ได้อีก</li>
                      <li>
                        กลุ่มที่ยังไม่เสร็จ {remainingGroups}{" "}
                        กลุ่มจะถูกปิดทั้งหมด
                      </li>
                      <li>นักเรียนทุกคนหยุดส่งตำแหน่งทันที</li>
                    </ul>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        disabled={control.isPending}
                        onClick={() => setConfirming(null)}
                        variant="outline"
                      >
                        ยกเลิก
                      </Button>
                      <Button
                        className="bg-[#B3261E] text-white hover:bg-[#8F1E18]"
                        disabled={controlsDisabled}
                        onClick={() =>
                          control.mutate({ kind: "complete-session" })
                        }
                      >
                        {control.isPending ? (
                          <Loader2
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : null}
                        จบรอบสำรวจ
                      </Button>
                    </div>
                  </section>
                ) : (
                  <Button
                    className="w-full"
                    disabled={
                      !live.allowedActions.canComplete || controlsDisabled
                    }
                    onClick={() => {
                      control.reset();
                      setConfirming("complete-session");
                    }}
                    variant="outline"
                  >
                    <Flag aria-hidden="true" className="size-4" />
                    จบรอบสำรวจ
                  </Button>
                )}
              </section>
            ) : null}
          </div>

          <LiveLocationPanel
            live={live}
            locations={locations}
            onRetry={() =>
              void queryClient.invalidateQueries({
                queryKey: liveLocationQueryKeys.session(sessionId),
              })
            }
          />
        </div>
      </div>
    </main>
  );
}

function QueuePanel({
  live,
  block,
  controlsPending,
  onActivate,
}: {
  live: SessionLive;
  block: ReturnType<typeof activationBlock>;
  controlsPending: boolean;
  onActivate: (entry: LiveQueueEntry) => void;
}) {
  const ordered = [...live.queue].sort(
    (a, b) => a.queuePosition - b.queuePosition,
  );
  const running =
    live.session.status === "open" || live.session.status === "paused";
  return (
    <section aria-labelledby="queue-heading" className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold" id="queue-heading">
          คิวกลุ่ม ({ordered.length})
        </h2>
        <span className="text-muted-foreground text-[13px]">
          สำรวจได้ทีละกลุ่ม
        </span>
      </div>
      {ordered.length ? (
        <ol className="border-border bg-card divide-border divide-y rounded-xl border">
          {ordered.map((entry) => {
            const startable =
              entry.status === "waiting" || entry.status === "ready";
            return (
              <li
                aria-label={`คิวที่ ${entry.queuePosition} ${entry.groupName}`}
                className={cn(
                  "flex flex-wrap items-center gap-3 p-3",
                  (entry.status === "active" || entry.status === "paused") &&
                    "bg-secondary/60",
                )}
                data-status={entry.status}
                key={entry.sessionGroupId}
              >
                <span
                  aria-hidden="true"
                  className="border-border bg-background grid size-7 shrink-0 place-items-center rounded-full border text-[13px] font-bold"
                >
                  {entry.queuePosition}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-words">
                    {entry.groupName}
                  </span>
                  <span className="text-muted-foreground block text-[13px]">
                    {activeParticipantCount(entry)} คน
                  </span>
                </span>
                <SessionGroupStatusBadge status={entry.status} />
                {running && startable ? (
                  <Button
                    aria-describedby={block ? "activation-reason" : undefined}
                    aria-label={`เปิดกลุ่ม ${entry.groupName}`}
                    disabled={block !== null || controlsPending}
                    onClick={() => onActivate(entry)}
                    size="default"
                    variant="outline"
                  >
                    <Play aria-hidden="true" className="size-4" />
                    เปิดกลุ่มนี้
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="border-border bg-card rounded-xl border p-4 text-sm">
          ยังไม่มีคิวกลุ่ม · คิวจะถูกบันทึกเมื่อเปิดรอบ
        </p>
      )}
    </section>
  );
}

function shortLabel(name: string) {
  const trimmed = name.trim();
  return trimmed.length > 12 ? `${trimmed.slice(0, 11)}…` : trimmed;
}

function LiveLocationPanel({
  live,
  locations,
  onRetry,
}: {
  live: SessionLive;
  locations: ReturnType<typeof useTeacherLiveLocations>;
  onRetry: () => void;
}) {
  const now = useNow(1_000);
  const rows = liveLocationRows(locations.snapshot, locations.positions);
  const activeGroup = locations.snapshot?.activeGroupId
    ? live.queue.find(
        (entry) => entry.groupId === locations.snapshot?.activeGroupId,
      )
    : null;
  const markers: SchematicMarker[] = [];
  rows.forEach((row, index) => {
    if (!row.position) return;
    markers.push({
      id: row.userId,
      number: index + 1,
      label: shortLabel(row.displayName),
      lat: row.position.lat,
      lng: row.position.lng,
      stale: isPositionStale(row.position.recordedAt, now),
    });
  });

  let state: string | null = null;
  if (live.session.status === "completed") {
    state = "รอบสำรวจจบแล้ว · ไม่แสดงตำแหน่ง";
  } else if (live.session.status === "scheduled") {
    state = "ยังไม่เปิดรอบ · ตำแหน่งจะแสดงเมื่อกลุ่มเริ่มสำรวจ";
  } else if (live.session.status === "paused") {
    state = "พักรอบอยู่ · นักเรียนหยุดส่งตำแหน่ง และไม่แสดงตำแหน่งล่าสุด";
  } else if (locations.snapshot && !locations.snapshot.activeGroupId) {
    state = "ยังไม่มีกลุ่มที่กำลังสำรวจ · ตำแหน่งจะแสดงเมื่อเปิดกลุ่ม";
  }

  return (
    <section
      aria-labelledby="live-locations-heading"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold" id="live-locations-heading">
          ตำแหน่งนักเรียน (สด)
        </h2>
        {activeGroup && locations.snapshot?.publishing ? (
          <span className="text-muted-foreground text-[13px]">
            {activeGroup.groupName} · {rows.length} คน
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-[13px] leading-5">
        เห็นเฉพาะครูของชั้นเรียน · แผนที่จริงยังไม่พร้อม
        จึงแสดงภาพร่างพิกัดและรายชื่อแทน
      </p>

      <SchematicPreview
        boundary={live.geometry.boundary}
        checkpoints={live.geometry.checkpoints}
        className="mx-auto max-w-[520px]"
        markers={markers}
        route={live.geometry.route}
      />

      {state ? (
        <p
          className="border-border bg-background rounded-lg border p-3 text-sm"
          role="status"
        >
          {state}
        </p>
      ) : null}

      {!state && locations.error ? (
        <div
          className="border-border bg-background flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          role="alert"
        >
          <span>โหลดตำแหน่งไม่สำเร็จ · รายชื่อด้านล่างอาจไม่ครบ</span>
          <Button onClick={onRetry} variant="outline">
            ลองใหม่
          </Button>
        </div>
      ) : null}

      {!state && !locations.snapshot && !locations.error ? (
        <p className="flex items-center gap-2 text-sm" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          กำลังโหลดตำแหน่ง...
        </p>
      ) : null}

      {!state && rows.length ? (
        <ol aria-label="รายชื่อตำแหน่งนักเรียน" className="grid gap-2">
          {rows.map((row, index) => (
            <LiveLocationListItem
              index={index}
              key={row.userId}
              now={now}
              row={row}
            />
          ))}
        </ol>
      ) : null}
      <p className="text-muted-foreground text-[12px]">
        ตำแหน่งที่ไม่อัปเดตเกิน 30 วินาทีแสดงเป็นเส้นประและป้าย “ตำแหน่งเก่า”
      </p>
    </section>
  );
}

function LiveLocationListItem({
  row,
  index,
  now,
}: {
  row: LiveLocationRow;
  index: number;
  now: number;
}) {
  const stale = row.position
    ? isPositionStale(row.position.recordedAt, now)
    : false;
  return (
    <li
      className="border-border flex flex-wrap items-center gap-3 rounded-lg border p-3"
      data-stale={stale ? "true" : "false"}
      data-user-id={row.userId}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold",
          !row.position
            ? "border-border text-muted-foreground border border-dotted"
            : stale
              ? "border-2 border-dashed border-[#5E6D64] bg-white text-[#16211C]"
              : "border-2 border-white bg-[#1E7A45] text-white ring-2 ring-[#1E7A45]",
        )}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 font-semibold break-words">
          {row.roleAtStart === "leader" ? (
            <Crown aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <UserRound aria-hidden="true" className="size-4 shrink-0" />
          )}
          {row.displayName}
          {row.roleAtStart === "leader" ? (
            <span className="text-muted-foreground text-[13px] font-normal">
              หัวหน้ากลุ่ม
            </span>
          ) : null}
        </span>
        {row.position ? (
          <span className="text-muted-foreground block text-[13px]">
            <span className="font-mono">
              {accuracyLabel(row.position.accuracyM)}
            </span>{" "}
            · {positionAgeLabel(positionAgeMs(row.position.recordedAt, now))}
          </span>
        ) : (
          <span className="text-muted-foreground block text-[13px]">
            ยังไม่ได้รับตำแหน่ง
          </span>
        )}
      </span>
      {!row.position ? (
        <span className="border-border text-muted-foreground inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[13px]">
          <MapPinOff aria-hidden="true" className="size-3.5" />
          ยังไม่มีตำแหน่ง
        </span>
      ) : stale ? (
        <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-[#5E6D64] px-2.5 text-[13px] font-medium text-[#3F4A44]">
          <History aria-hidden="true" className="size-3.5" />
          ตำแหน่งเก่า
        </span>
      ) : (
        <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-[#B5DCC2] bg-[#E8F5EC] px-2.5 text-[13px] font-medium text-[#14532D]">
          <LocateFixed aria-hidden="true" className="size-3.5" />
          สด
        </span>
      )}
    </li>
  );
}
