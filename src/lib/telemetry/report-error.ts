import type { ClientErrorReport } from "./contracts";

// Fire-and-forget browser failure reports for failures the server never sees
// (direct Storage uploads, offline sync). A report never throws, never
// blocks the caller, and the same flow/stage/code is sent at most once per
// 30 seconds from one tab.

const DEDUPE_MS = 30_000;
const lastSent = new Map<string, number>();

export function reportClientError(
  report: Omit<ClientErrorReport, "occurredAt">,
  now = Date.now(),
) {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  const key = `${report.flow}:${report.stage}:${report.code}`;
  const previous = lastSent.get(key);
  if (previous !== undefined && now - previous < DEDUPE_MS) return;
  lastSent.set(key, now);
  try {
    void fetch("/api/telemetry/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...report,
        occurredAt: new Date(now).toISOString(),
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Telemetry is best effort.
  }
}

/** Test hook. */
export function resetClientErrorReportsForTests() {
  lastSent.clear();
}
