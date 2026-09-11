"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import type { ApiEnvelope, ApiError } from "@/lib/http/envelope";
import { cn } from "@/lib/utils";

import {
  groupBoardSchema,
  groupQueryKeys,
  type CannotCreateReason,
  type GroupBoard,
  type GroupBoardGroup,
} from "../board";
import {
  useClassGroupRealtime,
  type GroupRealtimeStatus,
} from "../client/realtime";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  type CreatedStudentGroup,
} from "../contracts";
import {
  GROUP_ERROR_PRESENTATIONS,
  GROUP_UI_ERROR_CODES,
  type GroupUiErrorCode,
} from "../errors";
import { GroupStatusBadge } from "./group-status-badge";

const createGroupFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "กรอกชื่อกลุ่ม")
    .max(
      GROUP_NAME_MAX_LENGTH,
      `ชื่อกลุ่มยาวได้ไม่เกิน ${GROUP_NAME_MAX_LENGTH} ตัวอักษร`,
    ),
  description: z
    .string()
    .trim()
    .max(
      GROUP_DESCRIPTION_MAX_LENGTH,
      `คำอธิบายยาวได้ไม่เกิน ${GROUP_DESCRIPTION_MAX_LENGTH} ตัวอักษร`,
    ),
});

type CreateGroupFormInput = z.input<typeof createGroupFormSchema>;
type CreateGroupFormOutput = z.output<typeof createGroupFormSchema>;

const FORBIDDEN_ERROR: ApiError = {
  code: "FORBIDDEN",
  message: GROUP_ERROR_PRESENTATIONS.FORBIDDEN.title,
  retryable: false,
  details: {},
};

export class GroupRequestError extends Error {
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.code);
    this.name = "GroupRequestError";
    this.apiError = apiError;
  }
}

type BoardErrorCode = GroupUiErrorCode | "NETWORK";

function errorCodeOf(error: unknown): BoardErrorCode {
  if (error instanceof GroupRequestError) {
    const code = error.apiError.code as GroupUiErrorCode;
    return GROUP_UI_ERROR_CODES.includes(code) ? code : "FORBIDDEN";
  }
  return "NETWORK";
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !body || body.error) {
    throw new GroupRequestError(body?.error ?? FORBIDDEN_ERROR);
  }
  return body.data;
}

export async function fetchGroupBoard(classId: string): Promise<GroupBoard> {
  const data = await readEnvelope<unknown>(
    await fetch(`/api/classes/${classId}/group-board`, { cache: "no-store" }),
  );
  const parsed = groupBoardSchema.safeParse(data);
  if (!parsed.success) throw new GroupRequestError(FORBIDDEN_ERROR);
  return parsed.data;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    queueMicrotask(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

export function cannotCreateMessage(
  reason: CannotCreateReason,
  board: Pick<GroupBoard, "maximumGroups">,
) {
  switch (reason) {
    case "GROUP_LIMIT_REACHED":
      return `สร้างไม่ได้เพราะครบจำนวนกลุ่มสูงสุด ${board.maximumGroups} กลุ่มแล้ว เข้าร่วมกลุ่มที่ยังว่างหรือรอคำเชิญ`;
    case "GROUP_FORMATION_CLOSED":
      return "สร้างไม่ได้เพราะครูปิดการจัดกลุ่มแล้ว";
    case "STUDENT_GROUP_CREATION_DISABLED":
      return "สร้างไม่ได้เพราะครูไม่อนุญาตให้นักเรียนสร้างกลุ่ม เข้าร่วมกลุ่มที่มีอยู่ผ่านคำเชิญ";
    case "STUDENT_ALREADY_IN_GROUP":
      return "สร้างไม่ได้เพราะคุณอยู่ในกลุ่มแล้ว";
    case "STUDENT_GROUP_ALREADY_CREATED":
      return "สร้างไม่ได้เพราะคุณใช้สิทธิ์สร้างกลุ่มในชั้นเรียนนี้แล้ว ติดต่อครูหากต้องการรีเซ็ตสิทธิ์";
    case "FORBIDDEN":
      return "เฉพาะนักเรียนในชั้นเรียนนี้สร้างกลุ่มได้";
  }
}

function formatUpdatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function seatLabel(group: GroupBoardGroup) {
  if (group.isAcceptingMembers) return `ว่าง ${group.availableSeats} ที่`;
  if (group.availableSeats === 0) return "เต็มแล้ว";
  return "ไม่รับสมาชิกเพิ่ม";
}

const REALTIME_LABELS: Record<GroupRealtimeStatus, string> = {
  connecting: "กำลังเชื่อมต่ออัปเดตสด",
  live: "อัปเดตสดอยู่",
  reconnecting: "กำลังเชื่อมต่อใหม่ · ดึงข้อมูลล่าสุดแล้ว",
};

function BoardFreshness({
  isFetching,
  realtime,
  updatedAt,
}: {
  isFetching: boolean;
  realtime: GroupRealtimeStatus;
  updatedAt: number;
}) {
  return (
    <div
      className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]"
      role="status"
    >
      <span className="inline-flex items-center gap-1.5">
        <RefreshCw
          aria-hidden="true"
          className={cn("size-3.5", isFetching && "animate-spin")}
        />
        {isFetching
          ? "กำลังอัปเดตข้อมูลกลุ่ม..."
          : `อัปเดตล่าสุด ${formatUpdatedAt(updatedAt)}`}
      </span>
      <span
        className="inline-flex items-center gap-1.5"
        data-realtime={realtime}
      >
        {realtime === "reconnecting" ? (
          <WifiOff aria-hidden="true" className="size-3.5" />
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              realtime === "live"
                ? "bg-success"
                : "border border-current bg-transparent",
            )}
          />
        )}
        {REALTIME_LABELS[realtime]}
      </span>
    </div>
  );
}

