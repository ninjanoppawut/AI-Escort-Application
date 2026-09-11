"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import { cn } from "@/lib/utils";

import {
  activityErrorCodeOf,
  activityErrorDetailsOf,
  fetchActivityJson,
  presentActivityError,
  sendActivityJson,
  type ActivityClientErrorCode,
} from "../client/request";
import {
  activityDetailSchema,
  activityQueryKeys,
  draftFromDetail,
  editableVersionNumber,
  type ActivityDetail,
  type ActivityDraft,
} from "../contracts";
import {
  EMPTY_CHECKPOINT,
  draftFromEditorValues,
  editorValuesFromDraft,
  formatArea,
  formatDistance,
  publishReadiness,
  type ActivityEditorValues,
  type EditorFieldErrors,
} from "../editor";
import {
  ACTIVITY_FIELD_LABELS,
  publishBlockMessage,
  type ActivityUiErrorCode,
} from "../errors";
import { lineStringSchema, parseGeoJsonText, polygonSchema } from "../geojson";
import type { PublishedActivity, SavedActivityDraft } from "../results";
import { SchematicPreview } from "./schematic-preview";

const STEPS = [
  "ข้อมูลกิจกรรม",
  "ขอบเขตสำรวจ",
  "เส้นทาง",
  "จุดตรวจ",
  "ตรวจและเผยแพร่",
] as const;

const inputClassName =
  "border-border bg-background min-h-11 rounded-[10px] border px-3 text-base";

function stepForErrors(errors: EditorFieldErrors) {
  const keys = Object.keys(errors);
  if (
    keys.some((key) => ["title", "description", "instructions"].includes(key))
  ) {
    return 0;
  }
  if (keys.includes("boundaryText")) return 1;
  if (keys.includes("routeText")) return 2;
  return 3;
}

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p className="text-[13px] text-[#B3261E]" role="alert">
      {message}
    </p>
  );
}

function MutationError({
  error,
  onReload,
}: {
  error: unknown;
  onReload: () => void;
}) {
  if (!error) return null;
  const code = activityErrorCodeOf(error);
  const presentation = presentActivityError(code);
  const detail = publishBlockMessage(activityErrorDetailsOf(error));
  return (
    <div
      className="border-border bg-card rounded-xl border p-3 text-sm"
      role="alert"
    >
      <p className="font-semibold">{presentation.title}</p>
      <p className="text-muted-foreground mt-1 leading-6">
        {detail ?? presentation.description}
      </p>
      {code === "ACTIVITY_VERSION_CONFLICT" ? (
        <Button className="mt-2" onClick={onReload} size="sm" variant="outline">
          <RefreshCw aria-hidden="true" className="size-4" />
          โหลดฉบับล่าสุด
        </Button>
      ) : null}
    </div>
  );
}

function GeometryTextField({
  error,
  hint,
  id,
  label,
  onImport,
  parseStatus,
  registration,
}: {
  error?: string | undefined;
  hint: string;
  id: string;
  label: string;
  onImport: (text: string) => void;
  parseStatus: string | null;
  registration: ReturnType<
    ReturnType<typeof useForm<ActivityEditorValues>>["register"]
  >;
}) {
  const [importError, setImportError] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <label className="grid gap-1.5" htmlFor={id}>
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-[13px] leading-5">
          {hint}
        </span>
      </label>
      <textarea
        aria-describedby={`${id}-status`}
        aria-invalid={Boolean(error)}
        className="border-border bg-background min-h-40 rounded-[10px] border px-3 py-2 font-mono text-[13px]"
        id={id}
        spellCheck={false}
        {...registration}
      />
      <p
        className="text-muted-foreground text-[13px]"
        id={`${id}-status`}
        role="status"
      >
        {parseStatus ?? "วาง GeoJSON หรือนำเข้าไฟล์"}
      </p>
      <FieldError message={error ?? importError ?? undefined} />
      <label className="border-border bg-card inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium">
        นำเข้าไฟล์ GeoJSON
        <input
          accept=".geojson,.json,application/geo+json,application/json"
          className="sr-only"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > 1_000_000) {
              setImportError("ไฟล์ใหญ่เกิน 1 MB ลดจำนวนจุดก่อนนำเข้า");
              return;
            }
            setImportError(null);
            onImport(await file.text());
          }}
          type="file"
        />
      </label>
    </div>
  );
}

