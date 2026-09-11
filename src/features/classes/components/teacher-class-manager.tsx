"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Copy,
  ExternalLink,
  QrCode,
  RefreshCw,
  RotateCcw,
  School,
  Settings,
  Share2,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/http/envelope";

import type { AuthorizedClassSummary } from "../contracts";
import {
  createClassRequestSchema,
  issueClassInviteRequestSchema,
  updateClassSettingsRequestSchema,
  type CreateClassRequest,
  type IssueClassInviteRequest,
  type ClassGroupSettings,
  type CreateClassFormValues,
  type ClassGroupSettingsFormValues,
  type IssueClassInviteFormValues,
} from "../contracts";
import { ClassMemberBrowser } from "./class-member-browser";
import { CLASS_ERROR_PRESENTATIONS } from "../errors";

interface SchoolOption {
  id: string;
  name: string;
}

export interface ClassRow extends AuthorizedClassSummary {
  id: string;
  school_id: string;
  name: string;
  subject: string | null;
  academic_year: string | null;
  semester: string | null;
  description: string | null;
  min_group_size: number;
  max_group_size: number;
  maximum_groups: number;
  allow_student_groups: boolean;
  group_formation_status: "open" | "closed";
  status: "active" | "archived";
}

export interface InviteRow {
  id: string;
  class_id: string;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  status: "active" | "disabled";
  disabled_at: string | null;
  created_at: string;
  join_url?: string;
  token?: string;
}

type Envelope<T> =
  | { data: T; error: null; requestId: string }
  | { data: null; error: ApiError; requestId: string };

interface Props {
  schools: SchoolOption[];
  initialClasses: ClassRow[];
  initialInvites: InviteRow[];
  initialError?: keyof typeof CLASS_ERROR_PRESENTATIONS;
}

const emptyInvite: IssueClassInviteRequest = { expiresAt: null, maxUses: null };

async function parseEnvelope<T>(response: Response) {
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok || body.error) {
    throw body.error ?? { code: "FORBIDDEN", message: "Forbidden" };
  }
  return body.data;
}

