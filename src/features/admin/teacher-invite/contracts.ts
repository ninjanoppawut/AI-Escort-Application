import { z } from "zod";

// Teacher invitation acceptance (AUTH trusted provisioning, D-062): the
// invited, signed-in, verified account previews and consumes its invitation.

export const TEACHER_INVITE_TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

export const acceptTeacherInviteSchema = z.object({
  token: z.string().regex(TEACHER_INVITE_TOKEN),
});

export const acceptedTeacherInviteSchema = z.object({
  schoolId: z.uuid(),
  accountType: z.literal("teacher"),
});

export const TEACHER_INVITE_PROBLEMS = {
  TEACHER_INVITE_INVALID: {
    title: "คำเชิญครูไม่ถูกต้อง",
    description:
      "ลิงก์นี้อาจถูกยกเลิก ใช้ไปแล้ว หรือเป็นของอีเมลอื่น ตรวจว่าเข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ หรือติดต่อผู้ดูแลระบบ",
  },
  TEACHER_INVITE_EXPIRED: {
    title: "คำเชิญครูหมดอายุ",
    description: "ขอคำเชิญใหม่จากผู้ดูแลระบบ",
  },
} as const;

export type TeacherInviteProblem = keyof typeof TEACHER_INVITE_PROBLEMS;

export function teacherInviteProblemOf(
  message: string | undefined,
): TeacherInviteProblem {
  return message === "TEACHER_INVITE_EXPIRED"
    ? "TEACHER_INVITE_EXPIRED"
    : "TEACHER_INVITE_INVALID";
}
