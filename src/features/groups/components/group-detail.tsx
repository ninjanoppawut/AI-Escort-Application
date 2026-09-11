"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Crown,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  UserRound,
  UsersRound,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { groupQueryKeys, invitationTimeLeftLabel } from "../board";
import { useClassGroupRealtime } from "../client/realtime";
import {
  fetchGroupJson,
  groupErrorCodeOf,
  postGroupJson,
  presentGroupError,
  type GroupClientErrorCode,
} from "../client/request";
import { useOnlineStatus } from "../client/use-online-status";
import type { GroupUiErrorCode } from "../errors";
import {
  eligibleClassmatesSchema,
  groupDetailSchema,
  invitationQueryKeys,
  type EligibleClassmates,
  type GroupDetail,
  type SendGroupInvitationResult,
} from "../invitations";
import { GroupStatusBadge } from "./group-status-badge";

const CANNOT_INVITE_MESSAGES: Record<
  NonNullable<EligibleClassmates["cannotInviteReason"]>,
  string
> = {
  GROUP_FULL:
    "ที่นั่งเต็มแล้ว (รวมคำเชิญที่รอตอบรับ) ยกเลิกคำเชิญที่ค้างอยู่ก่อนชวนเพิ่ม",
  GROUP_LOCKED: "กลุ่มถูกล็อกแล้ว ชวนสมาชิกเพิ่มไม่ได้",
  GROUP_FORMATION_CLOSED: "ครูปิดการจัดกลุ่มแล้ว ชวนสมาชิกเพิ่มไม่ได้",
  DESTINATION_GROUP_INVALID: "กลุ่มนี้ถูกเก็บถาวรแล้ว",
};

type CandidateFilter = "eligible" | "in_group" | "pending";

function ErrorPanel({
  code,
  classId,
  onRetry,
}: {
  code: GroupClientErrorCode;
  classId: string;
  onRetry: () => void;
}) {
  const presentation = presentGroupError(code);
  const leave =
    code === "FORBIDDEN" ||
    code === "CLASS_NOT_ACTIVE" ||
    code === "DESTINATION_GROUP_INVALID";

  return (
    <section
      className="border-border bg-card rounded-xl border p-4"
      role="alert"
    >
      <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
      <h2 className="mt-2 font-semibold">{presentation.title}</h2>
      <p className="text-muted-foreground mt-1 text-sm leading-6">
        {presentation.description}
      </p>
      <div className="mt-3">
        {leave ? (
          <Link
            className="border-border bg-background inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
            href={
              code === "CLASS_NOT_ACTIVE"
                ? "/app"
                : `/classes/${classId}/groups`
            }
          >
            {code === "CLASS_NOT_ACTIVE"
              ? "กลับรายการชั้นเรียน"
              : "กลับหน้ากลุ่ม"}
          </Link>
        ) : (
          <Button onClick={onRetry} variant="outline">
            <RefreshCw aria-hidden="true" className="size-4" />
            ลองใหม่
          </Button>
        )}
      </div>
    </section>
  );
}

