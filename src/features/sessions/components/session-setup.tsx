"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Crown,
  Loader2,
  ShieldAlert,
  TriangleAlert,
  UserRound,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  activityErrorCodeOf,
  activityErrorDetailsOf,
  fetchActivityJson,
  presentActivityError,
  sendActivityJson,
  type ActivityClientErrorCode,
} from "@/features/activities/client/request";
import type { ActivityUiErrorCode } from "@/features/activities/errors";
import { GroupStatusBadge } from "@/features/groups/components/group-status-badge";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import { cn } from "@/lib/utils";

import {
  SESSION_STATUS_LABELS,
  eligibleGroupsKey,
  moveQueueItem,
  sessionQueryKeys,
  sessionReadiness,
  sessionSetupSchema,
  type SessionSetup as SessionSetupModel,
} from "../contracts";
import type { OpenedSession } from "../results";
import { SessionGroupStatusBadge } from "./session-group-status-badge";

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SessionSetup({
  classId,
  sessionId,
  initialSetup,
  initialErrorCode,
}: {
  classId: string;
  sessionId: string;
  initialSetup: SessionSetupModel | null;
  initialErrorCode: ActivityUiErrorCode | null;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [queueState, setQueueState] = useState<{
    key: string;
    order: string[];
  } | null>(null);

  const setupQuery = useQuery({
    queryKey: sessionQueryKeys.setup(sessionId),
    queryFn: () =>
      fetchActivityJson(`/api/sessions/${sessionId}`, sessionSetupSchema),
    ...(initialSetup ? { initialData: initialSetup } : {}),
    // Eligible groups change as students join or move; opening revalidates them.
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const openMutation = useMutation({
    mutationFn: (groupOrder: string[]) =>
      sendActivityJson<OpenedSession>(
        "POST",
        `/api/sessions/${sessionId}/open`,
        {
          groupOrder,
        },
      ),
    onSuccess: (result) => {
      setConfirming(false);
      setNotice(
        `เปิดรอบสำรวจแล้ว · บันทึก ${result.groupCount} กลุ่ม นักเรียน ${result.participantCount} คน`,
      );
    },
    onError: (error) => {
      setConfirming(false);
      if (activityErrorDetailsOf(error).reason === "queue_mismatch") {
        setQueueState(null);
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all }),
  });

  const setup = setupQuery.data;
  const errorCode: ActivityClientErrorCode | null = setupQuery.error
    ? activityErrorCodeOf(setupQuery.error)
    : !setup
      ? initialErrorCode
      : null;

  if (!setup) {
    const presentation = errorCode ? presentActivityError(errorCode) : null;
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
              <Link
                className="border-border bg-background mt-3 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
                href="/teacher/classes"
              >
                กลับรายการชั้นเรียน
              </Link>
            </section>
          ) : (
            <p className="flex items-center gap-2 text-sm" role="status">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              กำลังโหลดรอบสำรวจ...
            </p>
          )}
        </div>
      </main>
    );
  }

  const key = eligibleGroupsKey(setup);
  const defaultOrder = setup.eligibleGroups.map((group) => group.id);
  const order = queueState?.key === key ? queueState.order : defaultOrder;
  const queueChanged = queueState !== null && queueState.key !== key;
  const groupsById = new Map(
    setup.eligibleGroups.map((group) => [group.id, group]),
  );
  const readiness = sessionReadiness(setup);
  const ready = readiness.every((item) => item.done);
  const scheduled = setup.session.status === "scheduled";
  const participantTotal = setup.eligibleGroups.reduce(
    (total, group) => total + group.memberCount,
    0,
  );
  const openError = openMutation.error;
  const openErrorDetails = activityErrorDetailsOf(openError);

  return (
    <main className="bg-background min-h-dvh px-4 pt-5 pb-8 sm:px-8">
      <div className="mx-auto grid max-w-3xl gap-4">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับรายการรอบสำรวจ"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={`/teacher/classes/${classId}/sessions`}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {setup.className}
            </p>
            <h1 className="text-2xl font-bold">
              {scheduled ? "ตั้งค่ารอบสำรวจ" : "รายชื่อผู้เข้าร่วมรอบสำรวจ"}
            </h1>
          </div>
        </header>

        {!online ? (
          <p
            className="flex items-center gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="size-5 shrink-0" />
            ออฟไลน์อยู่ · เปิดรอบได้เมื่อกลับมาออนไลน์
          </p>
        ) : null}

        <section className="border-border bg-card rounded-xl border p-4">
          <p className="text-muted-foreground text-[12px]">รอบสำรวจ</p>
          <p className="font-semibold break-words">{setup.session.title}</p>
          <p className="text-muted-foreground mt-2 text-[12px]">กิจกรรม</p>
          <p className="font-medium break-words">
            {setup.activity.title} · ฉบับที่ {setup.activity.versionNumber}
          </p>
          <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 font-mono text-[13px]">
            <span>{SESSION_STATUS_LABELS[setup.session.status]}</span>
            {setup.session.scheduledAt ? (
              <span>นัดไว้ {formatDateTime(setup.session.scheduledAt)}</span>
            ) : null}
            {setup.session.openedAt ? (
              <span>เปิดเมื่อ {formatDateTime(setup.session.openedAt)}</span>
            ) : null}
          </p>
        </section>

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

        {openError ? (
          <section
            className="border-border bg-card rounded-xl border p-3 text-sm"
            role="alert"
          >
            <p className="font-semibold">
              {openErrorDetails.reason === "queue_mismatch"
                ? "กลุ่มเปลี่ยนไประหว่างตั้งค่า"
                : presentActivityError(activityErrorCodeOf(openError)).title}
            </p>
            <p className="text-muted-foreground mt-1 leading-6">
              {openErrorDetails.reason === "queue_mismatch"
                ? "มีนักเรียนเข้าหรือออกจากกลุ่ม ตรวจลำดับคิวล่าสุดแล้วเปิดรอบอีกครั้ง ยังไม่มีการบันทึกรายชื่อ"
                : openErrorDetails.reason === "no_groups"
                  ? "ยังไม่มีกลุ่มที่มีสมาชิก จัดกลุ่มก่อนเปิดรอบ"
                  : presentActivityError(activityErrorCodeOf(openError))
                      .description}
            </p>
          </section>
        ) : null}

        {scheduled ? (
          <>
            {queueChanged ? (
              <p
                className="flex items-start gap-2 rounded-xl border border-[#BFD0F5] bg-[#EEF3FF] p-3 text-sm text-[#1E3A8A]"
                role="status"
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                กลุ่มที่พร้อมเปลี่ยนไป ลำดับคิวถูกตั้งใหม่
                ตรวจอีกครั้งก่อนเปิดรอบ
              </p>
            ) : null}

            <section aria-labelledby="queue-heading" className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold" id="queue-heading">
                  ลำดับคิวกลุ่ม
                </h2>
                <span className="text-muted-foreground text-[13px]">
                  เปิดสำรวจได้ทีละกลุ่ม
                </span>
              </div>
              <ol className="border-border bg-card divide-border divide-y rounded-xl border">
                {order.map((groupId, index) => {
                  const group = groupsById.get(groupId);
                  if (!group) return null;
                  return (
                    <li className="flex items-center gap-3 p-3" key={group.id}>
                      <span
                        aria-hidden="true"
                        className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold break-words">
                          {group.name}
                        </span>
                        <span className="text-muted-foreground block text-[13px]">
                          {group.memberCount} คน · หัวหน้า{" "}
                          {group.leaderName ?? "ยังไม่มี"}
                        </span>
                      </span>
                      <GroupStatusBadge status={group.status} />
                      <span className="flex gap-1">
                        <Button
                          aria-label={`เลื่อน ${group.name} ขึ้น`}
                          disabled={index === 0 || openMutation.isPending}
                          onClick={() =>
                            setQueueState({
                              key,
                              order: moveQueueItem(order, index, -1),
                            })
                          }
                          size="sm"
                          variant="outline"
                        >
                          <ChevronUp aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          aria-label={`เลื่อน ${group.name} ลง`}
                          disabled={
                            index === order.length - 1 || openMutation.isPending
                          }
                          onClick={() =>
                            setQueueState({
                              key,
                              order: moveQueueItem(order, index, 1),
                            })
                          }
                          size="sm"
                          variant="outline"
                        >
                          <ChevronDown aria-hidden="true" className="size-4" />
                        </Button>
                      </span>
                    </li>
                  );
                })}
                {setup.excludedGroups.map((group) => (
                  <li
                    className="text-muted-foreground flex items-center gap-3 p-3"
                    key={group.id}
                  >
                    <span
                      aria-hidden="true"
                      className="border-border grid size-7 shrink-0 place-items-center rounded-full border text-[13px]"
                    >
                      ✕
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold break-words">
                        {group.name}
                      </span>
                      <span className="block text-[13px] text-[#B3261E]">
                        ไม่มีสมาชิก — เข้าร่วมไม่ได้
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              {!order.length && !setup.excludedGroups.length ? (
                <p className="text-muted-foreground text-sm">
                  ยังไม่มีกลุ่มในชั้นเรียนนี้
                </p>
              ) : null}
              {setup.unassignedStudentCount ? (
                <p className="text-muted-foreground text-[13px]">
                  นักเรียนที่ยังไม่มีกลุ่ม {setup.unassignedStudentCount}{" "}
                  คนจะไม่อยู่ในรอบนี้
                </p>
              ) : null}
            </section>

            <section className="rounded-xl border border-[#E5C88A] bg-[#FDF7EC] p-4 text-[#6B3E05]">
              <p className="flex items-center gap-2 font-semibold">
                <TriangleAlert aria-hidden="true" className="size-4" />
                เมื่อเปิดรอบ ระบบจะบันทึกรายชื่อสมาชิกไว้
              </p>
              <p className="mt-1 text-sm leading-6">
                การย้ายกลุ่มหลังจากนี้จะมีผลกับรอบถัดไปเท่านั้น
                และไม่เปลี่ยนประวัติของรอบนี้
              </p>
            </section>

            <section
              aria-labelledby="readiness-heading"
              className="border-border bg-card rounded-xl border p-4"
            >
              <h2 className="font-semibold" id="readiness-heading">
                ความพร้อม
              </h2>
              <ul className="mt-2 grid gap-1.5 text-sm">
                {readiness.map((item) => (
                  <li className="flex items-center gap-2" key={item.key}>
                    {item.done ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="text-success size-4"
                      />
                    ) : (
                      <CircleDashed
                        aria-hidden="true"
                        className="text-muted-foreground size-4"
                      />
                    )}
                    <span>{item.label}</span>
                    {!item.done &&
                    item.key === "running" &&
                    setup.runningSession ? (
                      <Link
                        className="underline underline-offset-4"
                        href={`/teacher/classes/${classId}/sessions/${setup.runningSession.id}`}
                      >
                        ดูรอบที่เปิดอยู่
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            {confirming ? (
              <section
                aria-labelledby="open-confirm-title"
                className="border-border bg-card rounded-xl border p-4"
                role="alertdialog"
              >
                <p className="font-semibold" id="open-confirm-title">
                  เปิดรอบสำรวจ {setup.session.title}?
                </p>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  บันทึก {order.length} กลุ่ม นักเรียน {participantTotal} คน
                  ตามลำดับคิวนี้
                  {setup.excludedGroups.length
                    ? ` · กลุ่มว่าง ${setup.excludedGroups.length} กลุ่มไม่ถูกรวม`
                    : ""}
                  {setup.unassignedStudentCount
                    ? ` · นักเรียนที่ยังไม่มีกลุ่ม ${setup.unassignedStudentCount} คนไม่อยู่ในรอบนี้`
                    : ""}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    disabled={openMutation.isPending}
                    onClick={() => setConfirming(false)}
                    variant="outline"
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    disabled={openMutation.isPending || !online}
                    onClick={() => {
                      setNotice(null);
                      openMutation.mutate(order);
                    }}
                  >
                    {openMutation.isPending ? (
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : null}
                    เปิดรอบสำรวจ
                  </Button>
                </div>
              </section>
            ) : (
              <div>
                <Button
                  aria-describedby="open-reason"
                  className="disabled:bg-muted disabled:text-muted-foreground disabled:border-border w-full disabled:border disabled:opacity-100"
                  disabled={!ready || !online || setupQuery.isFetching}
                  onClick={() => {
                    openMutation.reset();
                    setConfirming(true);
                  }}
                  size="lg"
                >
                  เปิดรอบสำรวจ
                </Button>
                <p
                  className="text-muted-foreground mt-2 text-[13px]"
                  id="open-reason"
                >
                  {!ready
                    ? "ยังขาดข้อมูลในรายการความพร้อม"
                    : !online
                      ? "เปิดรอบไม่ได้ขณะออฟไลน์"
                      : "ตรวจลำดับคิวแล้วยืนยันเพื่อบันทึกรายชื่อ"}
                </p>
              </div>
            )}
          </>
        ) : (
          <section aria-labelledby="roster-heading" className="grid gap-3">
            <div>
              <h2 className="font-semibold" id="roster-heading">
                คิวกลุ่มและผู้เข้าร่วม ({setup.participantCount} คน)
              </h2>
              <p className="text-muted-foreground mt-1 text-[13px] leading-5">
                รายชื่อนี้บันทึกไว้ตอนเปิดรอบ
                การย้ายกลุ่มหลังจากนี้มีผลกับรอบถัดไปเท่านั้น
              </p>
            </div>
            <ol className="grid gap-3">
              {setup.queue.map((entry) => (
                <li
                  aria-labelledby={`queue-${entry.sessionGroupId}`}
                  className="border-border bg-card rounded-xl border p-4"
                  key={entry.sessionGroupId}
                  role="region"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3
                      className="font-semibold break-words"
                      id={`queue-${entry.sessionGroupId}`}
                    >
                      {entry.queuePosition}. {entry.groupName}
                    </h3>
                    <SessionGroupStatusBadge status={entry.status} />
                  </div>
                  <ul className="mt-2 grid gap-1 text-sm">
                    {entry.participants.map((participant) => (
                      <li
                        className={cn(
                          "flex items-center gap-2",
                          participant.participationStatus !== "active" &&
                            "text-muted-foreground",
                        )}
                        key={participant.userId}
                      >
                        {participant.roleAtStart === "leader" ? (
                          <Crown
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                        ) : (
                          <UserRound
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                        )}
                        <span className="break-words">
                          {participant.displayName}
                        </span>
                        {participant.roleAtStart === "leader" ? (
                          <span className="text-muted-foreground text-[13px]">
                            หัวหน้ากลุ่ม
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
