import type { ApiErrorCode } from "@/lib/http/error-code";

export const AUTH_UI_ERROR_CODES = [
  "AUTH_REQUIRED",
  "EMAIL_REQUIRED",
  "EMAIL_NOT_CONFIRMED",
  "INVALID_CREDENTIALS",
  "PASSWORD_POLICY_FAILED",
  "AUTH_CALLBACK_INVALID",
  "RECOVERY_LINK_INVALID",
  "ACCOUNT_DISABLED",
  "FORBIDDEN",
  "RATE_LIMITED",
] as const satisfies readonly ApiErrorCode[];

export type AuthUiErrorCode = (typeof AUTH_UI_ERROR_CODES)[number];

export interface AuthErrorPresentation {
  title: string;
  description: string;
  action: string;
}

export const AUTH_ERROR_PRESENTATIONS: Record<
  AuthUiErrorCode,
  AuthErrorPresentation
> = {
  AUTH_REQUIRED: {
    title: "กรุณาเข้าสู่ระบบ",
    description: "เซสชันของคุณอาจหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
    action: "ไปหน้าเข้าสู่ระบบ",
  },
  EMAIL_REQUIRED: {
    title: "ต้องใช้อีเมล",
    description: "กรุณากรอกอีเมลที่ใช้สมัครสมาชิก",
    action: "กลับไปกรอกอีเมล",
  },
  EMAIL_NOT_CONFIRMED: {
    title: "กรุณายืนยันอีเมล",
    description: "เปิดลิงก์ยืนยันในอีเมลก่อนเข้าใช้งานส่วนที่มีการป้องกัน",
    action: "ส่งอีเมลยืนยันอีกครั้ง",
  },
  INVALID_CREDENTIALS: {
    title: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    description: "ตรวจสอบข้อมูลแล้วลองอีกครั้ง หรือขอลิงก์ตั้งรหัสผ่านใหม่",
    action: "ลองใหม่",
  },
  PASSWORD_POLICY_FAILED: {
    title: "รหัสผ่านยังไม่ปลอดภัยพอ",
    description: "ใช้รหัสผ่านหรือวลีผ่านอย่างน้อย 10 ตัวอักษร",
    action: "แก้ไขรหัสผ่าน",
  },
  AUTH_CALLBACK_INVALID: {
    title: "ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ",
    description: "ลิงก์ยืนยันใช้ได้ครั้งเดียว กรุณาขออีเมลยืนยันฉบับใหม่",
    action: "ขออีเมลใหม่",
  },
  RECOVERY_LINK_INVALID: {
    title: "ลิงก์เปลี่ยนรหัสผ่านหมดอายุ",
    description: "เพื่อความปลอดภัย กรุณาขอลิงก์เปลี่ยนรหัสผ่านฉบับใหม่",
    action: "ขอเปลี่ยนรหัสผ่านใหม่",
  },
  ACCOUNT_DISABLED: {
    title: "บัญชีนี้ใช้งานไม่ได้",
    description:
      "บัญชีถูกปิดใช้งานหรือโปรไฟล์ยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ",
    action: "ติดต่อผู้ดูแลระบบ",
  },
  FORBIDDEN: {
    title: "คุณไม่มีสิทธิ์ทำรายการนี้",
    description: "สิทธิ์ปัจจุบันไม่อนุญาตให้เปิดหน้านี้",
    action: "กลับหน้าก่อนหน้า",
  },
  RATE_LIMITED: {
    title: "ทำรายการบ่อยเกินไป",
    description: "กรุณารอตามเวลาที่แสดงก่อนลองอีกครั้ง",
    action: "รอแล้วลองใหม่",
  },
};

interface SupabaseAuthErrorLike {
  code?: string | undefined;
  message?: string | undefined;
  status?: number | undefined;
}

export function isRateLimitError(error: SupabaseAuthErrorLike | null) {
  return (
    error?.status === 429 ||
    error?.code?.includes("rate_limit") === true ||
    error?.message?.toLowerCase().includes("rate limit") === true
  );
}

export function mapSignInError(error: SupabaseAuthErrorLike): AuthUiErrorCode {
  if (isRateLimitError(error)) return "RATE_LIMITED";
  if (error.code === "email_not_confirmed") return "EMAIL_NOT_CONFIRMED";
  if (error.code === "user_banned") return "ACCOUNT_DISABLED";
  return "INVALID_CREDENTIALS";
}

export function mapPasswordError(
  error: SupabaseAuthErrorLike,
  recovery = false,
): AuthUiErrorCode {
  if (isRateLimitError(error)) return "RATE_LIMITED";
  if (error.code === "weak_password") return "PASSWORD_POLICY_FAILED";
  return recovery ? "RECOVERY_LINK_INVALID" : "PASSWORD_POLICY_FAILED";
}
