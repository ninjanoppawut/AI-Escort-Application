"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FilePenLine,
  Loader2,
  MapPinned,
  Plus,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";

import {
  activityErrorCodeOf,
  fetchActivityJson,
  presentActivityError,
  sendActivityJson,
  type ActivityClientErrorCode,
} from "../client/request";
import {
  ACTIVITY_TITLE_MAX_LENGTH,
  activityListSchema,
  activityQueryKeys,
  type ActivityList,
} from "../contracts";
import type { ActivityUiErrorCode } from "../errors";
import type { SavedActivityDraft } from "../results";

const createFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "กรอกชื่อกิจกรรม")
    .max(
      ACTIVITY_TITLE_MAX_LENGTH,
      `ชื่อกิจกรรมยาวได้ไม่เกิน ${ACTIVITY_TITLE_MAX_LENGTH} ตัวอักษร`,
    ),
});

type CreateFormInput = z.input<typeof createFormSchema>;
type CreateFormOutput = z.output<typeof createFormSchema>;

const STATUS_LABELS: Record<ActivityList["items"][number]["status"], string> = {
  draft: "ฉบับร่าง",
  published: "เผยแพร่แล้ว",
  archived: "เก็บถาวร",
};

export function TeacherActivityList({
  classId,
  initialList,
  initialErrorCode,
}: {
  classId: string;
  initialList: ActivityList | null;
  initialErrorCode: ActivityUiErrorCode | null;
}) {
  const router = useRouter();
  const online = useOnlineStatus();

  const listQuery = useQuery({
    queryKey: activityQueryKeys.list(classId),
    queryFn: () =>
      fetchActivityJson(
        `/api/activities?classId=${classId}`,
        activityListSchema,
      ),
    ...(initialList ? { initialData: initialList } : {}),
    refetchOnWindowFocus: "always",
    retry: false,
  });

  const form = useForm<CreateFormInput, unknown, CreateFormOutput>({
    resolver: zodResolver(createFormSchema),
    defaultValues: { title: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateFormOutput) =>
      sendActivityJson<SavedActivityDraft>("POST", "/api/activities", {
        classId,
        title: values.title,
      }),
    onSuccess: (result) =>
      router.push(
        `/teacher/classes/${classId}/activities/${result.activityId}`,
      ),
  });

  const list =
    listQuery.data?.viewerRole === "teacher" ? listQuery.data : undefined;
  const errorCode: ActivityClientErrorCode | null = listQuery.error
    ? activityErrorCodeOf(listQuery.error)
    : listQuery.data && !list
      ? "FORBIDDEN"
      : !list
        ? initialErrorCode
        : null;
  const errorPresentation = errorCode ? presentActivityError(errorCode) : null;
  const createError = createMutation.error
    ? presentActivityError(activityErrorCodeOf(createMutation.error))
    : null;

  return (
    <main className="bg-background min-h-dvh px-4 pt-5 pb-8 sm:px-8">
      <div className="mx-auto grid max-w-3xl gap-4">
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
              {list?.className ?? "ชั้นเรียน"}
            </p>
            <h1 className="text-2xl font-bold">กิจกรรม</h1>
          </div>
          <Link
            className="border-border bg-card ml-auto inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
            href={`/teacher/classes/${classId}/sessions`}
          >
            รอบสำรวจ
          </Link>
        </header>

        {!online ? (
          <p
            className="flex items-center gap-2 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="size-5 shrink-0" />
            ออฟไลน์อยู่ · รายการอาจไม่เป็นปัจจุบัน
          </p>
        ) : null}

        {!list && errorPresentation ? (
          <section
            className="border-border bg-card rounded-xl border p-4"
            role="alert"
          >
            <ShieldAlert aria-hidden="true" className="size-6 text-[#B3261E]" />
            <h2 className="mt-2 font-semibold">{errorPresentation.title}</h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {errorPresentation.description}
            </p>
            {errorCode === "NETWORK" ? (
              <Button
                className="mt-3"
                onClick={() => void listQuery.refetch()}
                variant="outline"
              >
                ลองใหม่
              </Button>
            ) : null}
          </section>
        ) : null}

        {!list && !errorPresentation ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            กำลังโหลดกิจกรรม...
          </p>
        ) : null}

        {list ? (
          <>
            <form
              aria-labelledby="create-activity-heading"
              className="border-border bg-card grid gap-2 rounded-xl border p-4"
              noValidate
              onSubmit={form.handleSubmit((values) =>
                createMutation.mutate(values),
              )}
            >
              <h2 className="font-semibold" id="create-activity-heading">
                สร้างกิจกรรม
              </h2>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">ชื่อกิจกรรม</span>
                <input
                  aria-invalid={Boolean(form.formState.errors.title)}
                  autoComplete="off"
                  className="border-border bg-background min-h-11 rounded-[10px] border px-3 text-base"
                  maxLength={ACTIVITY_TITLE_MAX_LENGTH}
                  {...form.register("title")}
                />
              </label>
              {form.formState.errors.title ? (
                <p className="text-[13px] text-[#B3261E]" role="alert">
                  {form.formState.errors.title.message}
                </p>
              ) : null}
              {createError ? (
                <p className="text-sm" role="alert">
                  <span className="font-semibold">{createError.title}</span>{" "}
                  {createError.description}
                </p>
              ) : null}
              <Button
                className="w-fit"
                disabled={createMutation.isPending || !online}
                type="submit"
              >
                {createMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Plus aria-hidden="true" className="size-4" />
                )}
                สร้างกิจกรรม
              </Button>
              <p className="text-muted-foreground text-[13px]">
                สร้างเป็นฉบับร่างก่อน แล้วกำหนดขอบเขต เส้นทาง และจุดตรวจ
              </p>
            </form>

            <section
              aria-labelledby="activities-heading"
              className="grid gap-3"
            >
              <h2 className="text-lg font-semibold" id="activities-heading">
                กิจกรรมทั้งหมด ({list.items.length})
              </h2>
              {list.items.length ? (
                <ul className="grid gap-3">
                  {list.items.map((item) => (
                    <li
                      className="border-border bg-card rounded-xl border p-4"
                      key={item.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 font-semibold break-words">
                          <Link
                            className="underline-offset-4 hover:underline focus-visible:underline"
                            href={`/teacher/classes/${classId}/activities/${item.id}`}
                          >
                            {item.title}
                          </Link>
                        </h3>
                        <span className="border-border bg-background inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[13px] font-medium">
                          {item.status === "draft" ? (
                            <FilePenLine
                              aria-hidden="true"
                              className="size-3.5"
                            />
                          ) : (
                            <MapPinned
                              aria-hidden="true"
                              className="size-3.5"
                            />
                          )}
                          {STATUS_LABELS[item.status]}
                        </span>
                      </div>
                      {item.description ? (
                        <p className="text-muted-foreground mt-1 text-sm break-words">
                          {item.description}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                        {item.publishedVersionNumber ? (
                          <span>
                            เผยแพร่ฉบับที่ {item.publishedVersionNumber}
                          </span>
                        ) : null}
                        {item.draftVersionNumber ? (
                          <span>มีร่างฉบับที่ {item.draftVersionNumber}</span>
                        ) : null}
                        <span>จุดตรวจ {item.checkpointCount} จุด</span>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-border bg-card rounded-xl border p-4 text-sm leading-6">
                  ยังไม่มีกิจกรรม สร้างกิจกรรมแรกเพื่อกำหนดขอบเขต เส้นทาง
                  และจุดตรวจ
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
