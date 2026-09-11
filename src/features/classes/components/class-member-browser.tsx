"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Mail,
  RefreshCw,
  School,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ApiError, ApiEnvelope } from "@/lib/http/envelope";

import { CLASS_ERROR_PRESENTATIONS } from "../errors";
import type {
  AuthorizedClassSummary,
  ClassMemberPage,
  ClassMemberSummary,
} from "../contracts";

interface Props {
  initialClasses: AuthorizedClassSummary[];
  mode: "student" | "teacher";
}

function classStatusLabel(status: AuthorizedClassSummary["status"]) {
  return status === "active" ? "เปิดใช้งาน" : "ปิดใช้งานแล้ว";
}

function roleLabel(role: ClassMemberSummary["role"]) {
  return role === "teacher" ? "ครู" : "นักเรียน";
}

function membershipStatusLabel(status: ClassMemberSummary["status"]) {
  return status === "active" ? "กำลังเรียน" : "ออกจากชั้นเรียนแล้ว";
}

async function readEnvelope<T>(response: Response) {
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || body.error) {
    throw (
      body.error ?? {
        code: "FORBIDDEN",
        message: "Forbidden",
        retryable: false,
        details: {},
      }
    );
  }
  return body.data;
}

function errorTitle(error: unknown) {
  if (!navigator.onLine) {
    return "ออฟไลน์อยู่";
  }
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as ApiError)
      .code as keyof typeof CLASS_ERROR_PRESENTATIONS;
    return CLASS_ERROR_PRESENTATIONS[code]?.title ?? "โหลดข้อมูลไม่สำเร็จ";
  }
  return "โหลดข้อมูลไม่สำเร็จ";
}

