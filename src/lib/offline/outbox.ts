"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  deleteLocal,
  listLocal,
  localStoreAvailable,
  putLocal,
} from "./local-store";
import { deviceUserId } from "./use-device-draft";

// P14-01/P14-02: actions taken offline wait on the device and are sent once,
// in order, when the device reconnects (OBS-009, OBS-010, owner item 78).
// Every action carries its own idempotency key (client generated or client
// submission ID), so a resend after a lost response is the same request.

export type OutboxKind =
  "start_observation" | "submit_observation" | "resubmit_observation";

export interface OutboxAction {
  id: string;
  kind: OutboxKind;
  /** Session for a start, observation for a submit. */
  scope: string;
  url: string;
  body: Record<string, unknown>;
  /** Short text shown in the sync list. */
  label: string;
  status: "pending" | "sending" | "failed";
  errorCode: string | null;
  attempts: number;
  createdAt: number;
}

export type OutboxResult =
  | { ok: true; data: unknown }
  | { ok: false; kind: "network" }
  | { ok: false; kind: "denied"; code: string };

const CHANGE_EVENT = "ai-escort:outbox";
let version = 0;

function notify() {
  version += 1;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export async function enqueueOutbox(
  action: Omit<OutboxAction, "status" | "errorCode" | "attempts" | "createdAt">,
) {
  const userId = await deviceUserId();
  if (!userId || !localStoreAvailable()) return false;
  await putLocal<OutboxAction>("outbox", {
    key: action.id,
    scope: action.scope,
    userId,
    updatedAt: Date.now(),
    value: {
      ...action,
      status: "pending",
      errorCode: null,
      attempts: 0,
      createdAt: Date.now(),
    },
  });
  notify();
  return true;
}

export async function listOutbox(scope?: string): Promise<OutboxAction[]> {
  const userId = await deviceUserId();
  if (!userId || !localStoreAvailable()) return [];
  try {
    const records = await listLocal<OutboxAction>("outbox", userId, scope);
    return records
      .map((record) => record.value)
      .sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function dismissOutbox(id: string) {
  await deleteLocal("outbox", id);
  notify();
}

async function saveAction(userId: string, action: OutboxAction) {
  await putLocal<OutboxAction>("outbox", {
    key: action.id,
    scope: action.scope,
    userId,
    updatedAt: Date.now(),
    value: action,
  });
}

/** Sends one queued action; the response envelope decides the outcome. */
export async function sendOutboxAction(
  action: OutboxAction,
): Promise<OutboxResult> {
  let response: Response;
  try {
    response = await fetch(action.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action.body),
    });
  } catch {
    return { ok: false, kind: "network" };
  }
  const envelope = (await response.json().catch(() => null)) as {
    data: unknown;
    error: { code: string } | null;
  } | null;
  if (response.ok && envelope && !envelope.error) {
    return { ok: true, data: envelope.data };
  }
  if (!envelope?.error && response.status >= 500) {
    return { ok: false, kind: "network" };
  }
  return {
    ok: false,
    kind: "denied",
    code: envelope?.error?.code ?? "FORBIDDEN",
  };
}

let running: Promise<number> | null = null;

/**
 * Sends pending actions oldest first, one at a time. A network failure stops
 * the run and keeps everything for the next reconnect; a denial is kept as
 * failed with its code so the student sees why and can dismiss it.
 */
export function runOutbox(
  send: (action: OutboxAction) => Promise<OutboxResult> = sendOutboxAction,
): Promise<number> {
  running ??= (async () => {
    let sent = 0;
    try {
      const userId = await deviceUserId();
      if (!userId || !localStoreAvailable()) return 0;
      const actions = await listOutbox();
      for (const action of actions) {
        if (action.status === "failed") continue;
        await saveAction(userId, {
          ...action,
          status: "sending",
          attempts: action.attempts + 1,
        });
        notify();
        const result = await send(action);
        if (result.ok) {
          await deleteLocal("outbox", action.id);
          sent += 1;
          notify();
          continue;
        }
        if (result.kind === "network") {
          await saveAction(userId, {
            ...action,
            status: "pending",
            attempts: action.attempts + 1,
          });
          notify();
          break;
        }
        await saveAction(userId, {
          ...action,
          status: "failed",
          errorCode: result.code,
          attempts: action.attempts + 1,
        });
        notify();
      }
    } finally {
      running = null;
    }
    return sent;
  })();
  return running;
}

/**
 * The queued actions for one scope (or all), kept current, and a runner that
 * sends them on mount, reconnect, and return to the foreground.
 */
export function useOutbox(
  scope: string | undefined,
  onSent: () => void,
  online: boolean,
) {
  const tick = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  const [actions, setActions] = useState<OutboxAction[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listOutbox(scope).then((next) => {
      if (!cancelled) setActions(next);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, tick]);

  const run = useCallback(() => {
    void runOutbox().then((sent) => {
      if (sent > 0) onSent();
    });
  }, [onSent]);

  useEffect(() => {
    if (!online) return;
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [online, run]);

  return { actions, run };
}
