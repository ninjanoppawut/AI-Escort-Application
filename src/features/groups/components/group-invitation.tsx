"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Crown,
  Info,
  Loader2,
  MailOpen,
  RefreshCw,
  ShieldAlert,
  UserRound,
  WifiOff,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

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
  groupInvitationDetailSchema,
  invitationQueryKeys,
  type AcceptGroupInvitationResult,
  type GroupInvitationDetail,
  type InvitationStatusResult,
} from "../invitations";
import { GroupStatusBadge } from "./group-status-badge";

type Outcome =
  | { kind: "accepted"; result: AcceptGroupInvitationResult }
  | { kind: "declined"; result: InvitationStatusResult };

function unavailableCopy(invitation: GroupInvitationDetail) {
  const reason = invitation.viewer.cannotRespondReason;
  const board = `/classes/${invitation.classId}/groups`;
  const group = `/classes/${invitation.classId}/groups/${invitation.group.id}`;

  if (reason === "INVITATION_NOT_PENDING") {
    if (invitation.status === "accepted") {
      return {
        title: "คุณตอบรับคำเชิญนี้แล้ว",
        description: `คุณอยู่ในกลุ่ม ${invitation.group.name}`,
        href: group,
        action: "เปิดกลุ่มของฉัน",
      };
    }
    if (invitation.status === "declined") {
      return {
        title: "คุณปฏิเสธคำเชิญนี้แล้ว",
        description: "หัวหน้ากลุ่มส่งคำเชิญใหม่ได้หากต้องการ",
        href: board,
        action: "กลับหน้ากลุ่ม",
      };
    }
    return {
      title: "คำเชิญนี้ถูกยกเลิกแล้ว",
      description: "หัวหน้ากลุ่มยกเลิกคำเชิญ หรือคุณเข้ากลุ่มอื่นไปแล้ว",
      href: board,
      action: "กลับหน้ากลุ่ม",
    };
  }
  if (reason === "GROUP_FULL") {
    return {
      title: "กลุ่มเต็มก่อนคุณกดรับ",
      description:
        "ที่นั่งในกลุ่มนี้ถูกใช้ครบแล้ว เลือกกลุ่มอื่นหรือรอคำเชิญใหม่",
      href: board,
      action: "กลับหน้ากลุ่ม",
    };
  }
  if (reason === "STUDENT_ALREADY_IN_GROUP") {
    return {
      title: "คุณอยู่กลุ่มอื่นแล้ว",
      description: "นักเรียนอยู่ได้เพียงหนึ่งกลุ่มต่อชั้นเรียน",
      href: board,
      action: "เปิดกลุ่มของฉัน",
    };
  }
  if (reason === "FORBIDDEN") {
    return {
      title: "มุมมองอ่านอย่างเดียว",
      description: "เฉพาะนักเรียนที่ได้รับคำเชิญตอบรับหรือปฏิเสธได้",
      href: group,
      action: "เปิดกลุ่ม",
    };
  }
  const presentation = presentGroupError(reason ?? "FORBIDDEN");
  return {
    title: presentation.title,
    description: presentation.description,
    href: board,
    action: presentation.action,
  };
}

interface GroupInvitationScreenProps {
  invitationId: string;
  initialInvitation: GroupInvitationDetail | null;
  initialErrorCode: GroupUiErrorCode | null;
}

function InvitationRealtime({ classId }: { classId: string }) {
  useClassGroupRealtime(classId);
  return null;
}