export function ClassMemberBrowser({ initialClasses, mode }: Props) {
  const [selectedClassId, setSelectedClassId] = useState(
    initialClasses[0]?.id ?? "",
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [memberPages, setMemberPages] = useState<ClassMemberSummary[]>([]);

  const classesQuery = useQuery({
    queryKey: ["classes", mode],
    queryFn: async () => {
      const data = await readEnvelope<{ items: AuthorizedClassSummary[] }>(
        await fetch("/api/classes"),
      );
      return data.items;
    },
    initialData: initialClasses,
  });

  const classes = classesQuery.data ?? [];
  const selectedClass = classes.find(
    (classRow) => classRow.id === selectedClassId,
  );
  const canReadMembers = Boolean(
    selectedClass && selectedClass.status === "active",
  );

  const memberUrl = useMemo(() => {
    if (!selectedClassId) return null;
    const params = new URLSearchParams({
      status: "active",
      limit: "50",
    });
    if (mode === "student") params.set("role", "student");
    if (cursor) params.set("cursor", cursor);
    return `/api/classes/${selectedClassId}/members?${params.toString()}`;
  }, [cursor, mode, selectedClassId]);

  const membersQuery = useQuery({
    queryKey: ["class-members", selectedClassId, mode, cursor],
    enabled: Boolean(memberUrl && canReadMembers),
    queryFn: async () => {
      const data = await readEnvelope<ClassMemberPage>(await fetch(memberUrl!));
      setMemberPages((current) =>
        cursor ? [...current, ...data.items] : data.items,
      );
      return data;
    },
  });

  function selectClass(classId: string) {
    setSelectedClassId(classId);
    setCursor(null);
    setMemberPages([]);
  }

  const visibleMembers = memberPages.length
    ? memberPages
    : (membersQuery.data?.items ?? []);
  const memberError = membersQuery.error ?? classesQuery.error;

  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-2">
        <School className="size-5" aria-hidden="true" />
        <h2 className="text-lg font-semibold">
          {mode === "teacher" ? "รายชื่อชั้นเรียนและสมาชิก" : "ชั้นเรียนของฉัน"}
        </h2>
      </div>

      {classesQuery.isLoading ? (
        <div className="border-border bg-card rounded-lg border p-4 text-sm">
          กำลังโหลดชั้นเรียน...
        </div>
      ) : null}

      {!classes.length && !classesQuery.isLoading ? (
        <div className="border-border bg-card rounded-lg border p-4 text-sm">
          {mode === "student"
            ? "ยังไม่มีชั้นเรียนที่เข้าร่วมอยู่ ใช้รหัสหรือลิงก์คำเชิญจากครูเพื่อเข้าชั้นเรียน"
            : "ยังไม่มีชั้นเรียนที่ได้รับสิทธิ์ สร้างชั้นเรียนแรกจากฟอร์มด้านบน"}
        </div>
      ) : null}

      {classes.length ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((classRow) => (
            <button
              className={`rounded-lg border p-4 text-left ${
                classRow.id === selectedClassId
                  ? "border-primary bg-secondary"
                  : "border-border bg-card"
              }`}
              key={classRow.id}
              onClick={() => selectClass(classRow.id)}
              type="button"
            >
              <span className="block font-semibold">{classRow.name}</span>
              <span className="text-muted-foreground mt-1 block text-xs">
                {classRow.school_name} · {classRow.subject ?? "ไม่ระบุวิชา"}
              </span>
              <span className="mt-3 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                <UsersRound className="size-3" aria-hidden="true" />
                {classRow.active_member_count} คน ·{" "}
                {classStatusLabel(classRow.status)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {selectedClass ? (
        <div className="border-border bg-card rounded-lg border">
          <div className="border-border border-b p-4">
            <p className="text-muted-foreground text-xs">
              {mode === "teacher" ? "มุมมองครู" : "มุมมองนักเรียน"}
            </p>
            <h3 className="mt-1 text-xl font-semibold">{selectedClass.name}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {selectedClass.group_formation_status === "open"
                ? "เปิดจัดกลุ่ม"
                : "ปิดจัดกลุ่ม"}{" "}
              · กลุ่มปัจจุบันจะแสดงเมื่อระบบกลุ่มพร้อมใช้งาน
            </p>
          </div>

          {selectedClass.status !== "active" ? (
            <div className="p-4 text-sm">
              <ShieldAlert
                className="mb-2 size-5 text-red-700"
                aria-hidden="true"
              />
              ชั้นเรียนนี้ปิดใช้งานแล้ว กลับไปรายการชั้นเรียนหรือติดต่อครู
            </div>
          ) : null}

          {memberError && selectedClass.status === "active" ? (
            <div className="p-4 text-sm">
              <ShieldAlert
                className="mb-2 size-5 text-red-700"
                aria-hidden="true"
              />
              <p>{errorTitle(memberError)}</p>
              <Button
                className="mt-3"
                onClick={() => {
                  setCursor(null);
                  setMemberPages([]);
                  void membersQuery.refetch();
                }}
                variant="outline"
              >
                <RefreshCw className="size-4" aria-hidden="true" /> ลองใหม่
              </Button>
            </div>
          ) : null}

          {membersQuery.isLoading && selectedClass.status === "active" ? (
            <div className="p-4 text-sm">กำลังโหลดรายชื่อสมาชิก...</div>
          ) : null}

          {selectedClass.status === "active" &&
          !membersQuery.isLoading &&
          !memberError &&
          !visibleMembers.length ? (
            <div className="p-4 text-sm">ยังไม่มีสมาชิกที่ตรงกับมุมมองนี้</div>
          ) : null}

          {visibleMembers.length ? (
            <ul className="divide-border divide-y">
              {visibleMembers.map((member) => (
                <li
                  className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]"
                  key={member.id}
                >
                  <div>
                    <p className="font-medium">{member.display_name}</p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {roleLabel(member.role)} ·{" "}
                      {membershipStatusLabel(member.status)}
                    </p>
                    {mode === "teacher" && member.email ? (
                      <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs break-all">
                        <Mail className="size-3" aria-hidden="true" />
                        {member.email}
                      </p>
                    ) : null}
                  </div>
                  <dl className="grid gap-1 text-sm sm:text-right">
                    <div>
                      <dt className="text-muted-foreground">เข้าร่วม</dt>
                      <dd>
                        {new Date(member.joined_at).toLocaleDateString("th-TH")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">กลุ่มปัจจุบัน</dt>
                      <dd>{member.current_group_name ?? "ยังไม่มีกลุ่ม"}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          ) : null}

          {membersQuery.data?.hasMore ? (
            <div className="border-border border-t p-4">
              <Button
                disabled={membersQuery.isFetching}
                onClick={() => setCursor(membersQuery.data?.nextCursor ?? null)}
                variant="outline"
              >
                <BookOpen className="size-4" aria-hidden="true" />
                โหลดสมาชิกเพิ่มเติม
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
