"use client";

import { useMutation } from "@tanstack/react-query";
import { CircleAlert, GraduationCap, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";

import { adminErrorOf, adminPost, formatAdminDate } from "../client";
import {
  TEACHER_INVITE_PROBLEMS,
  acceptedTeacherInviteSchema,
  teacherInviteProblemOf,
  type TeacherInviteProblem,
} from "./contracts";

export interface TeacherInvitePreview {
  schoolName: string;
  email: string;
  expiresAt: string;
}

/** The invited teacher confirms the school and accepts once. */
export function TeacherInviteScreen({
  token,
  preview,
  problem,
}: {
  token: string;
  preview: TeacherInvitePreview | null;
  problem: TeacherInviteProblem | null;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const mutation = useMutation({
    mutationFn: () =>
      adminPost(
        "/api/teacher-invitations/accept",
        { token },
        acceptedTeacherInviteSchema,
      ),
    onSuccess: () => {
      router.replace("/app");
      router.refresh();
    },
  });
  const failure = mutation.isError ? adminErrorOf(mutation.error) : null;
  const shownProblem =
    problem ??
    (failure && failure.code !== "NETWORK"
      ? teacherInviteProblemOf(failure.code)
      : null);

  if (shownProblem || !preview) {
    const code = shownProblem ?? "TEACHER_INVITE_INVALID";
    const copy = TEACHER_INVITE_PROBLEMS[code];
    return (
      <main className="bg-background min-h-dvh px-4 pt-5">
        <section
          className="border-border bg-card mx-auto grid max-w-md gap-2 rounded-xl border p-4"
          data-error-code={code}
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
          <h1 className="font-semibold">{copy.title}</h1>
          <p className="text-muted-foreground text-sm leading-6">
            {copy.description}
          </p>
          <Link
            className="border-border mt-1 inline-flex min-h-11 items-center justify-center rounded-full border px-5 text-sm font-semibold"
            href="/app"
          >
            กลับหน้าหลัก
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="bg-background min-h-dvh px-4 pt-5">
      <section
        aria-labelledby="teacher-invite-title"
        className="border-border bg-card mx-auto grid max-w-md gap-3 rounded-xl border p-4"
      >
        <GraduationCap aria-hidden="true" className="size-6 text-[#1F5C3A]" />
        <h1 className="text-lg font-semibold" id="teacher-invite-title">
          รับสิทธิ์ครูที่ {preview.schoolName}
        </h1>
        <p className="text-sm leading-6">
          คำเชิญนี้สำหรับ <span className="font-medium">{preview.email}</span> ·
          ใช้ได้ถึง {formatAdminDate(preview.expiresAt)}
        </p>
        <p className="text-muted-foreground text-sm leading-6">
          เมื่อรับแล้ว บัญชีนี้จะเป็นบัญชีครูของโรงเรียนนี้ และสร้างห้องเรียนได้
        </p>
        {failure?.code === "NETWORK" ? (
          <p className="text-sm text-[#8C1D18]" role="alert">
            {failure.message}
          </p>
        ) : null}
        {!online ? (
          <p className="text-sm" role="status">
            ออฟไลน์อยู่ · รับคำเชิญได้เมื่อกลับมาออนไลน์
          </p>
        ) : null}
        <Button
          disabled={!online || mutation.isPending}
          onClick={() => mutation.mutate()}
          size="lg"
        >
          {mutation.isPending ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          รับคำเชิญเป็นครู
        </Button>
      </section>
    </main>
  );
}
