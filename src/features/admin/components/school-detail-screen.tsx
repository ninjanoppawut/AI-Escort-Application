"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Archive, Copy, MailPlus, XCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";

import {
  adminErrorOf,
  adminGet,
  adminPost,
  formatAdminDate,
  withQuery,
} from "../client";
import {
  adminDirectoryKeys,
  adminInvitationSchema,
  adminPageSchema,
  adminSchoolSchema,
  archivedSchoolSchema,
  issueInvitationSchema,
  issuedInvitationSchema,
  reasonSchema,
  revokedInvitationSchema,
  type AdminInvitation,
  type AdminSchool,
  type IssuedInvitation,
} from "../directory-contracts";
import { AdminListStatus, LoadMore } from "./admin-list-states";

const invitationPageSchema = adminPageSchema(adminInvitationSchema);

const INVITATION_STATUS_LABELS: Record<AdminInvitation["status"], string> = {
  pending: "รอตอบรับ",
  accepted: "ตอบรับแล้ว",
  revoked: "ยกเลิกแล้ว",
  expired: "หมดอายุ",
};

/**
 * S-admin School detail (ADM-002): summary, teacher invitations (issue,
 * one-time link, revoke), and archive. Invalidation always refetches from the
 * server; nothing is updated optimistically.
 */
export function SchoolDetailScreen({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient();
  const school = useQuery({
    queryKey: adminDirectoryKeys.school(schoolId),
    queryFn: () =>
      adminGet(`/api/admin/schools/${schoolId}`, adminSchoolSchema),
    retry: false,
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin"] });

  if (school.isPending || school.isError) {
    return (
      <AdminListStatus
        empty={false}
        emptyText=""
        error={school.isError ? adminErrorOf(school.error) : null}
        onRestart={() => void school.refetch()}
        onRetry={() => void school.refetch()}
        pending={school.isPending}
      />
    );
  }

  const data = school.data;
  return (
    <div className="grid gap-4" data-school-status={data.status}>
      <section className="border-border bg-card grid gap-1 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{data.name}</h2>
        <p className="text-muted-foreground text-sm leading-6">
          {data.status === "archived" ? "เก็บถาวรแล้ว · " : ""}ครู{" "}
          {data.teacherCount} · นักเรียน {data.studentCount} · ห้องเรียน{" "}
          {data.classCount} · สร้าง {formatAdminDate(data.createdAt)}
        </p>
      </section>
      {data.status === "active" ? (
        <IssueInvitationForm onIssued={refresh} schoolId={schoolId} />
      ) : null}
      <InvitationList onChanged={refresh} schoolId={schoolId} />
      {data.status === "active" ? (
        <ArchiveSchool onArchived={refresh} school={data} />
      ) : null}
    </div>
  );
}

function IssueInvitationForm({
  schoolId,
  onIssued,
}: {
  schoolId: string;
  onIssued: () => void;
}) {
  const form = useForm<
    z.input<typeof issueInvitationSchema>,
    unknown,
    z.output<typeof issueInvitationSchema>
  >({
    resolver: zodResolver(issueInvitationSchema),
    defaultValues: { email: "", expiresInDays: 7 },
  });
  const [issued, setIssued] = useState<
    (IssuedInvitation & { email: string }) | null
  >(null);
  const [copied, setCopied] = useState(false);
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof issueInvitationSchema>) =>
      adminPost(
        `/api/admin/schools/${schoolId}/teacher-invitations`,
        values,
        issuedInvitationSchema,
      ).then((result) => ({ ...result, email: values.email })),
    onSuccess: (result) => {
      setIssued(result);
      setCopied(false);
      form.reset({ email: "", expiresInDays: 7 });
      onIssued();
    },
  });
  const failure = mutation.isError ? adminErrorOf(mutation.error) : null;
  const link = issued
    ? `${window.location.origin}/teacher-invite/${issued.token}`
    : null;

  return (
    <form
      aria-labelledby="issue-invite-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        setIssued(null);
        mutation.mutate(values);
      })}
    >
      <h2 className="font-semibold" id="issue-invite-title">
        เชิญครู
      </h2>
      <label className="grid gap-1 text-sm font-medium">
        อีเมลครู
        <input
          aria-invalid={Boolean(form.formState.errors.email) || undefined}
          autoComplete="off"
          className="border-border min-h-11 rounded-[10px] border px-3"
          inputMode="email"
          type="email"
          {...form.register("email")}
        />
      </label>
      {form.formState.errors.email ? (
        <p className="text-sm text-[#8C1D18]" role="alert">
          {form.formState.errors.email.message}
        </p>
      ) : null}
      <label className="grid gap-1 text-sm font-medium">
        ใช้ได้ภายใน
        <select
          className="border-border min-h-11 rounded-[10px] border px-3"
          {...form.register("expiresInDays")}
        >
          <option value={3}>3 วัน</option>
          <option value={7}>7 วัน</option>
          <option value={14}>14 วัน</option>
          <option value={30}>30 วัน</option>
        </select>
      </label>
      {failure ? (
        <p
          className="text-sm text-[#8C1D18]"
          data-admin-error={failure.code}
          role="alert"
        >
          {failure.message}
        </p>
      ) : null}
      {issued && link ? (
        <div
          className="grid gap-2 rounded-xl border border-[#9CC5AE] bg-[#EAF4EE] p-3 text-sm"
          data-invite-issued=""
          role="status"
        >
          <p className="font-semibold text-[#14472F]">
            สร้างคำเชิญสำหรับ {issued.email} แล้ว
          </p>
          <p className="leading-6">
            ส่งลิงก์นี้ให้ครูทางช่องทางที่ปลอดภัย ลิงก์แสดงครั้งเดียว
            ใช้ได้กับอีเมลนี้เท่านั้น และหมดอายุ{" "}
            {formatAdminDate(issued.expiresAt)}
          </p>
          <code
            className="block rounded-md bg-white px-3 py-2 font-mono text-[13px] break-all"
            data-invite-link=""
          >
            {link}
          </code>
          <Button
            onClick={() => {
              void navigator.clipboard
                ?.writeText(link)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
            size="lg"
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" className="size-4" />
            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
          </Button>
        </div>
      ) : null}
      <Button disabled={mutation.isPending} size="lg" type="submit">
        <MailPlus aria-hidden="true" className="size-4" />
        {mutation.isPending ? "กำลังสร้าง..." : "สร้างคำเชิญ"}
      </Button>
    </form>
  );
}

