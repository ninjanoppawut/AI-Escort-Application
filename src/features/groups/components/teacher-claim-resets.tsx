"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Info, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";

import { groupQueryKeys } from "../board";
import { postGroupJson } from "../client/request";
import type { CreationClaims, ResetClaimResult } from "../lifecycle";
import {
  claimGroupStateLabel,
  claimResetBlockedMessage,
  type CreationClaim,
} from "../teacher-actions";
import { TeacherErrorLine } from "./teacher-error-line";

const resetFormSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "ระบุเหตุผลการรีเซ็ตสิทธิ์")
    .max(1000, "เหตุผลยาวได้ไม่เกิน 1000 ตัวอักษร"),
});

type ResetFormInput = z.input<typeof resetFormSchema>;
type ResetFormOutput = z.output<typeof resetFormSchema>;

export function TeacherClaimResets({
  classId,
  claims,
  loadError,
  online,
  onRetry,
}: {
  classId: string;
  claims: CreationClaims | undefined;
  loadError: unknown;
  online: boolean;
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [pendingReason, setPendingReason] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    studentName: string;
    auditLogId: string;
  } | null>(null);

  const form = useForm<ResetFormInput, unknown, ResetFormOutput>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { reason: "" },
  });

  const mutation = useMutation({
    mutationFn: ({ claim, reason }: { claim: CreationClaim; reason: string }) =>
      postGroupJson<ResetClaimResult>(
        `/api/classes/${classId}/group-creation-claims/${claim.student.id}/reset`,
        { reason },
      ),
    onSuccess: (result, { claim }) => {
      setSuccess({
        studentName: claim.student.displayName,
        auditLogId: result.auditLogId,
      });
      setSelectedClaimId(null);
      setPendingReason(null);
      form.reset();
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: groupQueryKeys.all }),
  });

  const selected = claims?.claims.find(
    (claim) => claim.claimId === selectedClaimId,
  );
  const close = () => {
    mutation.reset();
    setSelectedClaimId(null);
    setPendingReason(null);
    form.reset();
  };

  return (
    <section
      aria-labelledby="claim-resets-heading"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
    >
      <div>
        <h2 className="font-semibold" id="claim-resets-heading">
          สิทธิ์สร้างกลุ่มของนักเรียน
        </h2>
        <p className="text-muted-foreground mt-1 text-[13px] leading-5">
          นักเรียนสร้างกลุ่มได้หนึ่งครั้งต่อชั้นเรียน การลบกลุ่มไม่คืนสิทธิ์
          ครูรีเซ็ตได้เมื่อจัดการกลุ่มเดิมแล้ว และทุกครั้งจะถูกบันทึกพร้อมเหตุผล
        </p>
      </div>

      {success ? (
        <div
          className="border-success/30 bg-success/10 flex gap-3 rounded-lg border p-3 text-sm"
          role="status"
        >
          <CheckCircle2
            aria-hidden="true"
            className="text-success mt-0.5 size-5 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-semibold">
              รีเซ็ตสิทธิ์สร้างกลุ่มของ {success.studentName} แล้ว
            </p>
            <p className="mt-1 leading-6">
              เลขอ้างอิงบันทึก{" "}
              <span className="font-mono text-[12px] break-all">
                {success.auditLogId}
              </span>
            </p>
          </div>
        </div>
      ) : null}

      {loadError && !claims ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 text-sm"
          role="alert"
        >
          <span>โหลดรายการสิทธิ์สร้างกลุ่มไม่สำเร็จ</span>
          <Button onClick={onRetry} size="sm" variant="outline">
            ลองใหม่
          </Button>
        </div>
      ) : !claims ? (
        <p
          className="text-muted-foreground flex items-center gap-2 text-sm"
          role="status"
        >
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          กำลังโหลดสิทธิ์สร้างกลุ่ม...
        </p>
      ) : claims.claims.length ? (
        <ul className="divide-border divide-y">
          {claims.claims.map((claim) => {
            const blocked = claimResetBlockedMessage(claim);
            const isSelected = claim.claimId === selectedClaimId;
            return (
              <li className="py-3" key={claim.claimId}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">
                      {claim.student.displayName}
                    </p>
                    <p className="text-muted-foreground text-[13px] leading-5">
                      กลุ่มที่สร้าง: {claim.groupName ?? "ไม่พบกลุ่ม"} ·{" "}
                      {claimGroupStateLabel(claim)}
                    </p>
                  </div>
                  <Button
                    aria-describedby={
                      blocked ? `claim-blocked-${claim.claimId}` : undefined
                    }
                    aria-label={`รีเซ็ตสิทธิ์ของ ${claim.student.displayName}`}
                    disabled={!claim.canReset || !online || isSelected}
                    onClick={() => {
                      mutation.reset();
                      setSuccess(null);
                      setPendingReason(null);
                      form.reset();
                      setSelectedClaimId(claim.claimId);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    รีเซ็ตสิทธิ์
                  </Button>
                </div>
                {blocked ? (
                  <p
                    className="text-muted-foreground mt-1 flex items-start gap-1.5 text-[13px] leading-5"
                    id={`claim-blocked-${claim.claimId}`}
                  >
                    <Info
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    {blocked}
                  </p>
                ) : null}

                {isSelected && selected && pendingReason === null ? (
                  <form
                    className="border-border bg-background mt-3 grid gap-2 rounded-lg border p-3"
                    noValidate
                    onSubmit={form.handleSubmit((values) =>
                      setPendingReason(values.reason),
                    )}
                  >
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium">
                        เหตุผลการรีเซ็ตสิทธิ์
                      </span>
                      <textarea
                        aria-invalid={Boolean(form.formState.errors.reason)}
                        className="border-border bg-card rounded-[10px] border px-3 py-2 text-base"
                        maxLength={1000}
                        rows={2}
                        {...form.register("reason")}
                      />
                    </label>
                    {form.formState.errors.reason ? (
                      <p className="text-[13px] text-[#B3261E]" role="alert">
                        {form.formState.errors.reason.message}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={close} variant="outline">
                        ยกเลิก
                      </Button>
                      <Button type="submit">ถัดไป</Button>
                    </div>
                  </form>
                ) : null}

                {isSelected && selected && pendingReason !== null ? (
                  <div
                    aria-labelledby="claim-reset-confirm-title"
                    className="border-border bg-background mt-3 rounded-lg border p-3"
                    role="alertdialog"
                  >
                    <p className="font-semibold" id="claim-reset-confirm-title">
                      รีเซ็ตสิทธิ์สร้างกลุ่มของ {selected.student.displayName}?
                    </p>
                    <p className="text-muted-foreground mt-1 text-[13px] leading-5">
                      {selected.student.displayName}{" "}
                      จะสร้างกลุ่มใหม่ได้อีกหนึ่งครั้ง · กลุ่มเดิม{" "}
                      {selected.groupName ?? "ไม่พบกลุ่ม"} ไม่เปลี่ยนแปลง ·
                      เหตุผลจะถูกบันทึกในประวัติการตรวจสอบ
                    </p>
                    <p className="mt-2 text-sm break-words">
                      เหตุผล: {pendingReason}
                    </p>
                    <TeacherErrorLine error={mutation.error} />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        disabled={mutation.isPending}
                        onClick={() => setPendingReason(null)}
                        variant="outline"
                      >
                        แก้เหตุผล
                      </Button>
                      <Button
                        disabled={mutation.isPending || !online}
                        onClick={() =>
                          mutation.mutate({
                            claim: selected,
                            reason: pendingReason,
                          })
                        }
                      >
                        {mutation.isPending ? (
                          <Loader2
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : null}
                        รีเซ็ตสิทธิ์
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          ยังไม่มีนักเรียนใช้สิทธิ์สร้างกลุ่มในชั้นเรียนนี้
        </p>
      )}
    </section>
  );
}
