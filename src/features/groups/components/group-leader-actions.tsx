"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Crown, Info, Loader2, UserMinus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { groupQueryKeys } from "../board";
import {
  groupErrorCodeOf,
  postGroupJson,
  presentGroupError,
  readGroupEnvelope,
} from "../client/request";
import type { GroupDetail } from "../invitations";
import type {
  MarkGroupReadyResult,
  RemoveGroupMemberResult,
  TransferLeadershipResult,
} from "../leadership";

function readyReason(detail: GroupDetail) {
  if (detail.status === "ready") return "แจ้งครูแล้ว · รอครูตรวจและอนุมัติ";
  if (detail.status === "approved") return "ครูอนุมัติกลุ่มแล้ว";
  if (detail.formationStatus !== "open") return "ครูปิดการจัดกลุ่มแล้ว";
  if (!detail.meetsMinimumSize) {
    return `ต้องมีสมาชิกอย่างน้อย ${detail.minimumSize} คนก่อนแจ้งครู`;
  }
  return null;
}

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  const presentation = presentGroupError(groupErrorCodeOf(error));
  return (
    <p
      className="border-border bg-background mt-3 rounded-lg border p-3 text-sm"
      role="alert"
    >
      <span className="font-semibold">{presentation.title}</span>{" "}
      {presentation.description}
    </p>
  );
}

