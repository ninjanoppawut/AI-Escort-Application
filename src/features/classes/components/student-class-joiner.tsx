"use client";

import {
  CheckCircle2,
  Loader2,
  School,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  CLASS_ERROR_PRESENTATIONS,
  type ClassUiErrorCode,
} from "@/features/classes/errors";
import type { ApiFailure, ApiSuccess } from "@/lib/http/envelope";

interface JoinResult {
  class_id: string;
  school_id: string;
  role: "student";
  class_name: string;
  school_name: string;
  already_joined: boolean;
  used_count: number;
}

type JoinState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: JoinResult }
  | { status: "error"; code: ClassUiErrorCode; requestId?: string };

async function parseJoinResponse(response: Response) {
  const envelope = (await response.json().catch(() => null)) as
    ApiSuccess<JoinResult> | ApiFailure | null;

  if (!response.ok || !envelope || envelope.error) {
    const code =
      envelope?.error?.code && envelope.error.code in CLASS_ERROR_PRESENTATIONS
        ? (envelope.error.code as ClassUiErrorCode)
        : "FORBIDDEN";
    return { error: code, requestId: envelope?.requestId };
  }

  return { data: envelope.data };
}

export function StudentClassJoiner({ token }: { token?: string }) {
  const [inviteCode, setInviteCode] = useState("");
  const [state, setState] = useState<JoinState>(
    token ? { status: "loading" } : { status: "idle" },
  );
  const [online, setOnline] = useState(true);
  const tokenConsumeStarted = useRef(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    queueMicrotask(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const normalizedCode = useMemo(
    () => inviteCode.trim().toUpperCase(),
    [inviteCode],
  );

  async function joinWith(body: { inviteCode?: string; token?: string }) {
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }

    setState({ status: "loading" });
    const response = await fetch("/api/classes/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!response) {
      setState({ status: "error", code: "RATE_LIMITED" });
      return;
    }

    const parsed = await parseJoinResponse(response);
    if ("error" in parsed) {
      setState({
        status: "error",
        code: parsed.error,
        ...(parsed.requestId ? { requestId: parsed.requestId } : {}),
      });
      return;
    }

    setState({ status: "success", data: parsed.data });
  }

  useEffect(() => {
    if (!token || tokenConsumeStarted.current) return;
    tokenConsumeStarted.current = true;
    queueMicrotask(() => void joinWith({ token }));
  }, [token]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalizedCode) {
      setState({ status: "error", code: "INVITE_INVALID" });
      return;
    }
    void joinWith({ inviteCode: normalizedCode });
  }

  const disabled = state.status === "loading" || !online;
  const error =
    state.status === "error" ? CLASS_ERROR_PRESENTATIONS[state.code] : null;

  return (
    <main className="bg-background min-h-dvh px-4 py-5 sm:px-8">
      <div className="mx-auto grid max-w-xl gap-5">
        <header className="flex items-center gap-3">
          <span className="bg-primary text-primary-foreground grid size-11 place-items-center rounded-full">
            <School aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-muted-foreground text-sm">AI Escort</p>
            <h1 className="text-2xl font-bold">เข้าร่วมชั้นเรียน</h1>
          </div>
        </header>

        {!online ? (
          <section className="border-border bg-card rounded-lg border p-4">
            <WifiOff aria-hidden="true" className="text-destructive size-6" />
            <h2 className="mt-3 font-semibold">ยังไม่มีสัญญาณอินเทอร์เน็ต</h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              ระบบจะไม่ใช้คำเชิญจนกว่าจะเชื่อมต่อได้ ลองใหม่เมื่อกลับมาออนไลน์
            </p>
          </section>
        ) : null}

        {state.status === "success" ? (
          <section className="border-success/30 bg-success/10 rounded-lg border p-5">
            <CheckCircle2 aria-hidden="true" className="text-success size-8" />
            <h2 className="mt-3 text-xl font-semibold">
              {state.data.already_joined
                ? "คุณอยู่ในชั้นเรียนนี้แล้ว"
                : "เข้าร่วมชั้นเรียนแล้ว"}
            </h2>
            <p className="mt-2 leading-7">
              {state.data.class_name} · {state.data.school_name}
            </p>
            <Link
              className="bg-primary text-primary-foreground mt-5 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
              href="/app"
            >
              ไปหน้าหลัก
            </Link>
          </section>
        ) : (
          <section className="border-border bg-card rounded-lg border p-5">
            <form className="grid gap-4" onSubmit={submit}>
              <label className="grid gap-2">
                <span className="text-sm font-medium">รหัสชั้นเรียน</span>
                <input
                  className="rounded-lg border p-3 font-mono text-lg tracking-wider uppercase"
                  disabled={disabled}
                  inputMode="text"
                  name="inviteCode"
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="ABCD-1234"
                  value={inviteCode}
                />
              </label>
              <button
                className="bg-primary text-primary-foreground inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disabled}
                type="submit"
              >
                {state.status === "loading" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                เข้าร่วมชั้นเรียน
              </button>
            </form>
          </section>
        )}

        {error ? (
          <section className="border-destructive/30 bg-destructive/10 rounded-lg border p-4">
            <TriangleAlert
              aria-hidden="true"
              className="text-destructive size-6"
            />
            <h2 className="mt-3 font-semibold">{error.title}</h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {error.description}
            </p>
            {state.status === "error" && state.requestId ? (
              <p className="text-muted-foreground mt-3 text-xs break-all">
                Request ID: {state.requestId}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