export function ActivityEditor({
  activityId,
  classId,
  initialDetail,
  initialErrorCode,
}: {
  activityId: string;
  classId: string;
  initialDetail: ActivityDetail | null;
  initialErrorCode: ActivityUiErrorCode | null;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // The version this editor started from; a newer save elsewhere is a conflict.
  const [baseVersion, setBaseVersion] = useState<number | null>(
    initialDetail ? editableVersionNumber(initialDetail) : null,
  );

  const detailQuery = useQuery({
    queryKey: activityQueryKeys.detail(activityId),
    queryFn: () =>
      fetchActivityJson(`/api/activities/${activityId}`, activityDetailSchema),
    ...(initialDetail ? { initialData: initialDetail } : {}),
    retry: false,
  });

  const form = useForm<ActivityEditorValues>({
    defaultValues: editorValuesFromDraft(
      initialDetail
        ? draftFromDetail(initialDetail)
        : {
            title: "",
            description: null,
            instructions: null,
            geometry: { boundary: null, route: null, checkpoints: [] },
            plugin: { key: "plant_survey", schemaVersion: 1, config: {} },
          },
    ),
  });
  const checkpointFields = useFieldArray({
    control: form.control,
    name: "checkpoints",
  });
  const [boundaryText, routeText, checkpointValues] = useWatch({
    control: form.control,
    name: ["boundaryText", "routeText", "checkpoints"],
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: activityQueryKeys.all });

  const saveMutation = useMutation({
    mutationFn: ({
      draft,
    }: {
      draft: ActivityDraft;
      values: ActivityEditorValues;
    }) =>
      sendActivityJson<SavedActivityDraft>(
        "PUT",
        `/api/activities/${activityId}`,
        {
          expectedVersion: baseVersion,
          ...draft,
        },
      ),
    onSuccess: (result, { values }) => {
      setBaseVersion(result.versionNumber);
      form.reset(values);
      setNotice(`บันทึกร่างแล้ว · ฉบับที่ ${result.versionNumber}`);
    },
    onError: (error) => {
      const field = activityErrorDetailsOf(error).field;
      const target =
        field === "boundary"
          ? "boundaryText"
          : field === "route"
            ? "routeText"
            : field === "checkpoints"
              ? "checkpoints"
              : null;
      if (target && typeof field === "string") {
        form.setError(target, {
          message: `${ACTIVITY_FIELD_LABELS[field as keyof typeof ACTIVITY_FIELD_LABELS]}ไม่ถูกต้อง เช่น เส้นขอบตัดกันเอง จุดซ้ำ หรือลำดับจุดตรวจซ้ำ`,
        });
        setStep(target === "boundaryText" ? 1 : target === "routeText" ? 2 : 3);
      }
    },
    onSettled: invalidate,
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      sendActivityJson<PublishedActivity>(
        "POST",
        `/api/activities/${activityId}/publish`,
        { expectedVersion: baseVersion },
      ),
    onSuccess: (result) => {
      setBaseVersion(result.versionNumber);
      setNotice(
        `เผยแพร่ฉบับที่ ${result.versionNumber} แล้ว นักเรียนในชั้นเรียนเห็นกิจกรรมนี้ได้`,
      );
    },
    onSettled: invalidate,
  });

  async function reloadLatest() {
    const result = await detailQuery.refetch();
    if (!result.data) return;
    form.reset(editorValuesFromDraft(draftFromDetail(result.data)));
    setBaseVersion(editableVersionNumber(result.data));
    saveMutation.reset();
    publishMutation.reset();
    setNotice("โหลดฉบับล่าสุดแล้ว");
  }

  const onSave = form.handleSubmit((values) => {
    setNotice(null);
    publishMutation.reset();
    const converted = draftFromEditorValues(values);
    if (converted.errors) {
      for (const [key, message] of Object.entries(converted.errors)) {
        form.setError(key as FieldPath<ActivityEditorValues>, { message });
      }
      setStep(stepForErrors(converted.errors));
      return;
    }
    saveMutation.mutate({ draft: converted.data, values });
  });

  const detail = detailQuery.data;
  const loadErrorCode: ActivityClientErrorCode | null = detailQuery.error
    ? activityErrorCodeOf(detailQuery.error)
    : detail && detail.viewerRole !== "teacher"
      ? "FORBIDDEN"
      : !detail
        ? initialErrorCode
        : null;

  if (!detail || detail.viewerRole !== "teacher") {
    const presentation = loadErrorCode
      ? presentActivityError(loadErrorCode)
      : null;
    return (
      <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
        <div className="mx-auto grid max-w-3xl gap-4">
          {presentation ? (
            <section
              className="border-border bg-card rounded-xl border p-4"
              role="alert"
            >
              <ShieldAlert
                aria-hidden="true"
                className="size-6 text-[#B3261E]"
              />
              <h1 className="mt-2 font-semibold">{presentation.title}</h1>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                {presentation.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  className="border-border bg-background inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
                  href="/teacher/classes"
                >
                  กลับรายการชั้นเรียน
                </Link>
                {loadErrorCode === "NETWORK" ? (
                  <Button
                    onClick={() => void detailQuery.refetch()}
                    variant="outline"
                  >
                    ลองใหม่
                  </Button>
                ) : null}
              </div>
            </section>
          ) : (
            <p className="flex items-center gap-2 text-sm" role="status">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              กำลังโหลดกิจกรรม...
            </p>
          )}
        </div>
      </main>
    );
  }

  const errors = form.formState.errors;
  const isDirty = form.formState.isDirty;
  const boundaryParse = boundaryText?.trim()
    ? parseGeoJsonText(boundaryText, polygonSchema, "Polygon")
    : null;
  const routeParse = routeText?.trim()
    ? parseGeoJsonText(routeText, lineStringSchema, "LineString")
    : null;
  const previewCheckpoints = (checkpointValues ?? []).flatMap(
    (checkpoint, index) => {
      const latitude = Number(checkpoint?.latitude);
      const longitude = Number(checkpoint?.longitude);
      return checkpoint?.latitude?.trim() &&
        checkpoint.longitude?.trim() &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
        ? [
            {
              sequenceNumber: index + 1,
              location: {
                type: "Point" as const,
                coordinates: [longitude, latitude] as const,
              },
            },
          ]
        : [];
    },
  );
  const preview = (
    <SchematicPreview
      boundary={boundaryParse?.data ?? null}
      checkpoints={previewCheckpoints}
      route={routeParse?.data ?? null}
    />
  );

  const savedVersion = detail.draft ?? detail.published;
  const readiness = publishReadiness(detail.draft);
  const canPublish =
    Boolean(detail.draft) &&
    detail.draft?.versionNumber === baseVersion &&
    !isDirty &&
    readiness.every((item) => item.done) &&
    online;
  const publishReason = !detail.draft
    ? detail.published
      ? `เผยแพร่ฉบับที่ ${detail.published.versionNumber} แล้ว · แก้ไขแล้วบันทึกเพื่อสร้างร่างฉบับใหม่`
      : "บันทึกร่างก่อนเผยแพร่"
    : isDirty
      ? "มีการแก้ไขที่ยังไม่บันทึก บันทึกร่างก่อนเผยแพร่"
      : !readiness.every((item) => item.done)
        ? "ยังขาดข้อมูลในรายการด้านบน"
        : !online
          ? "เผยแพร่ไม่ได้ขณะออฟไลน์"
          : null;

  return (
    <main className="bg-background min-h-dvh px-4 pt-5 sm:px-8">
      <div className="mx-auto grid max-w-3xl gap-4 pb-28">
        <header className="flex items-center gap-3">
          <Link
            aria-label="กลับรายการกิจกรรม"
            className="border-border bg-card grid size-11 shrink-0 place-items-center rounded-full border"
            href={`/teacher/classes/${classId}/activities`}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm">
              {detail.activity.className}
            </p>
            <h1 className="text-2xl font-bold">แก้ไขกิจกรรม</h1>
          </div>
        </header>

        {!online ? (
          <section
            className="flex items-start gap-3 rounded-xl border border-[#E8C58A] bg-[#FFF6E5] p-3 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p className="leading-6">
              ออฟไลน์อยู่ · แก้ไขในฟอร์มต่อได้
              แต่บันทึกและเผยแพร่ได้เมื่อกลับมาออนไลน์
            </p>
          </section>
        ) : null}

        <div
          className="flex flex-wrap items-center gap-2 text-[13px]"
          role="status"
        >
          <span className="border-border bg-card inline-flex min-h-7 items-center rounded-full border px-2.5 font-medium">
            {detail.published
              ? `เผยแพร่ฉบับที่ ${detail.published.versionNumber}`
              : "ยังไม่เผยแพร่"}
          </span>
          {detail.draft ? (
            <span className="border-border bg-card inline-flex min-h-7 items-center rounded-full border px-2.5 font-medium">
              ร่างฉบับที่ {detail.draft.versionNumber}
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 font-medium",
              isDirty
                ? "border-[#E8C58A] bg-[#FFF6E5] text-[#5C3A04]"
                : "border-border bg-card",
            )}
          >
            {isDirty ? (
              <CircleDashed aria-hidden="true" className="size-3.5" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
            )}
            {isDirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้ว"}
          </span>
        </div>

        <nav aria-label="ขั้นตอนสร้างกิจกรรม">
          <ol className="grid grid-cols-5 gap-1">
            {STEPS.map((label, index) => (
              <li key={label}>
                <button
                  aria-current={step === index ? "step" : undefined}
                  className={cn(
                    "grid min-h-11 w-full content-start gap-1 text-left text-[12px] leading-4",
                    step === index
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setStep(index)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 rounded-full",
                      index <= step ? "bg-primary" : "bg-border",
                    )}
                  />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{index + 1}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-1 text-sm font-semibold">
            ขั้นที่ {step + 1} จาก {STEPS.length} · {STEPS[step]}
          </p>
        </nav>

        {notice ? (
          <p
            className="border-success/30 bg-success/10 flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold"
            role="status"
          >
            <CheckCircle2
              aria-hidden="true"
              className="text-success size-5 shrink-0"
            />
            {notice}
          </p>
        ) : null}
        <MutationError
          error={saveMutation.error}
          onReload={() => void reloadLatest()}
        />
        <MutationError
          error={publishMutation.error}
          onReload={() => void reloadLatest()}
        />

        <form className="grid gap-4" noValidate onSubmit={onSave}>
          {step === 0 ? (
            <section className="border-border bg-card grid gap-3 rounded-xl border p-4">
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">ชื่อกิจกรรม</span>
                <input
                  aria-invalid={Boolean(errors.title)}
                  autoComplete="off"
                  className={inputClassName}
                  {...form.register("title")}
                />
              </label>
              <FieldError message={errors.title?.message} />
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">
                  คำอธิบาย (ไม่บังคับ)
                </span>
                <textarea
                  className="border-border bg-background rounded-[10px] border px-3 py-2 text-base"
                  rows={3}
                  {...form.register("description")}
                />
              </label>
              <FieldError message={errors.description?.message} />
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">
                  คำแนะนำสำหรับนักเรียน (ไม่บังคับ)
                </span>
                <textarea
                  className="border-border bg-background rounded-[10px] border px-3 py-2 text-base"
                  rows={4}
                  {...form.register("instructions")}
                />
              </label>
              <FieldError message={errors.instructions?.message} />
            </section>
          ) : null}

          {step === 1 || step === 2 ? (
            <section className="border-border bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_15rem]">
              {step === 1 ? (
                <GeometryTextField
                  error={errors.boundaryText?.message}
                  hint="Polygon พิกัด [ลองจิจูด, ละติจูด] ปิดรูปโดยจุดแรกและจุดสุดท้ายเป็นจุดเดียวกัน นักเรียนที่ออกนอกขอบเขตจะขึ้นเตือนบนแผนที่ของคุณ"
                  id="activity-boundary"
                  label="ขอบเขตสำรวจ (GeoJSON)"
                  onImport={(text) =>
                    form.setValue("boundaryText", text, { shouldDirty: true })
                  }
                  parseStatus={
                    boundaryParse?.data
                      ? `อ่านขอบเขตได้ ${boundaryParse.data.coordinates[0]?.length ?? 0} จุด`
                      : (boundaryParse?.error ?? null)
                  }
                  registration={form.register("boundaryText")}
                />
              ) : (
                <GeometryTextField
                  error={errors.routeText?.message}
                  hint="LineString พิกัด [ลองจิจูด, ละติจูด] อย่างน้อย 2 จุด เส้นทางต้องผ่านพื้นที่ในขอบเขตสำรวจ"
                  id="activity-route"
                  label="เส้นทาง (GeoJSON)"
                  onImport={(text) =>
                    form.setValue("routeText", text, { shouldDirty: true })
                  }
                  parseStatus={
                    routeParse?.data
                      ? `อ่านเส้นทางได้ ${routeParse.data.coordinates.length} จุด`
                      : (routeParse?.error ?? null)
                  }
                  registration={form.register("routeText")}
                />
              )}
              <div className="grid content-start gap-2">
                {preview}
                <p className="text-muted-foreground text-[12px] leading-5">
                  ภาพร่างพิกัด ไม่ใช่แผนที่ · แผนที่ฐานจะแสดงเมื่อตั้งค่า Mapbox
                  แล้ว
                </p>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section
              aria-labelledby="checkpoints-heading"
              className="border-border bg-card grid gap-3 rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold" id="checkpoints-heading">
                  จุดตรวจ ({checkpointFields.fields.length})
                </h2>
                <span className="text-muted-foreground text-[13px]">
                  เรียงตามลำดับที่นักเรียนจะไป
                </span>
              </div>
              <FieldError
                message={
                  errors.checkpoints?.message ??
                  errors.checkpoints?.root?.message
                }
              />
              {checkpointFields.fields.length ? (
                <ol className="grid gap-3">
                  {checkpointFields.fields.map((field, index) => {
                    const fieldErrors = errors.checkpoints?.[index];
                    return (
                      <li
                        className="border-border bg-background grid gap-2 rounded-lg border p-3"
                        key={field.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            จุดตรวจที่ {index + 1}
                          </span>
                          <span className="flex gap-1">
                            <Button
                              aria-label={`เลื่อนจุดตรวจที่ ${index + 1} ขึ้น`}
                              disabled={index === 0}
                              onClick={() =>
                                checkpointFields.move(index, index - 1)
                              }
                              size="sm"
                              variant="outline"
                            >
                              <ChevronUp
                                aria-hidden="true"
                                className="size-4"
                              />
                            </Button>
                            <Button
                              aria-label={`เลื่อนจุดตรวจที่ ${index + 1} ลง`}
                              disabled={
                                index === checkpointFields.fields.length - 1
                              }
                              onClick={() =>
                                checkpointFields.move(index, index + 1)
                              }
                              size="sm"
                              variant="outline"
                            >
                              <ChevronDown
                                aria-hidden="true"
                                className="size-4"
                              />
                            </Button>
                            <Button
                              aria-label={`ลบจุดตรวจที่ ${index + 1}`}
                              onClick={() => checkpointFields.remove(index)}
                              size="sm"
                              variant="outline"
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </Button>
                          </span>
                        </div>
                        <label className="grid gap-1">
                          <span className="text-[13px] font-medium">
                            ชื่อจุดตรวจ
                          </span>
                          <input
                            aria-invalid={Boolean(fieldErrors?.title)}
                            className={inputClassName}
                            {...form.register(`checkpoints.${index}.title`)}
                          />
                        </label>
                        <FieldError message={fieldErrors?.title?.message} />
                        <div className="grid gap-2 sm:grid-cols-3">
                          <label className="grid gap-1">
                            <span className="text-[13px] font-medium">
                              ละติจูด
                            </span>
                            <input
                              aria-invalid={Boolean(fieldErrors?.latitude)}
                              className={cn(inputClassName, "font-mono")}
                              inputMode="decimal"
                              {...form.register(
                                `checkpoints.${index}.latitude`,
                              )}
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="text-[13px] font-medium">
                              ลองจิจูด
                            </span>
                            <input
                              aria-invalid={Boolean(fieldErrors?.longitude)}
                              className={cn(inputClassName, "font-mono")}
                              inputMode="decimal"
                              {...form.register(
                                `checkpoints.${index}.longitude`,
                              )}
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="text-[13px] font-medium">
                              รัศมี (เมตร)
                            </span>
                            <input
                              aria-invalid={Boolean(fieldErrors?.radiusM)}
                              className={cn(inputClassName, "font-mono")}
                              inputMode="decimal"
                              {...form.register(`checkpoints.${index}.radiusM`)}
                            />
                          </label>
                        </div>
                        <FieldError
                          message={
                            fieldErrors?.latitude?.message ??
                            fieldErrors?.longitude?.message ??
                            fieldErrors?.radiusM?.message
                          }
                        />
                        <label className="grid gap-1">
                          <span className="text-[13px] font-medium">
                            คำแนะนำ (ไม่บังคับ)
                          </span>
                          <textarea
                            className="border-border bg-card rounded-[10px] border px-3 py-2 text-base"
                            rows={2}
                            {...form.register(
                              `checkpoints.${index}.instructions`,
                            )}
                          />
                        </label>
                        <FieldError
                          message={fieldErrors?.instructions?.message}
                        />
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">
                  ยังไม่มีจุดตรวจ ต้องมีอย่างน้อย 1 จุดก่อนเผยแพร่
                </p>
              )}
              <Button
                className="w-fit"
                disabled={checkpointFields.fields.length >= 50}
                onClick={() => checkpointFields.append({ ...EMPTY_CHECKPOINT })}
                variant="outline"
              >
                <Plus aria-hidden="true" className="size-4" />
                เพิ่มจุดตรวจ
              </Button>
              <div className="grid content-start gap-2">{preview}</div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="border-border bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_15rem]">
              <div className="grid content-start gap-3">
                <h2 className="font-semibold">ความพร้อมของร่างที่บันทึกไว้</h2>
                <ul className="grid gap-1.5 text-sm">
                  {readiness.map((item) => (
                    <li className="flex items-center gap-2" key={item.key}>
                      {item.done ? (
                        <CheckCircle2
                          aria-hidden="true"
                          className="text-success size-4"
                        />
                      ) : (
                        <CircleDashed
                          aria-hidden="true"
                          className="text-muted-foreground size-4"
                        />
                      )}
                      <span>{item.label}</span>
                      <span className="text-muted-foreground text-[13px]">
                        {item.done ? "พร้อม" : "ยังไม่มี"}
                      </span>
                    </li>
                  ))}
                </ul>
                {savedVersion ? (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-background rounded-lg p-3">
                      <dt className="text-muted-foreground text-[12px]">
                        พื้นที่
                      </dt>
                      <dd className="font-mono">
                        {formatArea(savedVersion.summary.boundaryAreaM2)}
                      </dd>
                    </div>
                    <div className="bg-background rounded-lg p-3">
                      <dt className="text-muted-foreground text-[12px]">
                        ระยะเส้นทาง
                      </dt>
                      <dd className="font-mono">
                        {formatDistance(savedVersion.summary.routeLengthM)}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                <div>
                  <Button
                    aria-describedby="publish-reason"
                    className="disabled:bg-muted disabled:text-muted-foreground disabled:border-border w-full disabled:border disabled:opacity-100 sm:w-auto"
                    disabled={!canPublish || publishMutation.isPending}
                    onClick={() => {
                      setNotice(null);
                      saveMutation.reset();
                      publishMutation.mutate();
                    }}
                  >
                    {publishMutation.isPending ? (
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : (
                      <Send aria-hidden="true" className="size-4" />
                    )}
                    เผยแพร่กิจกรรม
                  </Button>
                  <p
                    className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[13px] leading-5"
                    id="publish-reason"
                  >
                    <Info
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    {publishReason ??
                      "เมื่อเผยแพร่แล้ว ฉบับนี้จะแก้ไขไม่ได้ รอบสำรวจจะใช้ฉบับนี้ และการแก้ไขครั้งถัดไปจะเป็นร่างฉบับใหม่"}
                  </p>
                </div>
              </div>
              <div className="grid content-start gap-2">{preview}</div>
            </section>
          ) : null}

          <div className="border-border bg-background fixed inset-x-0 bottom-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  disabled={step === 0}
                  onClick={() => setStep((current) => Math.max(0, current - 1))}
                  variant="outline"
                >
                  ย้อนกลับ
                </Button>
                <Button
                  disabled={step === STEPS.length - 1}
                  onClick={() =>
                    setStep((current) =>
                      Math.min(STEPS.length - 1, current + 1),
                    )
                  }
                  variant="outline"
                >
                  ถัดไป
                </Button>
              </div>
              <Button
                disabled={
                  saveMutation.isPending || !online || baseVersion === null
                }
                type="submit"
              >
                {saveMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Save aria-hidden="true" className="size-4" />
                )}
                บันทึกร่าง
              </Button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