export function GroupInvitationScreen({
  invitationId,
  initialInvitation,
  initialErrorCode,
}: GroupInvitationScreenProps) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();

  const invitationQuery = useQuery({
    queryKey: invitationQueryKeys.invitation(invitationId),
    queryFn: () =>
      fetchGroupJson(
        `/api/group-invitations/${invitationId}`,
        groupInvitationDetailSchema,
      ),
    ...(initialInvitation ? { initialData: initialInvitation } : {}),
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const respondMutation = useMutation({
    mutationFn: async (action: "accept" | "decline"): Promise<Outcome> =>
      action === "accept"
        ? {
            kind: "accepted",
            result: await postGroupJson<AcceptGroupInvitationResult>(
              `/api/group-invitations/${invitationId}/accept`,
            ),
          }
        : {
            kind: "declined",
            result: await postGroupJson<InvitationStatusResult>(
              `/api/group-invitations/${invitationId}/decline`,
            ),
          },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: groupQueryKeys.all }),
  });

  const invitation = invitationQuery.data;
  const loadErrorCode: GroupClientErrorCode | null = invitationQuery.error
    ? groupErrorCodeOf(invitationQuery.error)
    : !invitation
      ? initialErrorCode
      : null;
  const respondErrorCode = respondMutation.error
    ? groupErrorCodeOf(respondMutation.error)
    : null;
  const outcome = respondMutation.data;

  return (
    <main className="bg-background min-h-dvh px-4 py-5 sm:px-8">
      {invitation ? <InvitationRealtime classId={invitation.classId} /> : null}
      <div className="mx-auto grid max-w-xl gap-4">
        <header className="flex items-center gap-3">
          <span className="bg-secondary text-secondary-foreground grid size-11 shrink-0 place-items-center rounded-full">
            <MailOpen aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {invitation?.className ?? "AI Escort"}
            </p>
            <h1 className="text-2xl font-bold">คำเชิญเข้ากลุ่ม</h1>
          </div>
        </header>

        {!online ? (
          <p
            className="flex items-center gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="size-5 shrink-0" />
            ออฟไลน์อยู่ · ตอบรับหรือปฏิเสธได้เมื่อกลับมาออนไลน์
          </p>
        ) : null}

        {!invitation && !loadErrorCode ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            กำลังโหลดคำเชิญ...
          </p>
        ) : null}

        {!invitation && loadErrorCode ? (
          <section
            className="border-border bg-card rounded-xl border p-4"
            role="alert"
          >
            <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
            <h2 className="mt-2 font-semibold">
              {presentGroupError(loadErrorCode).title}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {presentGroupError(loadErrorCode).description}
            </p>
            {loadErrorCode === "NETWORK" ? (
              <Button
                className="mt-3"
                onClick={() => void invitationQuery.refetch()}
                variant="outline"
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                ลองใหม่
              </Button>
            ) : (
              <Link
                className="border-border bg-background mt-3 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
                href="/notifications"
              >
                กลับการแจ้งเตือน
              </Link>
            )}
          </section>
        ) : null}

        {invitation ? (
          <>
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <Clock3 aria-hidden="true" className="size-4" />
              {invitation.status === "pending"
                ? invitationTimeLeftLabel(
                    invitation.expiresAt,
                    invitation.refreshedAt,
                  )
                : "ไม่สามารถตอบคำเชิญนี้ได้แล้ว"}
            </p>

            <section className="border-border bg-card rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-lg font-semibold break-words">
                  {invitation.group.name}
                </h2>
                <GroupStatusBadge status={invitation.group.status} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm">
                <Crown aria-hidden="true" className="size-4 shrink-0" />
                หัวหน้ากลุ่ม:{" "}
                {invitation.group.leader?.displayName ?? "ยังไม่มีหัวหน้า"}
              </p>
              <ul className="mt-3 grid gap-1.5 text-sm">
                {invitation.group.members.map((member) => (
                  <li className="flex items-center gap-2" key={member.id}>
                    <UserRound aria-hidden="true" className="size-4 shrink-0" />
                    <span className="break-words">{member.displayName}</span>
                    <span className="text-muted-foreground text-[13px]">
                      {member.role === "leader" ? "หัวหน้ากลุ่ม" : "สมาชิก"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-border mt-3 border-t pt-3 text-sm font-medium">
                ที่นั่งคงเหลือ {invitation.group.availableSeats} จาก{" "}
                {invitation.group.maximumSize}
              </p>
            </section>

            {outcome?.kind === "accepted" ? (
              <section
                className="border-success/30 bg-success/10 rounded-xl border p-4"
                role="status"
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="text-success size-6"
                />
                <h2 className="mt-2 font-semibold">
                  เข้ากลุ่ม {invitation.group.name} แล้ว
                </h2>
                <Link
                  className="bg-primary text-primary-foreground mt-3 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
                  href={`/classes/${invitation.classId}/groups/${invitation.group.id}`}
                >
                  เปิดกลุ่มของฉัน
                </Link>
              </section>
            ) : outcome?.kind === "declined" ? (
              <section
                className="border-border bg-card rounded-xl border p-4"
                role="status"
              >
                <h2 className="font-semibold">ปฏิเสธคำเชิญแล้ว</h2>
                <Link
                  className="border-border bg-background mt-3 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
                  href={`/classes/${invitation.classId}/groups`}
                >
                  กลับหน้ากลุ่ม
                </Link>
              </section>
            ) : invitation.viewer.canRespond ? (
              <section className="grid gap-3">
                <p
                  className="border-border bg-card flex items-start gap-2 rounded-xl border p-3 text-sm leading-6"
                  role="note"
                >
                  <Info aria-hidden="true" className="mt-1 size-4 shrink-0" />
                  รับคำเชิญนี้แล้วจะเข้ากลุ่มทันที
                  คุณอยู่ได้เพียงกลุ่มเดียวต่อหนึ่งชั้นเรียน
                </p>
                {respondErrorCode ? (
                  <p
                    className="border-border bg-card rounded-xl border p-3 text-sm"
                    role="alert"
                  >
                    <span className="font-semibold">
                      {presentGroupError(respondErrorCode).title}
                    </span>{" "}
                    {presentGroupError(respondErrorCode).description}
                  </p>
                ) : null}
                <Button
                  disabled={!online || respondMutation.isPending}
                  onClick={() => respondMutation.mutate("accept")}
                  size="lg"
                >
                  {respondMutation.isPending &&
                  respondMutation.variables === "accept" ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-5 animate-spin"
                    />
                  ) : null}
                  ตอบรับคำเชิญ
                </Button>
                <Button
                  disabled={!online || respondMutation.isPending}
                  onClick={() => respondMutation.mutate("decline")}
                  size="lg"
                  variant="outline"
                >
                  ปฏิเสธ
                </Button>
              </section>
            ) : (
              (() => {
                const copy = unavailableCopy(invitation);
                return (
                  <section
                    className="border-border bg-card rounded-xl border p-4"
                    role="status"
                  >
                    <h2 className="font-semibold">{copy.title}</h2>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">
                      {copy.description}
                    </p>
                    <Link
                      className="bg-primary text-primary-foreground mt-3 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
                      href={copy.href}
                    >
                      {copy.action}
                    </Link>
                  </section>
                );
              })()
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
