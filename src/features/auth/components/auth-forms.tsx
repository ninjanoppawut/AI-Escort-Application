"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  emailRequestSchema,
  signInRequestSchema,
  signUpFormSchema,
  updatePasswordFormSchema,
} from "@/features/auth/contracts";
import type { AuthUiErrorCode } from "@/features/auth/errors";
import type { ApiEnvelope, ApiFailure } from "@/lib/http/envelope";

import {
  AuthFeedback,
  authFeedbackFromFailure,
  type AuthFeedbackState,
} from "./auth-feedback";

const inputClassName =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-ring min-h-12 w-full rounded-xl border px-3.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

async function postAuth<TData>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const envelope = (await response.json()) as ApiEnvelope<TData>;
  return { response, envelope };
}

function useNetworkStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

function useRetryDelay() {
  const [retryUntil, setRetryUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!retryUntil) return;

    const update = () => {
      const seconds = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) setRetryUntil(0);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  return {
    remaining,
    start(seconds: number | undefined) {
      if (seconds) setRetryUntil(Date.now() + seconds * 1000);
    },
  };
}

function feedbackWithCountdown(
  feedback: AuthFeedbackState,
  remaining: number,
): AuthFeedbackState {
  if (feedback?.kind !== "error" || feedback.code !== "RATE_LIMITED") {
    return feedback;
  }
  return { ...feedback, retryAfterSeconds: remaining || undefined };
}

function FieldError({ message }: { message?: string | undefined }) {
  return message ? (
    <p className="text-destructive mt-1.5 text-sm" role="alert">
      {message}
    </p>
  ) : null;
}

function SubmitButton({
  pending,
  disabled,
  idleLabel,
  pendingLabel,
}: {
  pending: boolean;
  disabled?: boolean;
  idleLabel: string;
  pendingLabel: string;
}) {
  return (
    <Button
      className="mt-2 min-h-13 w-full text-base"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? (
        <>
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        idleLabel
      )}
    </Button>
  );
}

function getFailure(envelope: ApiEnvelope<unknown>) {
  return envelope.error ? (envelope as ApiFailure) : null;
}