function InvitePanel({
  groupId,
  online,
  onClose,
}: {
  groupId: string;
  online: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<CandidateFilter>("eligible");
  const [search, setSearch] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);

  const candidatesQuery = useQuery({
    queryKey: invitationQueryKeys.candidates(groupId),
    queryFn: () =>
      fetchGroupJson(
        `/api/groups/${groupId}/eligible-classmates`,
        eligibleClassmatesSchema,
      ),
    refetchOnWindowFocus: "always",
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: (classmate: { id: string; displayName: string }) =>
      postGroupJson<SendGroupInvitationResult>(
        `/api/groups/${groupId}/invitations`,
        { inviteeId: classmate.id },
      ),
    onSuccess: (_result, classmate) => setLastSent(classmate.displayName),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: groupQueryKeys.all }),
  });

  const candidates = candidatesQuery.data;
  const counts = useMemo(() => {
    const result = { eligible: 0, in_group: 0, pending: 0 };
    for (const classmate of candidates?.classmates ?? []) {
      result[classmate.state] += 1;
    }
    return result;
  }, [candidates]);

  const visible = (candidates?.classmates ?? []).filter(
    (classmate) =>
      classmate.state === filter &&
      classmate.displayName.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const sendErrorCode = sendMutation.error
    ? groupErrorCodeOf(sendMutation.error)
    : null;
  const filterLabels: Record<CandidateFilter, string> = {
    eligible: `ชวนได้ (${counts.eligible})`,
    in_group: `อยู่กลุ่มอื่นแล้ว (${counts.in_group})`,
    pending: `รอตอบรับ (${counts.pending})`,
  };

  return (
    <section
      aria-labelledby="invite-heading"
      className="border-border bg-card rounded-xl border p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold" id="invite-heading">
            ชวนเพื่อนร่วมชั้น
          </h2>
          {candidates ? (
            <p className="text-muted-foreground mt-0.5 text-sm">
              ว่าง {candidates.availableSeats} ที่
            </p>
          ) : null}
        </div>
        <Button onClick={onClose} size="sm" variant="ghost">
          ปิด
        </Button>
      </div>

      <p className="text-muted-foreground mt-2 text-[13px] leading-5">
        เพื่อนต้องกดตอบรับเอง — คุณเพิ่มเข้ากลุ่มโดยตรงไม่ได้
      </p>

      {candidatesQuery.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          กำลังโหลดรายชื่อ...
        </p>
      ) : null}

      {candidatesQuery.error ? (
        <div className="mt-3 text-sm" role="alert">
          <p className="font-semibold">
            {presentGroupError(groupErrorCodeOf(candidatesQuery.error)).title}
          </p>
          <Button
            className="mt-2"
            onClick={() => void candidatesQuery.refetch()}
            size="sm"
            variant="outline"
          >
            ลองใหม่
          </Button>
        </div>
      ) : null}

      {candidates && !candidates.canInvite && candidates.cannotInviteReason ? (
        <p
          className="border-border bg-background mt-3 flex items-start gap-2 rounded-lg border p-3 text-[13px] leading-5"
          role="status"
        >
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {CANNOT_INVITE_MESSAGES[candidates.cannotInviteReason]}
        </p>
      ) : null}

      {lastSent && !sendMutation.isPending && !sendErrorCode ? (
        <p
          className="border-success/30 bg-success/10 mt-3 flex items-center gap-2 rounded-lg border p-3 text-sm"
          role="status"
        >
          <CheckCircle2 aria-hidden="true" className="text-success size-4" />
          ส่งคำเชิญถึง {lastSent} แล้ว
        </p>
      ) : null}

      {sendErrorCode ? (
        <p
          className="border-border bg-background mt-3 rounded-lg border p-3 text-sm"
          role="alert"
        >
          <span className="font-semibold">
            {presentGroupError(sendErrorCode).title}
          </span>{" "}
          {presentGroupError(sendErrorCode).description}
        </p>
      ) : null}

      {candidates ? (
        <>
          <label className="mt-3 grid gap-1.5">
            <span className="text-sm font-medium">ค้นหาชื่อ</span>
            <input
              className="border-border bg-background min-h-11 rounded-[10px] border px-3 text-base"
              onChange={(event) => setSearch(event.target.value)}
              type="search"
              value={search}
            />
          </label>
          <div
            aria-label="กรองรายชื่อ"
            className="mt-3 flex flex-wrap gap-2"
            role="group"
          >
            {(Object.keys(filterLabels) as CandidateFilter[]).map((key) => (
              <button
                aria-pressed={filter === key}
                className={cn(
                  "min-h-11 rounded-full border px-3 text-[13px] font-medium",
                  filter === key
                    ? "border-primary bg-secondary text-secondary-foreground"
                    : "border-border bg-background",
                )}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {filterLabels[key]}
              </button>
            ))}
          </div>
          {visible.length ? (
            <ul className="divide-border mt-2 divide-y">
              {visible.map((classmate) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                  key={classmate.id}
                >
                  <div className="min-w-0">
                    <p className="font-medium break-words">
                      {classmate.displayName}
                    </p>
                    <p className="text-muted-foreground text-[13px]">
                      {classmate.state === "eligible"
                        ? "ยังไม่มีกลุ่ม"
                        : classmate.state === "pending"
                          ? `รอตอบรับ · ${
                              classmate.expiresAt
                                ? invitationTimeLeftLabel(
                                    classmate.expiresAt,
                                    candidates.refreshedAt,
                                  )
                                : ""
                            }`
                          : `อยู่ใน ${classmate.groupName ?? "กลุ่มอื่น"} แล้ว — เชิญไม่ได้`}
                    </p>
                  </div>
                  {classmate.state === "eligible" ? (
                    <Button
                      aria-label={`ชวน ${classmate.displayName}`}
                      disabled={
                        !candidates.canInvite ||
                        !online ||
                        sendMutation.isPending
                      }
                      onClick={() => sendMutation.mutate(classmate)}
                      size="sm"
                    >
                      {sendMutation.isPending &&
                      sendMutation.variables?.id === classmate.id ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <Plus aria-hidden="true" className="size-4" />
                      )}
                      ชวน
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">
              ไม่มีรายชื่อในกลุ่มนี้
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}

interface GroupDetailScreenProps {
  classId: string;
  groupId: string;
  initialDetail: GroupDetail | null;
  initialErrorCode: GroupUiErrorCode | null;
}

export function GroupDetailScreen({
  classId,
  groupId,
  initialDetail,
  initialErrorCode,
}: GroupDetailScreenProps) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const realtime = useClassGroupRealtime(classId);
  const [inviteOpen, setInviteOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: invitationQueryKeys.groupDetail(groupId),
    queryFn: () =>
      fetchGroupJson(
        `/api/classes/${classId}/groups/${groupId}`,
        groupDetailSchema,
      ),
    ...(initialDetail ? { initialData: initialDetail } : {}),
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const cancelMutation = useMutation({
    mutationFn: (invitationId: string) =>
      postGroupJson(`/api/group-invitations/${invitationId}/cancel`),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: groupQueryKeys.all }),
  });

  const detail = detailQuery.data;
  const errorCode: GroupClientErrorCode | null = detailQuery.error
    ? groupErrorCodeOf(detailQuery.error)
    : !detail
      ? initialErrorCode
      : null;
  const canManage =
    Boolean(detail?.viewer.isLeader) &&
    detail?.status !== "locked" &&
    detail?.status !== "archived";
  const cancelErrorCode = cancelMutation.error
    ? groupErrorCodeOf(cancelMutation.error)
    : null;

  return (
    <main className="bg-background min-h-dvh px-4 py-5 sm:px-8">
      <div className="mx-auto grid max-w-xl gap-4">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับหน้ากลุ่มในชั้นเรียน"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={`/classes/${classId}/groups`}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {detail?.className ?? "ชั้นเรียน"}
            </p>
            <h1 className="text-2xl font-bold break-words">
              {detail?.name ?? "กลุ่ม"}
            </h1>
          </div>
        </header>

        {!online ? (
          <p
            className="flex items-center gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="size-5 shrink-0" />
            ออฟไลน์อยู่ · ข้อมูลอาจไม่เป็นปัจจุบัน
            และยังส่งหรือยกเลิกคำเชิญไม่ได้
          </p>
        ) : null}

        {!detail && !errorCode ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            กำลังโหลดกลุ่ม...
          </p>
        ) : null}

        {!detail && errorCode ? (
          <ErrorPanel
            classId={classId}
            code={errorCode}
            onRetry={() => void detailQuery.refetch()}
          />
        ) : null}

        {detail ? (
          <>
            <p
              className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]"
              role="status"
            >
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw
                  aria-hidden="true"
                  className={cn(
                    "size-3.5",
                    detailQuery.isFetching && "animate-spin",
                  )}
                />
                {detailQuery.isFetching ? "กำลังอัปเดต..." : "ข้อมูลล่าสุด"}
              </span>
              <span data-realtime={realtime}>
                {realtime === "live"
                  ? "อัปเดตสดอยู่"
                  : realtime === "reconnecting"
                    ? "กำลังเชื่อมต่อใหม่"
                    : "กำลังเชื่อมต่ออัปเดตสด"}
              </span>
            </p>

            {detailQuery.error ? (
              <p
                className="border-border bg-card rounded-xl border p-3 text-sm"
                role="alert"
              >
                อัปเดตไม่สำเร็จ · กำลังแสดงข้อมูลล่าสุดที่โหลดได้
              </p>
            ) : null}

            <section className="border-border bg-card rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <GroupStatusBadge status={detail.status} />
                <span className="border-border inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium">
                  <UsersRound aria-hidden="true" className="size-3.5" />
                  {detail.memberCount}/{detail.maximumSize} คน
                </span>
                <span className="border-border inline-flex min-h-7 items-center rounded-full border px-2.5 text-[13px] font-medium">
                  {detail.meetsMinimumSize
                    ? "ครบขั้นต่ำแล้ว"
                    : "ยังไม่ครบขั้นต่ำ"}
                </span>
              </div>
              <p className="text-muted-foreground mt-3 text-sm leading-6">
                ขั้นต่ำ {detail.minimumSize} คน · ว่าง {detail.availableSeats}{" "}
                ที่
                {detail.pendingCount
                  ? ` · รอตอบรับ ${detail.pendingCount} คน`
                  : ""}
              </p>
            </section>

            <section
              aria-labelledby="members-heading"
              className="border-border bg-card rounded-xl border p-4"
            >
              <h2 className="font-semibold" id="members-heading">
                สมาชิก
              </h2>
              <ul className="divide-border mt-2 divide-y">
                {detail.members.map((member) => (
                  <li className="flex items-center gap-2 py-3" key={member.id}>
                    {member.role === "leader" ? (
                      <Crown aria-hidden="true" className="size-4 shrink-0" />
                    ) : (
                      <UserRound
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    )}
                    <span className="font-medium break-words">
                      {member.displayName}
                    </span>
                    <span className="text-muted-foreground text-[13px]">
                      {member.role === "leader" ? "หัวหน้ากลุ่ม" : "สมาชิก"}
                      {member.id === detail.viewer.userId ? " (คุณ)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {detail.viewer.isLeader || detail.viewer.role === "teacher" ? (
              <section
                aria-labelledby="pending-heading"
                className="border-border bg-card rounded-xl border p-4"
              >
                <h2 className="font-semibold" id="pending-heading">
                  รอตอบรับ {detail.pendingInvitations.length} คน
                </h2>
                {cancelErrorCode ? (
                  <p className="mt-2 text-sm" role="alert">
                    {presentGroupError(cancelErrorCode).title}
                  </p>
                ) : null}
                {detail.pendingInvitations.length ? (
                  <ul className="divide-border mt-2 divide-y">
                    {detail.pendingInvitations.map((invitation) => (
                      <li
                        className="flex flex-wrap items-center justify-between gap-2 py-3"
                        key={invitation.id}
                      >
                        <div className="min-w-0">
                          <p className="font-medium break-words">
                            {invitation.invitee.displayName}
                          </p>
                          <p className="text-muted-foreground text-[13px]">
                            {invitationTimeLeftLabel(
                              invitation.expiresAt,
                              detail.refreshedAt,
                            )}
                          </p>
                        </div>
                        {canManage || detail.viewer.role === "teacher" ? (
                          <Button
                            aria-label={`ยกเลิกคำเชิญ ${invitation.invitee.displayName}`}
                            disabled={!online || cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(invitation.id)}
                            size="sm"
                            variant="outline"
                          >
                            ยกเลิกคำเชิญ
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground mt-1 text-sm">
                    ไม่มีคำเชิญที่รอตอบรับ
                  </p>
                )}
              </section>
            ) : null}

            {detail.viewer.isLeader ? (
              canManage ? (
                inviteOpen ? (
                  <InvitePanel
                    groupId={groupId}
                    online={online}
                    onClose={() => setInviteOpen(false)}
                  />
                ) : (
                  <Button
                    className="w-full"
                    disabled={!online}
                    onClick={() => setInviteOpen(true)}
                    size="lg"
                  >
                    <Plus aria-hidden="true" className="size-5" />
                    ชวนเพื่อนร่วมชั้น
                  </Button>
                )
              ) : (
                <p className="text-muted-foreground flex items-start gap-2 text-sm">
                  <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  กลุ่มถูกล็อกแล้ว จึงเปลี่ยนสมาชิกหรือคำเชิญไม่ได้
                </p>
              )
            ) : detail.viewer.isMember ? (
              <p className="text-muted-foreground flex items-start gap-2 text-sm">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                หัวหน้ากลุ่มเป็นผู้ชวนสมาชิกใหม่
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