function GroupCard({
  classId,
  group,
  isMine,
}: {
  classId: string;
  group: GroupBoardGroup;
  isMine: boolean;
}) {
  return (
    <li
      className={cn(
        "bg-card rounded-xl border p-4",
        isMine ? "border-primary border-2" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">
            <Link
              className="underline-offset-4 hover:underline focus-visible:underline"
              href={`/classes/${classId}/groups/${group.id}`}
            >
              {group.name}
            </Link>
          </h3>
          {isMine ? (
            <p className="text-primary mt-0.5 text-[13px] font-medium">
              กลุ่มของคุณ
            </p>
          ) : null}
        </div>
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
        <span className="font-medium">{seatLabel(group)}</span>
        {group.meetsMinimumSize ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-muted-foreground">ยังไม่ครบขั้นต่ำ</span>
          </>
        )}
      </p>
      <details className="mt-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
          ดูสมาชิก ({group.memberCount})
        </summary>
        <ul className="grid gap-1.5 pb-1 text-sm">
          {group.members.map((member) => (
            <li className="flex items-center gap-2" key={member.id}>
              <UserRound aria-hidden="true" className="size-4 shrink-0" />
              <span className="break-words">{member.displayName}</span>
              {member.role === "leader" ? (
                <span className="text-muted-foreground text-[13px]">
                  หัวหน้ากลุ่ม
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function BoardErrorPanel({
  code,
  onRetry,
  retrying,
}: {
  code: BoardErrorCode;
  onRetry: () => void;
  retrying: boolean;
}) {
  const presentation =
    code === "NETWORK"
      ? {
          title: "เชื่อมต่อไม่สำเร็จ",
          description: "ตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองอีกครั้ง",
        }
      : GROUP_ERROR_PRESENTATIONS[code];

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
        ) : code === "CLASS_NOT_ACTIVE" || code === "FORBIDDEN" ? (
          <Link
            className="border-border bg-background inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
            href="/app"
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

interface GroupBoardScreenProps {
  classId: string;
  initialBoard: GroupBoard | null;
  initialErrorCode: GroupUiErrorCode | null;
}

export function GroupBoardScreen({
  classId,
  initialBoard,
  initialErrorCode,
}: GroupBoardScreenProps) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const realtime = useClassGroupRealtime(classId);
  const [formOpen, setFormOpen] = useState(false);
  const [created, setCreated] = useState<CreatedStudentGroup | null>(null);

  const boardQuery = useQuery({
    queryKey: groupQueryKeys.board(classId),
    queryFn: () => fetchGroupBoard(classId),
    ...(initialBoard ? { initialData: initialBoard } : {}),
    // Optional slow fallback (D-041); the class-group signal is the primary refresh.
    refetchInterval: 60_000,
    // The formation board refreshes on foreground and reconnect immediately:
    // a stale slot count would cause a failed create.
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: false,
  });

  const form = useForm<CreateGroupFormInput, unknown, CreateGroupFormOutput>({
    resolver: zodResolver(createGroupFormSchema),
    defaultValues: { name: "", description: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateGroupFormOutput) =>
      readEnvelope<CreatedStudentGroup>(
        await fetch("/api/groups", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classId,
            name: values.name,
            ...(values.description ? { description: values.description } : {}),
          }),
        }),
      ),
    onSuccess: (data) => {
      setCreated(data);
      setFormOpen(false);
      form.reset();
    },
    onError: (error) => {
      // A committed denial means the slot state changed; keep typed input only
      // for transport failures so the student can resend.
      if (error instanceof GroupRequestError) setFormOpen(false);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: groupQueryKeys.board(classId),
      }),
  });

  const board = boardQuery.data;
  const boardErrorCode: BoardErrorCode | null = boardQuery.error
    ? errorCodeOf(boardQuery.error)
    : !board
      ? initialErrorCode
      : null;
  const mutationErrorCode = createMutation.error
    ? errorCodeOf(createMutation.error)
    : null;
  const errors = form.formState.errors;

  return (
    <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
      <div className="mx-auto grid max-w-xl gap-4">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับหน้าหลัก"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href="/app"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {board?.className ?? "ชั้นเรียน"}
            </p>
            <h1 className="text-2xl font-bold">กลุ่มในชั้นเรียน</h1>
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
                ข้อมูลกลุ่มอาจไม่เป็นปัจจุบัน สร้างกลุ่มได้เมื่อกลับมาออนไลน์
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
          <BoardErrorPanel
            code={boardErrorCode}
            onRetry={() => void boardQuery.refetch()}
            retrying={boardQuery.isFetching}
          />
        ) : null}

        {board ? (
          <>
            <BoardFreshness
              isFetching={boardQuery.isFetching}
              realtime={realtime}
              updatedAt={boardQuery.dataUpdatedAt}
            />

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

            <BoardSummary board={board} />

            {board.viewer.pendingInvitations.length ? (
              <section
                aria-labelledby="board-invitations-heading"
                className="border-border bg-card rounded-xl border p-4"
              >
                <h2 className="font-semibold" id="board-invitations-heading">
                  คำเชิญที่ได้รับ ({board.viewer.pendingInvitations.length})
                </h2>
                <ul className="divide-border mt-2 divide-y">
                  {board.viewer.pendingInvitations.map((invitation) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                      key={invitation.id}
                    >
                      <div className="min-w-0">
                        <p className="font-medium break-words">
                          {invitation.groupName}
                        </p>
                        <p className="text-muted-foreground text-[13px]">
                          {invitation.inviterName} เชิญคุณ · หมดอายุ{" "}
                          {new Date(invitation.expiresAt).toLocaleString(
                            "th-TH",
                            { dateStyle: "medium", timeStyle: "short" },
                          )}
                        </p>
                      </div>
                      <Link
                        aria-label={`ดูคำเชิญจาก ${invitation.groupName}`}
                        className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold"
                        href={`/group-invitations/${invitation.id}`}
                      >
                        ดูคำเชิญ
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {mutationErrorCode === "GROUP_LIMIT_REACHED" ? (
              <section
                className="flex gap-3 rounded-xl border border-[#BFD0F5] bg-[#EEF3FF] p-4 text-sm text-[#1E3A8A]"
                role="alert"
              >
                <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">กลุ่มสุดท้ายเพิ่งถูกสร้างพอดี</p>
                  <p className="mt-1 leading-6">
                    ตอนนี้มีครบ {board.maximumGroups} กลุ่มแล้ว —
                    คุณเข้าร่วมกลุ่มที่ยังว่างได้เลย
                    รอหัวหน้ากลุ่มส่งคำเชิญมาให้
                  </p>
                </div>
              </section>
            ) : null}

            {mutationErrorCode &&
            mutationErrorCode !== "GROUP_LIMIT_REACHED" ? (
              <section
                className="border-border bg-card rounded-xl border p-4 text-sm"
                role="alert"
              >
                <p className="font-semibold">
                  {mutationErrorCode === "NETWORK"
                    ? "ส่งคำขอสร้างกลุ่มไม่สำเร็จ"
                    : GROUP_ERROR_PRESENTATIONS[mutationErrorCode].title}
                </p>
                <p className="text-muted-foreground mt-1 leading-6">
                  {mutationErrorCode === "NETWORK"
                    ? "ยังไม่มีการจองช่องกลุ่ม ลองใหม่เมื่อสัญญาณดีขึ้น"
                    : GROUP_ERROR_PRESENTATIONS[mutationErrorCode].description}
                </p>
              </section>
            ) : null}

            {created ? (
              <section
                className="border-success/30 bg-success/10 flex gap-3 rounded-xl border p-4 text-sm"
                role="status"
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="text-success mt-0.5 size-5 shrink-0"
                />
                <div>
                  <p className="font-semibold">
                    สร้างกลุ่ม {created.group.name} แล้ว
                  </p>
                  <p className="mt-1 leading-6">คุณเป็นหัวหน้ากลุ่มนี้</p>
                </div>
              </section>
            ) : null}

            <section aria-labelledby="groups-heading" className="grid gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold" id="groups-heading">
                  กลุ่มทั้งหมด
                </h2>
                <span className="text-muted-foreground text-sm">
                  {board.groups.length} กลุ่ม
                </span>
              </div>
              {board.groups.length ? (
                <ul className="grid gap-3">
                  {board.groups.map((group) => (
                    <GroupCard
                      classId={board.classId}
                      group={group}
                      isMine={group.id === board.viewer.currentGroupId}
                      key={group.id}
                    />
                  ))}
                </ul>
              ) : (
                <p className="border-border bg-card rounded-xl border p-4 text-sm leading-6">
                  ยังไม่มีกลุ่มในชั้นเรียนนี้
                  {board.viewer.canCreateGroup ? " คุณสร้างกลุ่มแรกได้เลย" : ""}
                </p>
              )}
            </section>

            <section
              aria-labelledby="unassigned-heading"
              className="border-border bg-card rounded-xl border p-4"
            >
              <h2 className="font-semibold" id="unassigned-heading">
                ยังไม่มีกลุ่ม ({board.unassignedStudents.length} คน)
              </h2>
              {board.unassignedStudents.length ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {board.unassignedStudents.map((student) => (
                    <li
                      className="border-border rounded-full border px-3 py-1 text-[13px]"
                      key={student.id}
                    >
                      {student.displayName}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-1 text-sm">
                  นักเรียนทุกคนมีกลุ่มแล้ว
                </p>
              )}
            </section>

            {board.viewer.role === "student" ? (
              <section
                aria-labelledby="create-group-heading"
                className="border-border bg-background sticky bottom-0 -mx-4 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mx-0 sm:mb-4 sm:rounded-xl sm:border"
              >
                <h2 className="sr-only" id="create-group-heading">
                  สร้างกลุ่ม
                </h2>
                {formOpen &&
                (board.viewer.canCreateGroup || createMutation.isPending) ? (
                  <form
                    className="grid gap-3"
                    noValidate
                    onSubmit={form.handleSubmit((values) =>
                      createMutation.mutate(values),
                    )}
                  >
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium">ชื่อกลุ่ม</span>
                      <input
                        aria-invalid={Boolean(errors.name)}
                        autoComplete="off"
                        className="border-border bg-card min-h-12 rounded-[10px] border px-3 text-base"
                        maxLength={GROUP_NAME_MAX_LENGTH}
                        {...form.register("name")}
                      />
                    </label>
                    {errors.name ? (
                      <p className="text-[13px] text-[#B3261E]" role="alert">
                        {errors.name.message}
                      </p>
                    ) : null}
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium">
                        คำอธิบาย (ไม่บังคับ)
                      </span>
                      <textarea
                        className="border-border bg-card rounded-[10px] border px-3 py-2 text-base"
                        maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
                        rows={2}
                        {...form.register("description")}
                      />
                    </label>
                    {errors.description ? (
                      <p className="text-[13px] text-[#B3261E]" role="alert">
                        {errors.description.message}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        disabled={createMutation.isPending}
                        onClick={() => setFormOpen(false)}
                        variant="outline"
                      >
                        ยกเลิก
                      </Button>
                      <Button
                        disabled={createMutation.isPending || !online}
                        type="submit"
                      >
                        {createMutation.isPending ? (
                          <Loader2
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : null}
                        สร้างกลุ่ม
                      </Button>
                    </div>
                  </form>
                ) : (
                  <CreateGroupAction
                    board={board}
                    online={online}
                    onOpen={() => {
                      createMutation.reset();
                      setCreated(null);
                      setFormOpen(true);
                    }}
                  />
                )}
              </section>
            ) : (
              <p className="text-muted-foreground pb-4 text-sm">
                มุมมองครู · อ่านอย่างเดียว
              </p>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}

function BoardSummary({ board }: { board: GroupBoard }) {
  const currentGroup = board.groups.find(
    (group) => group.id === board.viewer.currentGroupId,
  );
  const chipClassName =
    "border-border bg-background inline-flex min-h-7 items-center rounded-full border px-2.5 text-[13px] font-medium";

  return (
    <section className="border-border bg-card rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={chipClassName}>
          {board.formationStatus === "open"
            ? "การจัดกลุ่มเปิดอยู่"
            : "ปิดการจัดกลุ่มแล้ว"}
        </span>
        <span
          className={cn(
            chipClassName,
            board.remainingGroupSlots > 0 &&
              "border-primary text-secondary-foreground bg-secondary",
          )}
        >
          เหลือ {board.remainingGroupSlots} กลุ่ม
        </span>
        {board.viewer.role === "student" ? (
          <span className={chipClassName}>
            {currentGroup
              ? `คุณอยู่ใน ${currentGroup.name}`
              : board.viewer.currentGroupId
                ? "คุณอยู่ในกลุ่มแล้ว"
                : "คุณยังไม่มีกลุ่ม"}
          </span>
        ) : null}
        {board.viewer.isLeader ? (
          <span className={cn(chipClassName, "gap-1")}>
            <Crown aria-hidden="true" className="size-3.5" />
            คุณเป็นหัวหน้ากลุ่ม
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-3 text-sm leading-6">
        กลุ่มละ {board.minimumGroupSize}–{board.maximumGroupSize} คน ·
        สร้างได้สูงสุด {board.maximumGroups} กลุ่ม · สร้างแล้ว{" "}
        {board.currentGroupCount} กลุ่ม
      </p>
    </section>
  );
}

function CreateGroupAction({
  board,
  online,
  onOpen,
}: {
  board: GroupBoard;
  online: boolean;
  onOpen: () => void;
}) {
  const canCreate = board.viewer.canCreateGroup && online;
  const reason = !online
    ? "สร้างไม่ได้ขณะออฟไลน์ ต้องเชื่อมต่อเพื่อจองช่องกลุ่ม"
    : board.viewer.cannotCreateReason
      ? cannotCreateMessage(board.viewer.cannotCreateReason, board)
      : null;

  return (
    <>
      <Button
        aria-describedby="create-group-reason"
        className="disabled:bg-muted disabled:text-muted-foreground disabled:border-border w-full disabled:border disabled:opacity-100"
        disabled={!canCreate}
        onClick={onOpen}
        size="lg"
      >
        <Plus aria-hidden="true" className="size-5" />
        สร้างกลุ่มของฉัน
      </Button>
      <p
        className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[13px] leading-5"
        id="create-group-reason"
      >
        {reason ? (
          <>
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>{reason}</span>
          </>
        ) : (
          "คุณสร้างกลุ่มได้ 1 กลุ่มต่อหนึ่งชั้นเรียน และจะเป็นหัวหน้ากลุ่ม"
        )}
      </p>
    </>
  );
}
