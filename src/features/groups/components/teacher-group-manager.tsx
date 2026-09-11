"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRightLeft,
  BadgeCheck,
  CheckCircle2,
  Crown,
  Info,
  Loader2,
  LockKeyhole,
  LockKeyholeOpen,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserRound,
  UsersRound,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  groupBoardSchema,
  groupQueryKeys,
  type GroupBoard,
  type GroupBoardGroup,
} from "../board";
import {
  useClassGroupRealtime,
  type GroupRealtimeStatus,
} from "../client/realtime";
import {
  fetchGroupJson,
  groupErrorCodeOf,
  postGroupJson,
  readGroupEnvelope,
  type GroupClientErrorCode,
} from "../client/request";
import { useOnlineStatus } from "../client/use-online-status";
import type { GroupUiErrorCode } from "../errors";
import type { TransferLeadershipResult } from "../leadership";
import {
  creationClaimsSchema,
  type CreationClaims,
  type DeleteOrArchiveResult,
  type GroupStatusChangeResult,
  type LockGroupResult,
} from "../lifecycle";
import type {
  CreateTeacherGroupRequest,
  CreateTeacherGroupResult,
  MoveStudentResult,
} from "../teacher";
import {
  approveBlockedReason,
  deleteOutcomeMessage,
  lockOutcomeMessage,
  matchesTeacherGroupFilter,
  moveDestinationKey,
  moveDestinationOptions,
  moveOutcomeMessage,
  presentTeacherGroupError,
  successorCandidates,
  teacherBoardCounts,
  TEACHER_GROUP_FILTER_LABELS,
  TEACHER_GROUP_FILTERS,
  type BoardPerson,
  type MoveDestinationOption,
  type TeacherGroupFilter,
} from "../teacher-actions";
import { GROUP_STATUS_TOKENS, GroupStatusBadge } from "./group-status-badge";
import { TeacherClaimResets } from "./teacher-claim-resets";
import { TeacherCreateGroupForm } from "./teacher-create-group-form";
import { TeacherErrorLine } from "./teacher-error-line";

type Panel =
  | { kind: "create" }
  | { kind: "move"; student: BoardPerson; sourceGroupId: string | null }
  | { kind: "leader" | "lock" | "unlock" | "delete"; groupId: string }
  | null;

const REALTIME_LABELS: Record<GroupRealtimeStatus, string> = {
  connecting: "กำลังเชื่อมต่ออัปเดตสด",
  live: "อัปเดตสดอยู่",
  reconnecting: "กำลังเชื่อมต่อใหม่ · ดึงข้อมูลล่าสุดแล้ว",
};

const chipClassName =
  "border-border bg-background inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[13px] font-medium";