export function SignInForm({
  returnTo,
  initialError,
}: {
  returnTo: string;
  initialError?: AuthUiErrorCode | undefined;
}) {
  const router = useRouter();
  const online = useNetworkStatus();
  const retry = useRetryDelay();
  const [feedback, setFeedback] = useState<AuthFeedbackState>(
    initialError ? { kind: "error", code: initialError } : null,
  );
  const form = useForm<z.infer<typeof signInRequestSchema>>({
    resolver: zodResolver(signInRequestSchema),
    defaultValues: { email: "", password: "", returnTo },
  });

  async function submit(values: z.infer<typeof signInRequestSchema>) {
    if (!online) {
      setFeedback({ kind: "offline" });
      return;
    }
    setFeedback(null);
    try {
      const { envelope } = await postAuth<{ destination: string }>(
        "/api/auth/sign-in",
        values,
      );
      const failure = getFailure(envelope);
      if (failure) {
        const nextFeedback = authFeedbackFromFailure(failure);
        setFeedback(nextFeedback);
        retry.start(
          nextFeedback?.kind === "error"
            ? nextFeedback.retryAfterSeconds
            : undefined,
        );
        return;
      }
      const destination = envelope.data?.destination;
      if (!destination) {
        setFeedback({ kind: "offline" });
        return;
      }
      router.replace(destination);
      router.refresh();
    } catch {
      setFeedback({ kind: "offline" });
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
      <AuthFeedback
        feedback={feedbackWithCountdown(feedback, retry.remaining)}
      />
      {!online ? <AuthFeedback feedback={{ kind: "offline" }} /> : null}
      <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="email">
          อีเมล
        </label>
        <input
          autoComplete="email"
          className={inputClassName}
          id="email"
          inputMode="email"
          type="email"
          {...form.register("email")}
        />
        <FieldError message={form.formState.errors.email?.message} />
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="password">
          รหัสผ่าน
        </label>
        <input
          autoComplete="current-password"
          className={inputClassName}
          id="password"
          type="password"
          {...form.register("password")}
        />
        <FieldError message={form.formState.errors.password?.message} />
      </div>
      <SubmitButton
        disabled={!online || retry.remaining > 0}
        idleLabel="เข้าสู่ระบบ"
        pending={form.formState.isSubmitting}
        pendingLabel="กำลังเข้าสู่ระบบ"
      />
      <div className="text-muted-foreground flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
        <Link
          className="text-primary font-semibold underline-offset-4 hover:underline"
          href="/auth/sign-up"
        >
          สมัครสมาชิก
        </Link>
        <Link
          className="text-primary font-semibold underline-offset-4 hover:underline"
          href="/auth/forgot-password"
        >
          ลืมรหัสผ่าน
        </Link>
        {feedback?.kind === "error" &&
        feedback.code === "EMAIL_NOT_CONFIRMED" ? (
          <Link
            className="text-primary font-semibold underline-offset-4 hover:underline"
            href="/auth/resend-confirmation"
          >
            ส่งอีเมลยืนยันอีกครั้ง
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function SignUpForm({ returnTo }: { returnTo: string }) {
  const online = useNetworkStatus();
  const retry = useRetryDelay();
  const [feedback, setFeedback] = useState<AuthFeedbackState>(null);
  const [completed, setCompleted] = useState(false);
  const form = useForm<z.infer<typeof signUpFormSchema>>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: {
      email: "",
      password: "",
      passwordConfirmation: "",
      returnTo,
    },
  });

  async function submit(values: z.infer<typeof signUpFormSchema>) {
    if (!online) {
      setFeedback({ kind: "offline" });
      return;
    }
    setFeedback(null);
    try {
      const { envelope } = await postAuth<{ confirmationRequired: true }>(
        "/api/auth/sign-up",
        {
          email: values.email,
          password: values.password,
          returnTo: values.returnTo,
        },
      );
      const failure = getFailure(envelope);
      if (failure) {
        const nextFeedback = authFeedbackFromFailure(failure);
        setFeedback(nextFeedback);
        retry.start(
          nextFeedback?.kind === "error"
            ? nextFeedback.retryAfterSeconds
            : undefined,
        );
        return;
      }
      setCompleted(true);
      setFeedback({
        kind: "success",
        title: "ตรวจอีเมลเพื่อยืนยันบัญชี",
        description:
          "เราแสดงข้อความนี้เหมือนกันเสมอเพื่อปกป้องข้อมูลบัญชี เปิดลิงก์ในอีเมลจากอุปกรณ์นี้เพื่อเข้าสู่ระบบต่อ",
      });
    } catch {
      setFeedback({ kind: "offline" });
    }
  }

  if (completed) {
    return (
      <div>
        <AuthFeedback feedback={feedback} />
        <div className="flex flex-col gap-3">
          <Link
            className="bg-primary text-primary-foreground inline-flex min-h-12 items-center justify-center rounded-full px-5 font-semibold"
            href="/auth/sign-in"
          >
            กลับหน้าเข้าสู่ระบบ
          </Link>
          <Link
            className="text-primary text-center text-sm font-semibold"
            href="/auth/resend-confirmation"
          >
            ยังไม่ได้รับอีเมล
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
      <AuthFeedback
        feedback={feedbackWithCountdown(feedback, retry.remaining)}
      />
      {!online ? <AuthFeedback feedback={{ kind: "offline" }} /> : null}
      <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="email">
          อีเมล
        </label>
        <input
          autoComplete="email"
          className={inputClassName}
          id="email"
          inputMode="email"
          type="email"
          {...form.register("email")}
        />
        <FieldError message={form.formState.errors.email?.message} />
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="password">
          รหัสผ่าน
        </label>
        <input
          autoComplete="new-password"
          className={inputClassName}
          id="password"
          type="password"
          {...form.register("password")}
        />
        <p className="text-muted-foreground mt-1.5 text-xs">
          อย่างน้อย 10 ตัวอักษร ใช้วลีผ่านยาว ๆ ได้
        </p>
        <FieldError message={form.formState.errors.password?.message} />
      </div>
      <div>
        <label
          className="mb-2 block text-sm font-semibold"
          htmlFor="passwordConfirmation"
        >
          ยืนยันรหัสผ่าน
        </label>
        <input
          autoComplete="new-password"
          className={inputClassName}
          id="passwordConfirmation"
          type="password"
          {...form.register("passwordConfirmation")}
        />
        <FieldError
          message={form.formState.errors.passwordConfirmation?.message}
        />
      </div>
      <div className="border-border bg-muted/50 rounded-xl border p-3 text-sm leading-5">
        บัญชีใหม่เริ่มต้นเป็นนักเรียน
        สิทธิ์ครูต้องมาจากคำเชิญของผู้ดูแลระบบเท่านั้น
      </div>
      <SubmitButton
        disabled={!online || retry.remaining > 0}
        idleLabel="สร้างบัญชีนักเรียน"
        pending={form.formState.isSubmitting}
        pendingLabel="กำลังสร้างบัญชี"
      />
      <p className="text-muted-foreground text-center text-sm">
        มีบัญชีแล้ว?{" "}
        <Link className="text-primary font-semibold" href="/auth/sign-in">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}

function EmailActionForm({
  endpoint,
  idleLabel,
  pendingLabel,
  successTitle,
  successDescription,
  returnTo = "/app",
}: {
  endpoint: "/api/auth/resend-confirmation" | "/api/auth/forgot-password";
  idleLabel: string;
  pendingLabel: string;
  successTitle: string;
  successDescription: string;
  returnTo?: string;
}) {
  const online = useNetworkStatus();
  const retry = useRetryDelay();
  const [feedback, setFeedback] = useState<AuthFeedbackState>(null);
  const form = useForm<z.infer<typeof emailRequestSchema>>({
    resolver: zodResolver(emailRequestSchema),
    defaultValues: { email: "", returnTo },
  });

  async function submit(values: z.infer<typeof emailRequestSchema>) {
    if (!online) {
      setFeedback({ kind: "offline" });
      return;
    }
    setFeedback(null);
    try {
      const { envelope } = await postAuth<{ accepted: true }>(endpoint, values);
      const failure = getFailure(envelope);
      if (failure) {
        const nextFeedback = authFeedbackFromFailure(failure);
        setFeedback(nextFeedback);
        retry.start(
          nextFeedback?.kind === "error"
            ? nextFeedback.retryAfterSeconds
            : undefined,
        );
        return;
      }
      setFeedback({
        kind: "success",
        title: successTitle,
        description: successDescription,
      });
    } catch {
      setFeedback({ kind: "offline" });
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
      <AuthFeedback
        feedback={feedbackWithCountdown(feedback, retry.remaining)}
      />
      {!online ? <AuthFeedback feedback={{ kind: "offline" }} /> : null}
      <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="email">
          อีเมล
        </label>
        <input
          autoComplete="email"
          className={inputClassName}
          id="email"
          inputMode="email"
          type="email"
          {...form.register("email")}
        />
        <FieldError message={form.formState.errors.email?.message} />
      </div>
      <SubmitButton
        disabled={!online || retry.remaining > 0}
        idleLabel={
          retry.remaining ? `ลองใหม่ได้ใน ${retry.remaining} วินาที` : idleLabel
        }
        pending={form.formState.isSubmitting}
        pendingLabel={pendingLabel}
      />
      <p className="text-muted-foreground text-center text-sm">
        <Link className="text-primary font-semibold" href="/auth/sign-in">
          กลับหน้าเข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}

export function ResendConfirmationForm({ returnTo }: { returnTo: string }) {
  return (
    <EmailActionForm
      endpoint="/api/auth/resend-confirmation"
      idleLabel="ส่งอีเมลยืนยันอีกครั้ง"
      pendingLabel="กำลังส่งคำขอ"
      returnTo={returnTo}
      successDescription="เราแสดงข้อความนี้เหมือนกันเสมอเพื่อไม่เปิดเผยว่าอีเมลใดมีบัญชี"
      successTitle="ตรวจกล่องอีเมลอีกครั้ง"
    />
  );
}

export function ForgotPasswordForm() {
  return (
    <EmailActionForm
      endpoint="/api/auth/forgot-password"
      idleLabel="ส่งลิงก์ตั้งรหัสผ่านใหม่"
      pendingLabel="กำลังส่งคำขอ"
      successDescription="หากอีเมลนี้มีบัญชี คุณจะได้รับลิงก์สำหรับตั้งรหัสผ่านใหม่"
      successTitle="ตรวจกล่องอีเมลของคุณ"
    />
  );
}

export function UpdatePasswordForm() {
  const online = useNetworkStatus();
  const retry = useRetryDelay();
  const [feedback, setFeedback] = useState<AuthFeedbackState>(null);
  const [completed, setCompleted] = useState(false);
  const form = useForm<z.infer<typeof updatePasswordFormSchema>>({
    resolver: zodResolver(updatePasswordFormSchema),
    defaultValues: { password: "", passwordConfirmation: "" },
  });

  async function submit(values: z.infer<typeof updatePasswordFormSchema>) {
    if (!online) {
      setFeedback({ kind: "offline" });
      return;
    }
    setFeedback(null);
    try {
      const { envelope } = await postAuth<{ updated: true; signedOut: true }>(
        "/api/auth/update-password",
        { password: values.password },
      );
      const failure = getFailure(envelope);
      if (failure) {
        const nextFeedback = authFeedbackFromFailure(failure);
        setFeedback(nextFeedback);
        retry.start(
          nextFeedback?.kind === "error"
            ? nextFeedback.retryAfterSeconds
            : undefined,
        );
        return;
      }
      setCompleted(true);
      setFeedback({
        kind: "success",
        title: "ตั้งรหัสผ่านใหม่แล้ว",
        description:
          "ระบบออกจากเซสชันกู้คืนแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่",
      });
    } catch {
      setFeedback({ kind: "offline" });
    }
  }

  if (completed) {
    return (
      <div>
        <AuthFeedback feedback={feedback} />
        <Link
          className="bg-primary text-primary-foreground inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 font-semibold"
          href="/auth/sign-in"
        >
          เข้าสู่ระบบด้วยรหัสผ่านใหม่
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
      <AuthFeedback
        feedback={feedbackWithCountdown(feedback, retry.remaining)}
      />
      {!online ? <AuthFeedback feedback={{ kind: "offline" }} /> : null}
      <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="password">
          รหัสผ่านใหม่
        </label>
        <input
          autoComplete="new-password"
          className={inputClassName}
          id="password"
          type="password"
          {...form.register("password")}
        />
        <p className="text-muted-foreground mt-1.5 text-xs">
          อย่างน้อย 10 ตัวอักษร
        </p>
        <FieldError message={form.formState.errors.password?.message} />
      </div>
      <div>
        <label
          className="mb-2 block text-sm font-semibold"
          htmlFor="passwordConfirmation"
        >
          ยืนยันรหัสผ่านใหม่
        </label>
        <input
          autoComplete="new-password"
          className={inputClassName}
          id="passwordConfirmation"
          type="password"
          {...form.register("passwordConfirmation")}
        />
        <FieldError
          message={form.formState.errors.passwordConfirmation?.message}
        />
      </div>
      <SubmitButton
        disabled={!online || retry.remaining > 0}
        idleLabel="บันทึกรหัสผ่านใหม่"
        pending={form.formState.isSubmitting}
        pendingLabel="กำลังบันทึก"
      />
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const online = useNetworkStatus();
  const [feedback, setFeedback] = useState<AuthFeedbackState>(null);
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (!online) {
      setFeedback({ kind: "offline" });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const { envelope } = await postAuth<{ signedOut: true }>(
        "/api/auth/sign-out",
        {},
      );
      const failure = getFailure(envelope);
      if (failure) {
        setFeedback(authFeedbackFromFailure(failure));
        return;
      }
      router.replace("/auth/sign-in");
      router.refresh();
    } catch {
      setFeedback({ kind: "offline" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <AuthFeedback feedback={feedback} />
      <Button disabled={pending || !online} onClick={signOut} variant="outline">
        {pending ? "กำลังออกจากระบบ" : "ออกจากระบบ"}
      </Button>
    </div>
  );
}