function isoFromLocal(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function localFromIso(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function TeacherClassManager({
  schools,
  initialClasses,
  initialInvites,
  initialError,
}: Props) {
  const [classes, setClasses] = useState(initialClasses);
  const [invites, setInvites] = useState(initialInvites);
  const [selectedClassId, setSelectedClassId] = useState(
    initialClasses[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(
    initialError ? CLASS_ERROR_PRESENTATIONS[initialError].title : null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [fullQr, setFullQr] = useState(false);

  const selectedClass = classes.find(
    (classRow) => classRow.id === selectedClassId,
  );
  const activeInvite = [...invites]
    .filter(
      (invite) =>
        invite.class_id === selectedClassId && invite.status === "active",
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const createForm = useForm<
    CreateClassFormValues,
    unknown,
    CreateClassRequest
  >({
    resolver: zodResolver(createClassRequestSchema),
    defaultValues: {
      schoolId: schools[0]?.id ?? "",
      name: "",
      subject: "",
      academicYear: "2569",
      semester: "1",
      description: "",
      groupSettings: {
        minimumSize: 3,
        maximumSize: 5,
        maximumGroups: 5,
        allowStudentGroups: true,
        formationStatus: "closed",
      },
    },
  });

  const settingsForm = useForm<
    ClassGroupSettingsFormValues,
    unknown,
    ClassGroupSettings
  >({
    resolver: zodResolver(updateClassSettingsRequestSchema),
    defaultValues: {
      minimumSize: selectedClass?.min_group_size ?? 3,
      maximumSize: selectedClass?.max_group_size ?? 5,
      maximumGroups: selectedClass?.maximum_groups ?? 5,
      allowStudentGroups: selectedClass?.allow_student_groups ?? true,
      formationStatus: selectedClass?.group_formation_status ?? "closed",
    },
  });

  const inviteForm = useForm<
    IssueClassInviteFormValues,
    unknown,
    IssueClassInviteRequest
  >({
    resolver: zodResolver(issueClassInviteRequestSchema),
    defaultValues: emptyInvite,
  });

  const settingsFormationStatus = useWatch({
    control: settingsForm.control,
    name: "formationStatus",
  });

  const joinUrl = activeInvite?.join_url;
  const visibleQrUrl = joinUrl ? qrUrl : null;

  useEffect(() => {
    let cancelled = false;
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  useEffect(() => {
    if (!selectedClass) return;
    settingsForm.reset({
      minimumSize: selectedClass.min_group_size,
      maximumSize: selectedClass.max_group_size,
      maximumGroups: selectedClass.maximum_groups,
      allowStudentGroups: selectedClass.allow_student_groups,
      formationStatus: selectedClass.group_formation_status,
    });
  }, [selectedClass, settingsForm]);

  const classOptions = useMemo(
    () =>
      classes.map((classRow) => (
        <button
          className={`rounded-lg border px-4 py-3 text-left text-sm ${
            classRow.id === selectedClassId
              ? "border-primary bg-secondary text-secondary-foreground"
              : "border-border bg-card"
          }`}
          key={classRow.id}
          onClick={() => setSelectedClassId(classRow.id)}
          type="button"
        >
          <span className="block font-semibold">{classRow.name}</span>
          <span className="text-muted-foreground block text-xs">
            {classRow.subject ?? "ไม่ระบุวิชา"} ·{" "}
            {classRow.group_formation_status === "open"
              ? "เปิดจัดกลุ่ม"
              : "ปิดจัดกลุ่ม"}
          </span>
        </button>
      )),
    [classes, selectedClassId],
  );

  async function run<T>(operation: () => Promise<T>, success: string) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await operation();
      setStatus(success);
      return result;
    } catch (caught) {
      if (!navigator.onLine) {
        setError("ออฟไลน์อยู่ ตรวจสอบสัญญาณแล้วลองอีกครั้ง");
      } else if (typeof caught === "object" && caught && "code" in caught) {
        const code = caught.code as keyof typeof CLASS_ERROR_PRESENTATIONS;
        setError(CLASS_ERROR_PRESENTATIONS[code]?.title ?? "ทำรายการไม่สำเร็จ");
      } else {
        setError("ทำรายการไม่สำเร็จ กดรีเฟรชแล้วลองอีกครั้ง");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate(value: CreateClassRequest) {
    await run(async () => {
      const created = await parseEnvelope<ClassRow>(
        await fetch("/api/classes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value),
        }),
      );
      const createdSummary: ClassRow = {
        ...created,
        class_id: created.id,
        school_name:
          schools.find((school) => school.id === value.schoolId)?.name ?? "",
        caller_role: "teacher",
        active_member_count: 1,
        created_at: new Date().toISOString(),
      };
      setClasses((current) => [createdSummary, ...current]);
      setSelectedClassId(createdSummary.id);
      createForm.reset();
      return createdSummary;
    }, "สร้างชั้นเรียนและเพิ่มครูเป็นสมาชิกแล้ว");
  }

  async function submitSettings(value: ClassGroupSettings) {
    if (!selectedClass) return;
    await run(async () => {
      const updated = await parseEnvelope<{
        class_id: string;
        min_group_size: number;
        max_group_size: number;
        maximum_groups: number;
        allow_student_groups: boolean;
        group_formation_status: "open" | "closed";
      }>(
        await fetch(`/api/classes/${selectedClass.id}/group-settings`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value),
        }),
      );
      setClasses((current) =>
        current.map((classRow) =>
          classRow.id === selectedClass.id
            ? {
                ...classRow,
                min_group_size: updated.min_group_size,
                max_group_size: updated.max_group_size,
                maximum_groups: updated.maximum_groups,
                allow_student_groups: updated.allow_student_groups,
                group_formation_status: updated.group_formation_status,
              }
            : classRow,
        ),
      );
      return updated;
    }, "บันทึกการตั้งค่าชั้นเรียนแล้ว");
  }

  async function issueInvite(rotate = false) {
    if (!selectedClass) return;
    const value = inviteForm.getValues();
    await run(
      async () => {
        const invite = await parseEnvelope<InviteRow>(
          await fetch(
            rotate && activeInvite
              ? `/api/classes/${selectedClass.id}/invites/${activeInvite.id}/rotate`
              : `/api/classes/${selectedClass.id}/invites`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                expiresAt: isoFromLocal(String(value.expiresAt ?? "")),
                maxUses: value.maxUses ? Number(value.maxUses) : null,
              }),
            },
          ),
        );
        setInvites((current) => [
          invite,
          ...current.map((row) =>
            rotate && activeInvite && row.id === activeInvite.id
              ? {
                  ...row,
                  status: "disabled" as const,
                  disabled_at: new Date().toISOString(),
                }
              : row,
          ),
        ]);
        return invite;
      },
      rotate ? "หมุนคำเชิญและปิดคำเชิญเดิมแล้ว" : "สร้างคำเชิญแล้ว",
    );
  }

  async function disableInvite() {
    if (!selectedClass || !activeInvite) return;
    if (
      !window.confirm(
        "ปิดคำเชิญนี้หรือไม่ นักเรียนที่เข้าร่วมไปแล้วจะไม่ถูกเปลี่ยนแปลง แต่ลิงก์/QR เดิมจะใช้ไม่ได้",
      )
    ) {
      return;
    }
    await run(async () => {
      const disabled = await parseEnvelope<{
        invite_id: string;
        status: "disabled";
      }>(
        await fetch(
          `/api/classes/${selectedClass.id}/invites/${activeInvite.id}/disable`,
          { method: "POST" },
        ),
      );
      setInvites((current) =>
        current.map((row) =>
          row.id === disabled.invite_id ? { ...row, status: "disabled" } : row,
        ),
      );
      return disabled;
    }, "ปิดคำเชิญแล้ว");
  }

  async function copyJoin() {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    setStatus("คัดลอกลิงก์คำเชิญแล้ว");
  }

  async function shareJoin() {
    if (!joinUrl) return;
    if (navigator.share) {
      await navigator.share({
        title: selectedClass?.name ?? "AI Escort",
        url: joinUrl,
      });
    } else {
      await copyJoin();
    }
  }

  return (
    <main className="bg-background min-h-dvh px-4 py-5 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[320px_1fr]">
        <header className="lg:col-span-2">
          <p className="text-muted-foreground text-sm">AI Escort · ครู</p>
          <h1 className="mt-1 text-3xl font-bold">จัดการชั้นเรียนและคำเชิญ</h1>
        </header>

        <aside className="space-y-3">
          <div className="flex items-center gap-2">
            <School className="size-5" />
            <h2 className="font-semibold">ชั้นเรียน</h2>
          </div>
          {classes.length ? (
            <div className="grid gap-2">{classOptions}</div>
          ) : (
            <div className="border-border bg-card rounded-lg border p-4 text-sm">
              ยังไม่มีชั้นเรียน สร้างชั้นเรียนแรกจากฟอร์มด้านล่าง
            </div>
          )}
          {error ? (
            <div className="border-border bg-card rounded-lg border p-4 text-sm">
              <ShieldAlert className="mb-2 size-5 text-red-700" />
              {error}
            </div>
          ) : null}
          {status ? (
            <div className="border-border bg-card rounded-lg border p-4 text-sm">
              {status}
            </div>
          ) : null}
        </aside>

        <section className="grid gap-5">
          <form
            className="border-border bg-card grid gap-4 rounded-lg border p-4"
            onSubmit={createForm.handleSubmit(submitCreate)}
          >
            <h2 className="text-lg font-semibold">สร้างชั้นเรียน</h2>
            <select
              {...createForm.register("schoolId")}
              className="rounded-lg border p-3"
            >
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
            <input
              {...createForm.register("name")}
              className="rounded-lg border p-3"
              placeholder="ชื่อชั้นเรียน"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                {...createForm.register("subject")}
                className="rounded-lg border p-3"
                placeholder="วิชา"
              />
              <input
                {...createForm.register("academicYear")}
                className="rounded-lg border p-3"
                placeholder="ปีการศึกษา"
              />
              <input
                {...createForm.register("semester")}
                className="rounded-lg border p-3"
                placeholder="ภาคเรียน"
              />
            </div>
            <textarea
              {...createForm.register("description")}
              className="min-h-20 rounded-lg border p-3"
              placeholder="คำอธิบาย (ไม่บังคับ)"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                {...createForm.register("groupSettings.minimumSize", {
                  valueAsNumber: true,
                })}
                className="rounded-lg border p-3"
                min={1}
                type="number"
                placeholder="ขนาดต่ำสุด"
              />
              <input
                {...createForm.register("groupSettings.maximumSize", {
                  valueAsNumber: true,
                })}
                className="rounded-lg border p-3"
                min={1}
                type="number"
                placeholder="ขนาดสูงสุด"
              />
              <input
                {...createForm.register("groupSettings.maximumGroups", {
                  valueAsNumber: true,
                })}
                className="rounded-lg border p-3"
                min={1}
                type="number"
                placeholder="จำนวนกลุ่มสูงสุด"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                {...createForm.register("groupSettings.allowStudentGroups")}
                type="checkbox"
              />
              ให้นักเรียนสร้างกลุ่มเอง
            </label>
            <select
              {...createForm.register("groupSettings.formationStatus")}
              className="rounded-lg border p-3"
            >
              <option value="closed">ปิดการจัดกลุ่ม</option>
              <option value="open">เปิดการจัดกลุ่ม</option>
            </select>
            <Button disabled={busy} type="submit">
              สร้างชั้นเรียน
            </Button>
          </form>

          {selectedClass ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <form
                className="border-border bg-card grid gap-4 rounded-lg border p-4"
                onSubmit={settingsForm.handleSubmit(submitSettings)}
              >
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Settings className="size-5" /> การตั้งค่ากลุ่ม
                </h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    {...settingsForm.register("minimumSize", {
                      valueAsNumber: true,
                    })}
                    className="rounded-lg border p-3"
                    min={1}
                    type="number"
                  />
                  <input
                    {...settingsForm.register("maximumSize", {
                      valueAsNumber: true,
                    })}
                    className="rounded-lg border p-3"
                    min={1}
                    type="number"
                  />
                  <input
                    {...settingsForm.register("maximumGroups", {
                      valueAsNumber: true,
                    })}
                    className="rounded-lg border p-3"
                    min={1}
                    type="number"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    {...settingsForm.register("allowStudentGroups")}
                    type="checkbox"
                  />
                  ให้นักเรียนสร้างกลุ่มเอง
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={
                      settingsFormationStatus === "open" ? "default" : "outline"
                    }
                    onClick={() =>
                      settingsForm.setValue("formationStatus", "open")
                    }
                  >
                    <ToggleRight className="size-4" /> เปิด
                  </Button>
                  <Button
                    type="button"
                    variant={
                      settingsFormationStatus === "closed"
                        ? "default"
                        : "outline"
                    }
                    onClick={() =>
                      settingsForm.setValue("formationStatus", "closed")
                    }
                  >
                    <ToggleLeft className="size-4" /> ปิด
                  </Button>
                </div>
                <Button disabled={busy} type="submit">
                  บันทึกการตั้งค่า
                </Button>
              </form>

              <section className="border-border bg-card grid gap-4 rounded-lg border p-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <QrCode className="size-5" /> คำเชิญเข้าชั้นเรียน
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="rounded-lg border p-3"
                    type="datetime-local"
                    {...inviteForm.register("expiresAt")}
                    defaultValue={localFromIso(
                      activeInvite?.expires_at ?? null,
                    )}
                  />
                  <input
                    className="rounded-lg border p-3"
                    min={1}
                    type="number"
                    placeholder="จำนวนครั้งสูงสุด"
                    {...inviteForm.register("maxUses")}
                  />
                </div>
                {activeInvite ? (
                  <div className="bg-secondary rounded-lg p-4">
                    <p className="text-sm">รหัสชั้นเรียน</p>
                    <p className="font-mono text-2xl font-bold">
                      {activeInvite.code}
                    </p>
                    <p className="text-muted-foreground mt-2 text-xs break-all">
                      {joinUrl}
                    </p>
                    <p className="mt-2 text-xs">
                      ใช้แล้ว {activeInvite.used_count}
                      {activeInvite.max_uses
                        ? `/${activeInvite.max_uses}`
                        : ""}{" "}
                      ·{" "}
                      {activeInvite.expires_at
                        ? `หมดอายุ ${new Date(activeInvite.expires_at).toLocaleString("th-TH")}`
                        : "ไม่กำหนดวันหมดอายุ"}
                    </p>
                    {visibleQrUrl ? (
                      <button
                        className="mt-3"
                        onClick={() => setFullQr(true)}
                        type="button"
                      >
                        {/* QRCode returns a data URL; Next Image would not optimize it. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt="QR invitation"
                          className="size-40 rounded-lg bg-white p-2"
                          src={visibleQrUrl}
                        />
                      </button>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={copyJoin} variant="outline">
                        <Copy className="size-4" /> คัดลอก
                      </Button>
                      <Button onClick={shareJoin} variant="outline">
                        <Share2 className="size-4" /> แชร์
                      </Button>
                      <Button
                        onClick={() => window.open(joinUrl, "_blank")}
                        variant="outline"
                      >
                        <ExternalLink className="size-4" /> เปิดลิงก์
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border p-4 text-sm">
                    ยังไม่มีคำเชิญที่ใช้งานอยู่
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => issueInvite(false)}>
                    <RefreshCw className="size-4" /> สร้างคำเชิญ
                  </Button>
                  <Button
                    disabled={busy || !activeInvite}
                    onClick={() => {
                      if (
                        window.confirm(
                          "หมุนคำเชิญหรือไม่ ลิงก์/QR เดิมจะใช้ไม่ได้ แต่นักเรียนที่เข้าร่วมแล้วไม่เปลี่ยนแปลง",
                        )
                      )
                        void issueInvite(true);
                    }}
                    variant="outline"
                  >
                    <RotateCcw className="size-4" /> หมุนคำเชิญ
                  </Button>
                  <Button
                    disabled={busy || !activeInvite}
                    onClick={disableInvite}
                    variant="outline"
                  >
                    ปิดคำเชิญ
                  </Button>
                </div>
              </section>
            </div>
          ) : null}
        </section>

        <section className="lg:col-span-2">
          <ClassMemberBrowser initialClasses={classes} mode="teacher" />
        </section>
      </div>

      {fullQr && visibleQrUrl ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6"
          role="dialog"
        >
          <button
            className="absolute inset-0"
            onClick={() => setFullQr(false)}
            type="button"
          />
          {/* QRCode returns a data URL; Next Image would not optimize it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Full-screen QR invitation"
            className="relative w-full max-w-sm rounded-lg bg-white p-4"
            src={visibleQrUrl}
          />
        </div>
      ) : null}
    </main>
  );
}
