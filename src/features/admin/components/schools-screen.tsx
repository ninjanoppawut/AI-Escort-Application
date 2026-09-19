"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus, School } from "lucide-react";
import Link from "next/link";
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
  adminPageSchema,
  adminSchoolSchema,
  createSchoolSchema,
} from "../directory-contracts";
import { AdminListStatus, FilterChips, LoadMore } from "./admin-list-states";

const STATUS_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "active", label: "ใช้งาน" },
  { value: "archived", label: "เก็บถาวร" },
] as const;

type StatusOption = (typeof STATUS_OPTIONS)[number]["value"];

const pageSchema = adminPageSchema(adminSchoolSchema);

/** S-admin Schools (ADM-002/ADM-012): list, filter, and create schools. */
export function SchoolsScreen() {
  const [status, setStatus] = useState<StatusOption>("all");
  const statusFilter = status === "all" ? null : status;
  const query = useInfiniteQuery({
    queryKey: adminDirectoryKeys.schools(statusFilter),
    queryFn: ({ pageParam }) =>
      adminGet(
        withQuery("/api/admin/schools", {
          status: statusFilter,
          cursor: pageParam,
        }),
        pageSchema,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
  const schools = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="grid gap-4">
      <CreateSchoolForm />
      <section aria-labelledby="schools-list-title" className="grid gap-3">
        <h2 className="font-semibold" id="schools-list-title">
          โรงเรียน
        </h2>
        <FilterChips
          label="สถานะโรงเรียน"
          onChange={setStatus}
          options={STATUS_OPTIONS}
          value={status}
        />
        <AdminListStatus
          empty={schools.length === 0}
          emptyText="ยังไม่มีโรงเรียนในตัวกรองนี้"
          error={query.isError ? adminErrorOf(query.error) : null}
          onRestart={() => void query.refetch()}
          onRetry={() => void query.refetch()}
          pending={query.isPending}
        />
        {schools.length > 0 ? (
          <ul className="grid gap-2" data-admin-schools={schools.length}>
            {schools.map((school) => (
              <li key={school.id}>
                <Link
                  className="border-border bg-card grid gap-1 rounded-xl border p-3"
                  data-school-status={school.status}
                  href={`/admin/schools/${school.id}`}
                >
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    <School aria-hidden="true" className="size-4" />
                    {school.name}
                    {school.status === "archived" ? (
                      <span className="rounded-full border px-2 text-[12px] font-medium">
                        เก็บถาวร
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-[13px] leading-5">
                    ครู {school.teacherCount} · นักเรียน {school.studentCount} ·
                    ห้องเรียน {school.classCount} · คำเชิญที่รอ{" "}
                    {school.pendingInvitationCount} · สร้าง{" "}
                    {formatAdminDate(school.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <LoadMore
          hasMore={Boolean(query.hasNextPage)}
          loading={query.isFetchingNextPage}
          onLoad={() => void query.fetchNextPage()}
        />
      </section>
    </div>
  );
}

function CreateSchoolForm() {
  const queryClient = useQueryClient();
  const form = useForm<z.input<typeof createSchoolSchema>>({
    resolver: zodResolver(createSchoolSchema),
    defaultValues: { name: "" },
  });
  const [created, setCreated] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof createSchoolSchema>) =>
      adminPost("/api/admin/schools", values, adminSchoolSchema),
    onSuccess: (school) => {
      setCreated(school.name);
      form.reset({ name: "" });
      void queryClient.invalidateQueries({ queryKey: ["admin", "schools"] });
    },
  });
  const failure = mutation.isError ? adminErrorOf(mutation.error) : null;

  return (
    <form
      aria-labelledby="create-school-title"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        setCreated(null);
        mutation.mutate(values);
      })}
    >
      <h2 className="font-semibold" id="create-school-title">
        เพิ่มโรงเรียน
      </h2>
      <label className="grid gap-1 text-sm font-medium">
        ชื่อโรงเรียน
        <input
          aria-invalid={Boolean(form.formState.errors.name) || undefined}
          className="border-border min-h-11 rounded-[10px] border px-3"
          {...form.register("name")}
        />
      </label>
      {form.formState.errors.name ? (
        <p className="text-sm text-[#8C1D18]" role="alert">
          {form.formState.errors.name.message}
        </p>
      ) : null}
      {failure ? (
        <p
          className="text-sm text-[#8C1D18]"
          data-admin-error={failure.code}
          role="alert"
        >
          {failure.message}
        </p>
      ) : null}
      {created ? (
        <p className="text-sm text-[#14472F]" role="status">
          เพิ่ม “{created}” แล้ว
        </p>
      ) : null}
      <Button disabled={mutation.isPending} size="lg" type="submit">
        <Plus aria-hidden="true" className="size-4" />
        {mutation.isPending ? "กำลังเพิ่ม..." : "เพิ่มโรงเรียน"}
      </Button>
    </form>
  );
}