function InvitationList({
  schoolId,
  onChanged,
}: {
  schoolId: string;
  onChanged: () => void;
}) {
  const query = useInfiniteQuery({
    queryKey: adminDirectoryKeys.invitations(schoolId),
    queryFn: ({ pageParam }) =>
      adminGet(
        withQuery(`/api/admin/schools/${schoolId}/teacher-invitations`, {
          cursor: pageParam,
        }),
        invitationPageSchema,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
  const invitations = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="invitations-title" className="grid gap-3">
      <h2 className="font-semibold" id="invitations-title">
        คำเชิญครู
      </h2>
      <AdminListStatus
        empty={invitations.length === 0}
        emptyText="ยังไม่มีคำเชิญ"
        error={query.isError ? adminErrorOf(query.error) : null}
        onRestart={() => void query.refetch()}
        onRetry={() => void query.refetch()}
        pending={query.isPending}
      />
      {invitations.length > 0 ? (
        <ul className="grid gap-2">
          {invitations.map((invitation) => (
            <InvitationRow
              invitation={invitation}
              key={invitation.id}
              onChanged={onChanged}
            />
          ))}
        </ul>
      ) : null}
      <LoadMore
        hasMore={Boolean(query.hasNextPage)}
        loading={query.isFetchingNextPage}
        onLoad={() => void query.fetchNextPage()}
      />
    </section>
  );
}

function InvitationRow({
  invitation,
  onChanged,
}: {
  invitation: AdminInvitation;
  onChanged: () => void;
}) {
  const [revoking, setRevoking] = useState(false);
  return (
    <li
      className="border-border bg-card grid gap-2 rounded-xl border p-3 text-sm"
      data-invitation-status={invitation.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium break-all">{invitation.email}</span>
        <span className="rounded-full border px-2 text-[12px] font-medium">
          {INVITATION_STATUS_LABELS[invitation.status]}
        </span>
      </div>
      <p className="text-muted-foreground text-[13px]">
        สร้าง {formatAdminDate(invitation.createdAt)} · หมดอายุ{" "}
        {formatAdminDate(invitation.expiresAt)}
      </p>
      {invitation.status === "pending" && !revoking ? (
        <Button
          onClick={() => setRevoking(true)}
          size="lg"
          type="button"
          variant="outline"
        >
          <XCircle aria-hidden="true" className="size-4" />
          ยกเลิกคำเชิญ
        </Button>
      ) : null}
      {revoking ? (
        <ReasonForm
          cancelLabel="ไม่ยกเลิก"
          label="เหตุผลที่ยกเลิก"
          onCancel={() => setRevoking(false)}
          onDone={() => {
            setRevoking(false);
            onChanged();
          }}
          submitLabel="ยืนยันยกเลิกคำเชิญ"
          url={`/api/admin/teacher-invitations/${invitation.id}/revoke`}
          resultSchema={revokedInvitationSchema}
        />
      ) : null}
    </li>
  );
}

function ArchiveSchool({
  school,
  onArchived,
}: {
  school: AdminSchool;
  onArchived: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby="archive-school-title"
      className="grid gap-3 rounded-xl border border-[#F2B8B5] p-4"
    >
      <h2 className="font-semibold" id="archive-school-title">
        เก็บโรงเรียนถาวร
      </h2>
      <p className="text-muted-foreground text-sm leading-6">
        เชิญครูใหม่ไม่ได้อีก และคำเชิญที่รออยู่จะถูกยกเลิก ข้อมูลเดิมยังอยู่
      </p>
      {open ? (
        <ReasonForm
          cancelLabel="ไม่เก็บถาวร"
          label={`เหตุผลที่เก็บ “${school.name}” ถาวร`}
          onCancel={() => setOpen(false)}
          onDone={onArchived}
          resultSchema={archivedSchoolSchema}
          submitLabel="ยืนยันเก็บถาวร"
          url={`/api/admin/schools/${school.id}/archive`}
        />
      ) : (
        <Button
          onClick={() => setOpen(true)}
          size="lg"
          type="button"
          variant="outline"
        >
          <Archive aria-hidden="true" className="size-4" />
          เก็บถาวร
        </Button>
      )}
    </section>
  );
}

function ReasonForm<T extends z.ZodType>({
  url,
  label,
  submitLabel,
  cancelLabel,
  resultSchema,
  onDone,
  onCancel,
}: {
  url: string;
  label: string;
  submitLabel: string;
  cancelLabel: string;
  resultSchema: T;
  onDone: () => void;
  onCancel: () => void;
}) {
  const form = useForm<z.input<typeof reasonSchema>>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof reasonSchema>) =>
      adminPost(url, values, resultSchema),
    onSuccess: onDone,
  });
  const failure = mutation.isError ? adminErrorOf(mutation.error) : null;
  return (
    <form
      className="grid gap-2"
      noValidate
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <label className="grid gap-1 text-sm font-medium">
        {label}
        <textarea
          aria-invalid={Boolean(form.formState.errors.reason) || undefined}
          className="border-border min-h-20 rounded-[10px] border px-3 py-2"
          {...form.register("reason")}
        />
      </label>
      {form.formState.errors.reason || failure ? (
        <p
          className="text-sm text-[#8C1D18]"
          data-admin-error={failure?.code}
          role="alert"
        >
          {form.formState.errors.reason?.message ?? failure?.message}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button disabled={mutation.isPending} size="lg" type="submit">
          {submitLabel}
        </Button>
        <Button onClick={onCancel} size="lg" type="button" variant="outline">
          {cancelLabel}
        </Button>
      </div>
    </form>
  );
}
