"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/features/groups/client/use-online-status";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { ADMIN_ERROR_PRESENTATIONS, totpCodeSchema } from "../contracts";

type Step =
  | { kind: "loading" }
  | { kind: "load_failed" }
  | { kind: "verify"; factorId: string }
  | { kind: "enroll"; factorId: string; qrCode: string; secret: string };

type MfaClient = Pick<
  ReturnType<typeof createSupabaseBrowserClient>["auth"]["mfa"],
  "listFactors" | "enroll" | "unenroll" | "challengeAndVerify"
>;

/**
 * Loads the admin's TOTP state: a verified factor is challenged; otherwise
 * stale unverified factors are cleared and a new one is enrolled.
 */
export async function loadMfaStep(mfa: MfaClient): Promise<Step> {
  const { data, error } = await mfa.listFactors();
  if (error || !data) return { kind: "load_failed" };
  const verified = data.totp.find((factor) => factor.status === "verified");
  if (verified) return { kind: "verify", factorId: verified.id };

  for (const factor of data.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await mfa.unenroll({ factorId: factor.id });
    }
  }
  const enrolled = await mfa.enroll({
    factorType: "totp",
    friendlyName: `AI Escort admin ${Date.now()}`,
  });
  if (enrolled.error || !enrolled.data) return { kind: "load_failed" };
  return {
    kind: "enroll",
    factorId: enrolled.data.id,
    qrCode: enrolled.data.totp.qr_code,
    secret: enrolled.data.totp.secret,
  };
}

/**
 * S-admin MFA step (AUTH MFA for admins): enroll a TOTP app on first use, or
 * enter the current code to raise the session to aal2, then return to the
 * admin page that asked for it.
 */
export function AdminMfaScreen({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<z.input<typeof totpCodeSchema>>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: "" },
  });

  const fetchStep = useCallback(() => {
    void loadMfaStep(createSupabaseBrowserClient().auth.mfa)
      .catch((): Step => ({ kind: "load_failed" }))
      .then(setStep);
  }, []);

  // Enrolling creates a factor, so the first load runs once even when
  // effects run twice in development.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetchStep();
  }, [fetchStep]);

  function load() {
    setStep({ kind: "loading" });
    fetchStep();
  }

  const onSubmit = form.handleSubmit(async ({ code }) => {
    if (step.kind !== "verify" && step.kind !== "enroll") return;
    setFailure(null);
    const { error } = await createSupabaseBrowserClient()
      .auth.mfa.challengeAndVerify({ factorId: step.factorId, code })
      .catch(() => ({ error: new Error("network") }));
    if (error) {
      form.reset({ code: "" });
      setFailure(
        error.message === "network"
          ? "เชื่อมต่อไม่ได้ ลองอีกครั้งเมื่อกลับมาออนไลน์"
          : "รหัสไม่ถูกต้องหรือหมดเวลาแล้ว ใช้รหัสใหม่จากแอป",
      );
      return;
    }
    router.replace(returnTo);
    router.refresh();
  });

  const presentation = ADMIN_ERROR_PRESENTATIONS.MFA_REQUIRED;
  return (
    <main className="bg-background min-h-dvh px-4 pt-5 pb-10 sm:px-8">
      <section
        aria-labelledby="admin-mfa-title"
        className="border-border bg-card mx-auto grid max-w-md gap-4 rounded-xl border p-4"
        data-mfa-step={step.kind}
      >
        <div>
          <ShieldCheck aria-hidden="true" className="size-6 text-[#1F5C3A]" />
          <h1 className="mt-2 text-lg font-semibold" id="admin-mfa-title">
            {presentation.title}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {presentation.description}
          </p>
        </div>

        {!online ? (
          <p
            className="flex items-start gap-2 rounded-[10px] border border-[#E8C58A] bg-[#FFF6E5] px-3 py-2 text-sm text-[#5C3A04]"
            role="status"
          >
            <WifiOff aria-hidden="true" className="mt-1 size-4 shrink-0" />
            ออฟไลน์อยู่ · ยืนยันได้เมื่อกลับมาออนไลน์
          </p>
        ) : null}

        {step.kind === "loading" ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            กำลังเตรียมการยืนยัน...
          </p>
        ) : null}

        {step.kind === "load_failed" ? (
          <div className="grid gap-2" role="alert">
            <p className="text-sm text-[#8C1D18]">เตรียมการยืนยันไม่สำเร็จ</p>
            <Button onClick={load} size="lg" variant="outline">
              <RefreshCw aria-hidden="true" className="size-4" />
              ลองอีกครั้ง
            </Button>
          </div>
        ) : null}

        {step.kind === "enroll" ? (
          <div className="grid gap-3" data-mfa-enroll="">
            <p className="text-sm leading-6">
              1. สแกน QR ด้วยแอปยืนยันตัวตน (เช่น Google Authenticator)
            </p>
            {/* The QR is an SVG data URL generated by Supabase Auth. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="QR สำหรับเพิ่มบัญชีผู้ดูแลในแอปยืนยันตัวตน"
              className="mx-auto size-44 rounded-lg border bg-white p-2"
              src={step.qrCode}
            />
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-medium">
                สแกนไม่ได้? กรอกรหัสตั้งค่าเอง
              </summary>
              <code
                className="bg-muted block rounded-md px-3 py-2 font-mono text-[13px] break-all"
                data-mfa-secret=""
              >
                {step.secret}
              </code>
            </details>
            <p className="text-sm leading-6">2. กรอกรหัส 6 หลักที่แอปแสดง</p>
          </div>
        ) : null}

        {step.kind === "verify" || step.kind === "enroll" ? (
          <form className="grid gap-3" noValidate onSubmit={onSubmit}>
            <label className="grid gap-1 text-sm font-medium">
              รหัสจากแอปยืนยันตัวตน
              <input
                aria-describedby="admin-mfa-code-error"
                aria-invalid={Boolean(form.formState.errors.code) || undefined}
                autoComplete="one-time-code"
                className="border-border min-h-11 rounded-[10px] border px-3 text-center font-mono text-lg tracking-[0.3em]"
                inputMode="numeric"
                maxLength={6}
                {...form.register("code")}
              />
            </label>
            <p
              className="min-h-5 text-sm text-[#8C1D18]"
              id="admin-mfa-code-error"
              role={failure || form.formState.errors.code ? "alert" : undefined}
            >
              {form.formState.errors.code?.message ?? failure}
            </p>
            <Button
              disabled={!online || form.formState.isSubmitting}
              size="lg"
              type="submit"
            >
              {form.formState.isSubmitting ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <KeyRound aria-hidden="true" className="size-4" />
              )}
              ยืนยัน
            </Button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