export function GroupLeaderActions({
  detail,
  online,
}: {
  detail: GroupDetail;
  online: boolean;
}) {
  const queryClient = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);
  const [successorId, setSuccessorId] = useState<string | null>(null);
  const [transferConfirming, setTransferConfirming] = useState(false);
  const [removeCandidateId, setRemoveCandidateId] = useState<string | null>(
    null,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });

  const readyMutation = useMutation({
    mutationFn: () =>
      postGroupJson<MarkGroupReadyResult>(`/api/groups/${detail.id}/ready`),
    onSettled: invalidate,
  });

  const transferMutation = useMutation({
    mutationFn: (newLeaderId: string) =>
      postGroupJson<TransferLeadershipResult>(
        `/api/groups/${detail.id}/transfer-leadership`,
        { newLeaderId },
      ),
    onSuccess: () => {
      setTransferOpen(false);
      setTransferConfirming(false);
      setSuccessorId(null);
    },
    onSettled: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (studentId: string) =>
      readGroupEnvelope<RemoveGroupMemberResult>(
        await fetch(`/api/groups/${detail.id}/members/${studentId}`, {
          method: "DELETE",
        }),
      ),
    onSuccess: () => setRemoveCandidateId(null),
    onSettled: invalidate,
  });

  const otherMembers = detail.members.filter(
    (member) => member.role === "member",
  );
  const successor = otherMembers.find((member) => member.id === successorId);
  const removeCandidate = otherMembers.find(
    (member) => member.id === removeCandidateId,
  );
  const reason = readyReason(detail);
  const canMarkReady = detail.status === "forming" && reason === null;
  const formationOpen = detail.formationStatus === "open";

  return (
    <section
      aria-labelledby="leader-actions-heading"
      className="border-border bg-card grid gap-4 rounded-xl border p-4"
    >
      <h2 className="font-semibold" id="leader-actions-heading">
        จัดการกลุ่ม (หัวหน้ากลุ่ม)
      </h2>

      <div>
        <Button
          aria-describedby="ready-reason"
          className="disabled:bg-muted disabled:text-muted-foreground disabled:border-border w-full disabled:border disabled:opacity-100"
          disabled={!canMarkReady || !online || readyMutation.isPending}
          onClick={() => readyMutation.mutate()}
        >
          {readyMutation.isPending ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <BadgeCheck aria-hidden="true" className="size-4" />
          )}
          แจ้งครูว่ากลุ่มพร้อมแล้ว
        </Button>
        <p
          className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[13px] leading-5"
          id="ready-reason"
        >
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {reason ?? "ครูจะได้รับการแจ้งเตือนให้ตรวจและอนุมัติกลุ่ม"}
        </p>
        <ErrorLine error={readyMutation.error} />
      </div>

      <div>
        <h3 className="text-sm font-semibold">นำสมาชิกออก</h3>
        {otherMembers.length ? (
          <ul className="divide-border mt-1 divide-y">
            {otherMembers.map((member) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 py-2"
                key={member.id}
              >
                <span className="font-medium break-words">
                  {member.displayName}
                </span>
                <Button
                  aria-label={`นำ ${member.displayName} ออกจากกลุ่ม`}
                  disabled={
                    !formationOpen || !online || removeMutation.isPending
                  }
                  onClick={() => setRemoveCandidateId(member.id)}
                  size="sm"
                  variant="outline"
                >
                  <UserMinus aria-hidden="true" className="size-4" />
                  นำออก
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-1 text-sm">
            ยังไม่มีสมาชิกคนอื่นในกลุ่ม
          </p>
        )}
        {!formationOpen && otherMembers.length ? (
          <p className="text-muted-foreground mt-1 text-[13px]">
            ครูปิดการจัดกลุ่มแล้ว จึงนำสมาชิกออกไม่ได้
          </p>
        ) : null}
        {removeCandidate ? (
          <div
            className="border-border bg-background mt-2 rounded-lg border p-3"
            role="alertdialog"
            aria-labelledby="remove-confirm-title"
          >
            <p className="font-semibold" id="remove-confirm-title">
              นำ {removeCandidate.displayName} ออกจากกลุ่ม?
            </p>
            <p className="text-muted-foreground mt-1 text-[13px] leading-5">
              {removeCandidate.displayName} จะกลับไปเป็นนักเรียนที่ยังไม่มีกลุ่ม
              และต้องได้รับคำเชิญใหม่จึงจะกลับเข้ากลุ่มได้
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                disabled={removeMutation.isPending}
                onClick={() => setRemoveCandidateId(null)}
                variant="outline"
              >
                ยกเลิก
              </Button>
              <Button
                disabled={!online || removeMutation.isPending}
                onClick={() => removeMutation.mutate(removeCandidate.id)}
              >
                นำ {removeCandidate.displayName} ออก
              </Button>
            </div>
          </div>
        ) : null}
        <ErrorLine error={removeMutation.error} />
      </div>

      <div>
        <h3 className="text-sm font-semibold">โอนหัวหน้ากลุ่ม</h3>
        {!otherMembers.length ? (
          <p className="text-muted-foreground mt-1 text-sm">
            ยังไม่มีสมาชิกคนอื่นให้โอนหัวหน้ากลุ่ม
          </p>
        ) : !transferOpen ? (
          <Button
            className="mt-2"
            disabled={!online}
            onClick={() => {
              transferMutation.reset();
              setTransferOpen(true);
            }}
            variant="outline"
          >
            <Crown aria-hidden="true" className="size-4" />
            เลือกหัวหน้าคนใหม่
          </Button>
        ) : transferConfirming && successor ? (
          <div
            className="border-border bg-background mt-2 rounded-lg border p-3"
            role="alertdialog"
            aria-labelledby="transfer-confirm-title"
          >
            <p className="font-semibold" id="transfer-confirm-title">
              ยืนยันโอนหัวหน้ากลุ่มให้ {successor.displayName}?
            </p>
            <p className="text-muted-foreground mt-1 text-[13px] leading-5">
              คุณจะกลายเป็นสมาชิก และย้อนกลับเองไม่ได้
              ต้องให้หัวหน้าคนใหม่โอนกลับหรือให้ครูเปลี่ยน
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                disabled={transferMutation.isPending}
                onClick={() => setTransferConfirming(false)}
                variant="outline"
              >
                ย้อนกลับ
              </Button>
              <Button
                disabled={!online || transferMutation.isPending}
                onClick={() => transferMutation.mutate(successor.id)}
              >
                โอนสิทธิ์หัวหน้า
              </Button>
            </div>
          </div>
        ) : (
          <fieldset className="mt-2">
            <legend className="text-muted-foreground text-[13px]">
              เลือกสมาชิกที่จะเป็นหัวหน้าคนใหม่
            </legend>
            <div className="mt-1 grid gap-1">
              {otherMembers.map((member) => (
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
                    name="successor"
                    onChange={() => setSuccessorId(member.id)}
                    type="radio"
                  />
                  {member.displayName}
                </label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                onClick={() => {
                  setTransferOpen(false);
                  setSuccessorId(null);
                }}
                variant="outline"
              >
                ยกเลิก
              </Button>
              <Button
                disabled={!successor}
                onClick={() => setTransferConfirming(true)}
              >
                ถัดไป
              </Button>
            </div>
          </fieldset>
        )}
        <ErrorLine error={transferMutation.error} />
      </div>
    </section>
  );
}