function ConfirmPanel({
  busy,
  children,
  confirmDisabled = false,
  confirmLabel,
  error,
  online,
  onCancel,
  onConfirm,
  title,
}: {
  busy: boolean;
  children: ReactNode;
  confirmDisabled?: boolean;
  confirmLabel: string;
  error: unknown;
  online: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  const titleId = useId();
  return (
    <div
      aria-labelledby={titleId}
      className="border-border bg-background mt-3 rounded-lg border p-3"
      role="alertdialog"
    >
      <p className="font-semibold" id={titleId}>
        {title}
      </p>
      <div className="mt-1 grid gap-2 text-sm leading-6">{children}</div>
      <TeacherErrorLine error={error} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={onCancel} variant="outline">
          ยกเลิก
        </Button>
        <Button
          disabled={busy || !online || confirmDisabled}
          onClick={onConfirm}
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function MovePanel({
  board,
  busy,
  error,
  online,
  onCancel,
  onConfirm,
  sourceGroupId,
  student,
}: {
  board: GroupBoard;
  busy: boolean;
  error: unknown;
  online: boolean;
  onCancel: () => void;
  onConfirm: (
    destination: MoveDestinationOption,
    successorId: string | null,
  ) => void;
  sourceGroupId: string | null;
  student: BoardPerson;
}) {
  const [destinationKey, setDestinationKey] = useState<string | null>(null);
  const [successorId, setSuccessorId] = useState<string | null>(null);
  const source = sourceGroupId
    ? board.groups.find((group) => group.id === sourceGroupId)
    : undefined;
  const options = moveDestinationOptions(board, sourceGroupId);
  const destination = options.find(
    (option) => moveDestinationKey(option) === destinationKey,
  );
  const successors = successorCandidates(source, student.id);
  const successor = successors.find((member) => member.id === successorId);
  const ready = Boolean(
    destination &&
    !destination.disabledReason &&
    (!successors.length || successor),
  );

  return (
    <ConfirmPanel
      busy={busy}
      confirmDisabled={!ready}
      confirmLabel={
        destination
          ? destination.groupId
            ? `ย้ายไป ${destination.name}`
            : "นำออกจากกลุ่ม"
          : "ย้ายนักเรียน"
      }
      error={error}
      online={online}
      onCancel={onCancel}
      onConfirm={() => {
        if (destination && ready) onConfirm(destination, successor?.id ?? null);
      }}
      title={`ย้าย ${student.displayName}`}
    >
      <fieldset>
        <legend className="text-muted-foreground text-[13px]">
          จาก {source?.name ?? "ยังไม่มีกลุ่ม"} · เลือกปลายทาง
        </legend>
        {options.length ? (
          <div className="mt-1 grid gap-1">
            {options.map((option) => {
              const key = moveDestinationKey(option);
              return (
                <label
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5",
                    destinationKey === key
                      ? "border-primary bg-secondary"
                      : "border-border",
                    option.disabledReason && "text-muted-foreground",
                  )}
                  key={key}
                >
                  <input
                    checked={destinationKey === key}
                    disabled={Boolean(option.disabledReason)}
                    name={`move-destination-${student.id}`}
                    onChange={() => setDestinationKey(key)}
                    type="radio"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium break-words">
                      {option.name}
                    </span>
                    <span className="block text-[13px] leading-5">
                      {option.disabledReason ?? option.detail}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground mt-1">
            ยังไม่มีกลุ่มปลายทาง สร้างกลุ่มก่อน
          </p>
        )}
      </fieldset>

      {successors.length && source ? (
        <fieldset>
          <legend className="text-muted-foreground text-[13px] leading-5">
            {student.displayName} เป็นหัวหน้ากลุ่ม {source.name} ·
            เลือกหัวหน้าคนใหม่ในขั้นตอนเดียวกัน
          </legend>
          <div className="mt-1 grid gap-1">
            {successors.map((member) => (
              <label
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border px-3",
                  successorId === member.id
                    ? "border-primary bg-secondary"
                    : "border-border",
                )}
                key={member.id}
              >
                <input
                  checked={successorId === member.id}
                  name={`move-successor-${student.id}`}
                  onChange={() => setSuccessorId(member.id)}
                  type="radio"
                />
                {member.displayName}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {destination && ready ? (
        <p className="text-muted-foreground text-[13px] leading-5">
          {student.displayName} จะ
          {destination.groupId
            ? `ย้ายไปอยู่ ${destination.name}`
            : "กลับไปเป็นนักเรียนที่ยังไม่มีกลุ่ม"}
          {successor && source
            ? ` · ${successor.displayName} จะเป็นหัวหน้ากลุ่ม ${source.name}`
            : ""}
        </p>
      ) : null}
    </ConfirmPanel>
  );
}

function LeaderPanel({
  busy,
  error,
  group,
  online,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: unknown;
  group: GroupBoardGroup;
  online: boolean;
  onCancel: () => void;
  onConfirm: (newLeader: BoardPerson) => void;
}) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const members = group.members.filter((member) => member.role === "member");
  const candidate = members.find((member) => member.id === candidateId);

  return (
    <ConfirmPanel
      busy={busy}
      confirmDisabled={!candidate}
      confirmLabel={
        candidate
          ? `ตั้ง ${candidate.displayName} เป็นหัวหน้า`
          : "เปลี่ยนหัวหน้า"
      }
      error={error}
      online={online}
      onCancel={onCancel}
      onConfirm={() => {
        if (candidate) onConfirm(candidate);
      }}
      title={`เปลี่ยนหัวหน้ากลุ่ม ${group.name}`}
    >
      <fieldset>
        <legend className="text-muted-foreground text-[13px]">
          เลือกสมาชิกที่จะเป็นหัวหน้าคนใหม่
        </legend>
        <div className="mt-1 grid gap-1">
          {members.map((member) => (
            <label
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg border px-3",
                candidateId === member.id
                  ? "border-primary bg-secondary"
                  : "border-border",
              )}
              key={member.id}
            >
              <input
                checked={candidateId === member.id}
                name={`new-leader-${group.id}`}
                onChange={() => setCandidateId(member.id)}
                type="radio"
              />
              {member.displayName}
            </label>
          ))}
        </div>
      </fieldset>
      {candidate ? (
        <p className="text-muted-foreground text-[13px] leading-5">
          {group.leader?.displayName ?? "หัวหน้าเดิม"} จะเป็นสมาชิก ·{" "}
          {candidate.displayName} จะเป็นหัวหน้ากลุ่ม
        </p>
      ) : null}
    </ConfirmPanel>
  );
}

function TeacherGroupCard({
  board,
  busy,
  children,
  group,
  online,
  onApprove,
  onOpen,
}: {
  board: GroupBoard;
  busy: boolean;
  children: ReactNode;
  group: GroupBoardGroup;
  online: boolean;
  onApprove: () => void;
  onOpen: (panel: Exclude<Panel, null>) => void;
}) {
  const locked = group.status === "locked";
  const approveReason = approveBlockedReason(group, board);
  const disabled = busy || !online;
  const hasOtherMembers = group.members.some(
    (member) => member.role === "member",
  );

  return (
    <li
      aria-labelledby={`teacher-group-${group.id}`}
      className="border-border bg-card rounded-xl border p-4"
      role="region"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3
          className="min-w-0 font-semibold break-words"
          id={`teacher-group-${group.id}`}
        >
          {group.name}
        </h3>
        <GroupStatusBadge status={group.status} />
      </div>
      <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-sm">
        <Crown aria-hidden="true" className="size-4 shrink-0" />
        หัวหน้า: {group.leader?.displayName ?? "ยังไม่มีหัวหน้า"}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <UsersRound aria-hidden="true" className="size-4 shrink-0" />
          {group.memberCount}/{group.maximumSize} คน
        </span>
        <span aria-hidden="true">·</span>
        <span>ว่าง {group.availableSeats} ที่</span>
        {group.meetsMinimumSize ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-medium">ยังไม่ครบขั้นต่ำ</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span className="text-muted-foreground">
          {group.creatorType === "teacher" ? "ครูสร้าง" : "นักเรียนสร้าง"}
        </span>
      </p>

      {group.members.length ? (
        <ul className="divide-border mt-2 divide-y">
          {group.members.map((member) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-1.5"
              key={member.id}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <UserRound aria-hidden="true" className="size-4 shrink-0" />
                <span className="break-words">{member.displayName}</span>
                {member.role === "leader" ? (
                  <span className="text-muted-foreground text-[13px]">
                    หัวหน้ากลุ่ม
                  </span>
                ) : null}
              </span>
              <Button
                aria-label={`ย้าย ${member.displayName}`}
                disabled={disabled || locked}
                onClick={() =>
                  onOpen({
                    kind: "move",
                    student: { id: member.id, displayName: member.displayName },
                    sourceGroupId: group.id,
                  })
                }
                size="sm"
                variant="outline"
              >
                <ArrowRightLeft aria-hidden="true" className="size-4" />
                ย้าย
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-2 text-sm">ยังไม่มีสมาชิก</p>
      )}

      {locked ? (
        <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[13px] leading-5">
          <LockKeyhole
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          กลุ่มล็อกอยู่ · ปลดล็อกก่อนย้ายสมาชิกหรือเปลี่ยนหัวหน้า
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {group.status !== "approved" && !locked ? (
          <Button
            aria-describedby={`approve-reason-${group.id}`}
            disabled={disabled || approveReason !== null}
            onClick={onApprove}
            size="sm"
          >
            <BadgeCheck aria-hidden="true" className="size-4" />
            อนุมัติกลุ่ม
          </Button>
        ) : null}
        {locked ? (
          <Button
            disabled={disabled}
            onClick={() => onOpen({ kind: "unlock", groupId: group.id })}
            size="sm"
            variant="outline"
          >
            <LockKeyholeOpen aria-hidden="true" className="size-4" />
            ปลดล็อก
          </Button>
        ) : (
          <Button
            disabled={disabled}
            onClick={() => onOpen({ kind: "lock", groupId: group.id })}
            size="sm"
            variant="outline"
          >
            <LockKeyhole aria-hidden="true" className="size-4" />
            ล็อกกลุ่ม
          </Button>
        )}
        <Button
          disabled={disabled || locked || !hasOtherMembers}
          onClick={() => onOpen({ kind: "leader", groupId: group.id })}
          size="sm"
          variant="outline"
        >
          <Crown aria-hidden="true" className="size-4" />
          เปลี่ยนหัวหน้า
        </Button>
        <Button
          aria-label={`ลบกลุ่ม ${group.name}`}
          disabled={disabled}
          onClick={() => onOpen({ kind: "delete", groupId: group.id })}
          size="sm"
          variant="outline"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          ลบกลุ่ม
        </Button>
      </div>
      {group.status !== "approved" && !locked && approveReason ? (
        <p
          className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[13px] leading-5"
          id={`approve-reason-${group.id}`}
        >
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {approveReason}
        </p>
      ) : null}
      {children}
    </li>
  );
}

function ManagerErrorPanel({
  code,
  onRetry,
  retrying,
}: {
  code: GroupClientErrorCode;
  onRetry: () => void;
  retrying: boolean;
}) {
  const presentation = presentTeacherGroupError(code);
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
      <div className="mt-3 flex flex-wrap gap-2">
        {code === "AUTH_REQUIRED" ? (
          <Link
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
            href="/auth/sign-in"
          >
            ไปหน้าเข้าสู่ระบบ
          </Link>
        ) : code === "FORBIDDEN" || code === "CLASS_NOT_ACTIVE" ? (
          <Link
            className="border-border bg-background inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
            href="/teacher/classes"
          >
            กลับรายการชั้นเรียน
          </Link>
        ) : (
          <Button disabled={retrying} onClick={onRetry} variant="outline">
            <RefreshCw
              aria-hidden="true"
              className={cn("size-4", retrying && "animate-spin")}
            />
            ลองใหม่
          </Button>
        )}
      </div>
    </section>
  );
}

export function TeacherGroupManager({
  classId,
  initialBoard,
  initialClaims,
  initialErrorCode,
}: {
  classId: string;
  initialBoard: GroupBoard | null;
  initialClaims: CreationClaims | null;
  initialErrorCode: GroupUiErrorCode | null;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const realtime = useClassGroupRealtime(classId);
  const [filter, setFilter] = useState<TeacherGroupFilter>("all");
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: groupQueryKeys.board(classId),
    queryFn: () =>
      fetchGroupJson(`/api/classes/${classId}/group-board`, groupBoardSchema),
    ...(initialBoard ? { initialData: initialBoard } : {}),
    // Optional slow fallback (D-041); the class-group signal is the primary refresh.
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const claimsQuery = useQuery({
    queryKey: groupQueryKeys.creationClaims(classId),
    queryFn: () =>
      fetchGroupJson(
        `/api/classes/${classId}/group-creation-claims`,
        creationClaimsSchema,
      ),
    ...(initialClaims ? { initialData: initialClaims } : {}),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const action = useMutation({
    mutationFn: (run: () => Promise<string>) => run(),
    onSuccess: (message) => {
      setNotice(message);
      setPanel(null);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: groupQueryKeys.all }),
  });

  const openPanel = (next: Panel) => {
    action.reset();
    setNotice(null);
    setPanel(next);
  };
  const closePanel = () => {
    action.reset();
    setPanel(null);
  };
  const busy = action.isPending;

  // A class member who is not its teacher gets the same denial as a stranger.
  const board =
    boardQuery.data?.viewer.role === "teacher" ? boardQuery.data : undefined;
  const boardErrorCode: GroupClientErrorCode | null = boardQuery.error
    ? groupErrorCodeOf(boardQuery.error)
    : boardQuery.data && !board
      ? "FORBIDDEN"
      : !board
        ? initialErrorCode
        : null;

  function panelFor(group: GroupBoardGroup) {
    if (!panel || !board) return null;
    const shared = {
      busy,
      error: action.error,
      online,
      onCancel: closePanel,
    };

    if (panel.kind === "move") {
      if (panel.sourceGroupId !== group.id) return null;
      return (
        <MovePanel
          {...shared}
          board={board}
          onConfirm={(destination, successorId) =>
            moveStudent(panel.student, destination, successorId)
          }
          sourceGroupId={group.id}
          student={panel.student}
        />
      );
    }
    if (panel.kind === "create" || panel.groupId !== group.id) return null;

    const memberNames = group.members
      .map((member) => member.displayName)
      .join(", ");

    switch (panel.kind) {
      case "leader":
        return (
          <LeaderPanel
            {...shared}
            group={group}
            onConfirm={(newLeader) =>
              action.mutate(async () => {
                await postGroupJson<TransferLeadershipResult>(
                  `/api/groups/${group.id}/change-leader`,
                  { newLeaderId: newLeader.id },
                );
                return `เปลี่ยนหัวหน้ากลุ่ม ${group.name} เป็น ${newLeader.displayName} แล้ว`;
              })
            }
          />
        );
      case "lock":
        return (
          <ConfirmPanel
            {...shared}
            confirmLabel="ล็อกกลุ่ม"
            onConfirm={() =>
              action.mutate(async () =>
                lockOutcomeMessage(
                  group.name,
                  await postGroupJson<LockGroupResult>(
                    `/api/groups/${group.id}/lock`,
                  ),
                ),
              )
            }
            title={`ล็อกกลุ่ม ${group.name}?`}
          >
            <p>
              สมาชิก {group.memberCount} คน
              {memberNames ? ` (${memberNames})` : ""}{" "}
              จะเปลี่ยนสมาชิกหรือหัวหน้ากลุ่มไม่ได้จนกว่าครูจะปลดล็อก
            </p>
            <p className="text-muted-foreground text-[13px] leading-5">
              คำเชิญที่รอตอบของกลุ่มนี้จะถูกยกเลิก · สมาชิกจะได้รับการแจ้งเตือน
            </p>
          </ConfirmPanel>
        );
      case "unlock":
        return (
          <ConfirmPanel
            {...shared}
            confirmLabel="ปลดล็อกกลุ่ม"
            onConfirm={() =>
              action.mutate(async () => {
                const result = await postGroupJson<GroupStatusChangeResult>(
                  `/api/groups/${group.id}/unlock`,
                );
                return `ปลดล็อกกลุ่ม ${group.name} แล้ว · สถานะ ${GROUP_STATUS_TOKENS[result.status].label}`;
              })
            }
            title={`ปลดล็อกกลุ่ม ${group.name}?`}
          >
            <p>
              หัวหน้ากลุ่มจะเชิญเพื่อนและนำสมาชิกออกได้อีกครั้งเมื่อการจัดกลุ่มเปิดอยู่
              และครูย้ายสมาชิกหรือเปลี่ยนหัวหน้าได้
            </p>
            <p className="text-muted-foreground text-[13px] leading-5">
              สถานะจะกลับเป็น “ครูอนุมัติแล้ว” หากเคยอนุมัติ มิฉะนั้นเป็น
              “กำลังจัดกลุ่ม” · สมาชิก {group.memberCount}{" "}
              คนจะได้รับการแจ้งเตือน · ปลดล็อกไม่ได้ระหว่างรอบสำรวจที่กำลังทำงาน
            </p>
          </ConfirmPanel>
        );
      case "delete":
        return (
          <ConfirmPanel
            {...shared}
            confirmLabel="ลบกลุ่ม"
            onConfirm={() =>
              action.mutate(async () =>
                deleteOutcomeMessage(
                  group.name,
                  await readGroupEnvelope<DeleteOrArchiveResult>(
                    await fetch(`/api/groups/${group.id}`, {
                      method: "DELETE",
                    }),
                  ),
                ),
              )
            }
            title={`ลบกลุ่ม ${group.name}?`}
          >
            <p>
              {group.memberCount
                ? `สมาชิก ${group.memberCount} คน (${memberNames}) จะกลับไปเป็นนักเรียนที่ยังไม่มีกลุ่ม`
                : "กลุ่มนี้ไม่มีสมาชิก"}{" "}
              · คำเชิญที่รอตอบจะถูกยกเลิก · สมาชิกจะได้รับการแจ้งเตือน
            </p>
            <p className="text-muted-foreground text-[13px] leading-5">
              ถ้ากลุ่มมีประวัติกิจกรรม
              ระบบจะเก็บถาวรแทนการลบเพื่อรักษาข้อมูลเดิม ·
              การลบไม่คืนสิทธิ์สร้างกลุ่มของนักเรียนที่สร้างกลุ่มนี้
            </p>
          </ConfirmPanel>
        );
    }
  }

  function moveStudent(
    student: BoardPerson,
    destination: MoveDestinationOption,
    successorId: string | null,
  ) {
    action.mutate(async () => {
      const result = await postGroupJson<MoveStudentResult>(
        `/api/classes/${classId}/groups/move-student`,
        {
          studentId: student.id,
          destinationGroupId: destination.groupId,
          successorLeaderId: successorId,
        },
      );
      return moveOutcomeMessage(
        student.displayName,
        destination.groupId ? destination.name : null,
        result,
      );
    });
  }

  function createGroup(request: CreateTeacherGroupRequest) {
    action.mutate(async () => {
      const result = await postGroupJson<CreateTeacherGroupResult>(
        `/api/classes/${classId}/groups`,
        request,
      );
      return `สร้างกลุ่ม ${request.name} แล้ว · เหลือช่องกลุ่ม ${result.remainingGroupSlots} กลุ่ม`;
    });
  }

  function approve(group: GroupBoardGroup) {
    openPanel(null);
    action.mutate(async () => {
      await postGroupJson<GroupStatusChangeResult>(
        `/api/groups/${group.id}/approve`,
      );
      return `อนุมัติกลุ่ม ${group.name} แล้ว`;
    });
  }

  const counts = board ? teacherBoardCounts(board) : null;
  const visibleGroups = board
    ? board.groups.filter((group) => matchesTeacherGroupFilter(group, filter))
    : [];
  const topLevelError = action.error && !panel ? action.error : null;

  return (
    <main className="bg-background min-h-dvh px-4 pt-5 pb-8 sm:px-8">
      <div className="mx-auto grid max-w-5xl gap-4">
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
              {board?.className ?? "ชั้นเรียน"}
            </p>
            <h1 className="text-2xl font-bold">จัดการกลุ่ม</h1>
          </div>
        </header>

        {!online ? (
          <section
            className="flex items-start gap-3 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">ออฟไลน์อยู่</p>
              <p className="mt-0.5 leading-6">
                ข้อมูลกลุ่มอาจไม่เป็นปัจจุบัน จัดการกลุ่มได้เมื่อกลับมาออนไลน์
              </p>
            </div>
          </section>
        ) : null}

        {!board && !boardErrorCode ? (
          <p
            className="border-border bg-card flex items-center gap-2 rounded-xl border p-4 text-sm"
            role="status"
          >
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            กำลังโหลดกลุ่ม...
          </p>
        ) : null}

        {!board && boardErrorCode ? (
          <ManagerErrorPanel
            code={boardErrorCode}
            onRetry={() => void boardQuery.refetch()}
            retrying={boardQuery.isFetching}
          />
        ) : null}

        {board && counts ? (
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
                    boardQuery.isFetching && "animate-spin",
                  )}
                />
                {boardQuery.isFetching
                  ? "กำลังอัปเดตข้อมูลกลุ่ม..."
                  : `อัปเดตล่าสุด ${new Date(boardQuery.dataUpdatedAt).toLocaleTimeString("th-TH")}`}
              </span>
              <span data-realtime={realtime}>{REALTIME_LABELS[realtime]}</span>
            </p>

            {boardQuery.error ? (
              <section
                className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
                role="alert"
              >
                <span>อัปเดตไม่สำเร็จ · กำลังแสดงข้อมูลล่าสุดที่โหลดได้</span>
                <Button
                  onClick={() => void boardQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  ลองใหม่
                </Button>
              </section>
            ) : null}

            <section
              aria-label="สรุปกลุ่ม"
              className="border-border bg-card rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={chipClassName}>
                  {board.formationStatus === "open"
                    ? "การจัดกลุ่มเปิดอยู่"
                    : "ปิดการจัดกลุ่มแล้ว"}
                </span>
                <span className={chipClassName}>
                  ใช้แล้ว {board.currentGroupCount}/{board.maximumGroups} กลุ่ม
                </span>
                <span className={chipClassName}>
                  เหลือ {board.remainingGroupSlots} กลุ่ม
                </span>
                <span className={chipClassName}>
                  รออนุมัติ {counts.awaitingApproval}
                </span>
                <span className={chipClassName}>ล็อก {counts.locked}</span>
                <span className={chipClassName}>
                  ยังไม่มีกลุ่ม {counts.unassigned} คน
                </span>
              </div>
              <p className="text-muted-foreground mt-3 text-sm leading-6">
                กลุ่มละ {board.minimumGroupSize}–{board.maximumGroupSize} คน ·
                ยังไม่ครบขั้นต่ำ {counts.belowMinimum} กลุ่ม
              </p>
            </section>

            {notice ? (
              <section
                className="border-success/30 bg-success/10 flex gap-3 rounded-xl border p-4 text-sm"
                role="status"
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="text-success mt-0.5 size-5 shrink-0"
                />
                <p className="font-semibold">{notice}</p>
              </section>
            ) : null}
            <TeacherErrorLine error={topLevelError} />

            {panel?.kind === "create" ? (
              <TeacherCreateGroupForm
                board={board}
                busy={busy}
                error={action.error}
                online={online}
                onCancel={closePanel}
                onSubmit={createGroup}
              />
            ) : (
              <div>
                <Button
                  aria-describedby="teacher-create-reason"
                  disabled={busy || !online || board.remainingGroupSlots === 0}
                  onClick={() => openPanel({ kind: "create" })}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  สร้างกลุ่ม
                </Button>
                <p
                  className="text-muted-foreground mt-2 text-[13px] leading-5"
                  id="teacher-create-reason"
                >
                  {board.remainingGroupSlots === 0
                    ? `ครบจำนวนกลุ่มสูงสุด ${board.maximumGroups} กลุ่มแล้ว เพิ่มจำนวนกลุ่มในการตั้งค่าชั้นเรียนก่อน`
                    : `สร้างได้อีก ${board.remainingGroupSlots} กลุ่ม`}
                </p>
              </div>
            )}

            <section
              aria-labelledby="teacher-groups-heading"
              className="grid gap-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  className="text-lg font-semibold"
                  id="teacher-groups-heading"
                >
                  กลุ่มทั้งหมด
                </h2>
                <span className="text-muted-foreground text-sm">
                  แสดง {visibleGroups.length} จาก {board.groups.length} กลุ่ม
                </span>
              </div>
              <div
                aria-label="กรองกลุ่มตามสถานะ"
                className="flex flex-wrap gap-2"
                role="group"
              >
                {TEACHER_GROUP_FILTERS.map((option) => (
                  <button
                    aria-pressed={filter === option}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm font-medium",
                      filter === option
                        ? "border-primary bg-secondary text-secondary-foreground"
                        : "border-border bg-card",
                    )}
                    key={option}
                    onClick={() => setFilter(option)}
                    type="button"
                  >
                    {TEACHER_GROUP_FILTER_LABELS[option]}
                  </button>
                ))}
              </div>
              {visibleGroups.length ? (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {visibleGroups.map((group) => (
                    <TeacherGroupCard
                      board={board}
                      busy={busy}
                      group={group}
                      key={group.id}
                      online={online}
                      onApprove={() => approve(group)}
                      onOpen={openPanel}
                    >
                      {panelFor(group)}
                    </TeacherGroupCard>
                  ))}
                </ul>
              ) : (
                <p className="border-border bg-card rounded-xl border p-4 text-sm leading-6">
                  {board.groups.length
                    ? "ไม่มีกลุ่มที่ตรงกับตัวกรองนี้"
                    : "ยังไม่มีกลุ่มในชั้นเรียนนี้"}
                </p>
              )}
            </section>

            <section
              aria-labelledby="teacher-unassigned-heading"
              className="border-border bg-card rounded-xl border p-4"
            >
              <h2 className="font-semibold" id="teacher-unassigned-heading">
                ยังไม่มีกลุ่ม ({board.unassignedStudents.length} คน)
              </h2>
              {board.unassignedStudents.length ? (
                <ul className="divide-border mt-2 divide-y">
                  {board.unassignedStudents.map((student) => (
                    <li className="py-2" key={student.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium break-words">
                          {student.displayName}
                        </span>
                        <Button
                          aria-label={`ย้าย ${student.displayName} เข้ากลุ่ม`}
                          disabled={busy || !online || !board.groups.length}
                          onClick={() =>
                            openPanel({
                              kind: "move",
                              student,
                              sourceGroupId: null,
                            })
                          }
                          size="sm"
                          variant="outline"
                        >
                          <ArrowRightLeft
                            aria-hidden="true"
                            className="size-4"
                          />
                          ย้ายเข้ากลุ่ม
                        </Button>
                      </div>
                      {panel?.kind === "move" &&
                      panel.sourceGroupId === null &&
                      panel.student.id === student.id ? (
                        <MovePanel
                          board={board}
                          busy={busy}
                          error={action.error}
                          online={online}
                          onCancel={closePanel}
                          onConfirm={(destination, successorId) =>
                            moveStudent(student, destination, successorId)
                          }
                          sourceGroupId={null}
                          student={student}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-1 text-sm">
                  นักเรียนทุกคนมีกลุ่มแล้ว
                </p>
              )}
            </section>

            <TeacherClaimResets
              claims={claimsQuery.data}
              classId={classId}
              loadError={claimsQuery.error}
              online={online}
              onRetry={() => void claimsQuery.refetch()}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}
