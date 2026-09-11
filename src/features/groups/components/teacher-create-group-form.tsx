"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";

import type { GroupBoard } from "../board";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
} from "../contracts";
import type { CreateTeacherGroupRequest } from "../teacher";
import { TeacherErrorLine } from "./teacher-error-line";

const teacherCreateFormSchema = z
  .object({
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
    leaderStudentId: z.string(),
    memberStudentIds: z.array(z.string()),
  })
  .superRefine((value, context) => {
    const members = value.memberStudentIds.filter(
      (id) => id !== value.leaderStudentId,
    );
    if (members.length && !value.leaderStudentId) {
      context.addIssue({
        code: "custom",
        message:
          "เลือกหัวหน้ากลุ่มก่อนเพิ่มสมาชิก กลุ่มที่มีสมาชิกต้องมีหัวหน้าเสมอ",
        path: ["leaderStudentId"],
      });
    }
  });

type TeacherCreateFormInput = z.input<typeof teacherCreateFormSchema>;
type TeacherCreateFormOutput = z.output<typeof teacherCreateFormSchema>;

export function TeacherCreateGroupForm({
  board,
  busy,
  error,
  online,
  onCancel,
  onSubmit,
}: {
  board: GroupBoard;
  busy: boolean;
  error: unknown;
  online: boolean;
  onCancel: () => void;
  onSubmit: (request: CreateTeacherGroupRequest) => void;
}) {
  const form = useForm<
    TeacherCreateFormInput,
    unknown,
    TeacherCreateFormOutput
  >({
    resolver: zodResolver(teacherCreateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      leaderStudentId: "",
      memberStudentIds: [],
    },
  });
  const leaderStudentId = useWatch({
    control: form.control,
    name: "leaderStudentId",
  });
  const errors = form.formState.errors;
  const students = board.unassignedStudents;

  return (
    <form
      aria-labelledby="teacher-create-group-heading"
      className="border-border bg-card grid gap-3 rounded-xl border p-4"
      noValidate
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          name: values.name,
          description: values.description || null,
          leaderStudentId: values.leaderStudentId || null,
          memberStudentIds: values.memberStudentIds.filter(
            (id) => id !== values.leaderStudentId,
          ),
        }),
      )}
    >
      <h2 className="font-semibold" id="teacher-create-group-heading">
        สร้างกลุ่มใหม่
      </h2>
      <p className="text-muted-foreground text-[13px] leading-5">
        ใช้ช่องกลุ่มเดียวกับที่นักเรียนสร้าง · เหลือ {board.remainingGroupSlots}{" "}
        จาก {board.maximumGroups} กลุ่ม · กลุ่มละไม่เกิน{" "}
        {board.maximumGroupSize} คนรวมหัวหน้า
      </p>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">ชื่อกลุ่ม</span>
        <input
          aria-invalid={Boolean(errors.name)}
          autoComplete="off"
          className="border-border bg-background min-h-11 rounded-[10px] border px-3 text-base"
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
        <span className="text-sm font-medium">คำอธิบาย (ไม่บังคับ)</span>
        <textarea
          className="border-border bg-background rounded-[10px] border px-3 py-2 text-base"
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

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">หัวหน้ากลุ่ม (ไม่บังคับ)</span>
        <select
          aria-invalid={Boolean(errors.leaderStudentId)}
          className="border-border bg-background min-h-11 rounded-[10px] border px-3 text-base"
          {...form.register("leaderStudentId")}
        >
          <option value="">ยังไม่กำหนด · สร้างเป็นกลุ่มว่าง</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.displayName}
            </option>
          ))}
        </select>
      </label>
      {errors.leaderStudentId ? (
        <p className="text-[13px] text-[#B3261E]" role="alert">
          {errors.leaderStudentId.message}
        </p>
      ) : null}

      <Controller
        control={form.control}
        name="memberStudentIds"
        render={({ field }) => (
          <fieldset>
            <legend className="text-sm font-medium">
              สมาชิกจากนักเรียนที่ยังไม่มีกลุ่ม
            </legend>
            {students.length ? (
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {students
                  .filter((student) => student.id !== leaderStudentId)
                  .map((student) => {
                    const checked = field.value.includes(student.id);
                    return (
                      <label
                        className="border-border flex min-h-11 items-center gap-2 rounded-lg border px-3"
                        key={student.id}
                      >
                        <input
                          checked={checked}
                          onChange={() =>
                            field.onChange(
                              checked
                                ? field.value.filter((id) => id !== student.id)
                                : [...field.value, student.id],
                            )
                          }
                          type="checkbox"
                        />
                        <span className="break-words">
                          {student.displayName}
                        </span>
                      </label>
                    );
                  })}
              </div>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">
                นักเรียนทุกคนมีกลุ่มแล้ว ย้ายนักเรียนเข้ากลุ่มใหม่ภายหลังได้
              </p>
            )}
          </fieldset>
        )}
      />

      <TeacherErrorLine error={error} />

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={onCancel} variant="outline">
          ยกเลิก
        </Button>
        <Button disabled={busy || !online} type="submit">
          {busy ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          สร้างกลุ่ม
        </Button>
      </div>
    </form>
  );
}
