import { afterEach, describe, expect, it, vi } from "vitest";

import { flowStateOf } from "@/features/admin/components/health-screen";

import { clientErrorReportSchema } from "./contracts";
import {
  reportClientError,
  resetClientErrorReportsForTests,
} from "./report-error";

describe("browser failure reports (P15-03)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetClientErrorReportsForTests();
  });

  it("sends one report per flow/stage/code in 30 seconds and never throws", () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("offline"));
    const report = {
      flow: "upload" as const,
      stage: "upload_failed",
      code: "NETWORK",
      severity: "error" as const,
    };
    expect(() => reportClientError(report, 1_000)).not.toThrow();
    reportClientError(report, 20_000);
    reportClientError({ ...report, code: "IMAGE_TOO_LARGE" }, 20_000);
    reportClientError(report, 31_500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(clientErrorReportSchema.parse(body)).toMatchObject(report);
  });

  it("refuses context keys outside the allowlist", () => {
    expect(
      clientErrorReportSchema.safeParse({
        flow: "upload",
        stage: "upload_failed",
        code: "NETWORK",
        severity: "error",
        context: { signed_url: "https://example.test" },
      }).success,
    ).toBe(false);
    expect(
      clientErrorReportSchema.safeParse({
        flow: "payments",
        stage: "x",
        code: "NETWORK",
        severity: "error",
      }).success,
    ).toBe(false);
  });
});

describe("flow health state", () => {
  const base = {
    flow: "upload",
    errorCount: 0,
    criticalCount: 0,
    lastErrorAt: null,
    topErrorCodes: [],
    telemetry: "errors_only" as const,
  };

  it("never reports a flow without telemetry as healthy", () => {
    expect(flowStateOf({ ...base, telemetry: "unavailable" })).toBe("partial");
    expect(flowStateOf(base)).toBe("ok");
    expect(flowStateOf({ ...base, errorCount: 2 })).toBe("errors");
    expect(flowStateOf({ ...base, errorCount: 2, criticalCount: 1 })).toBe(
      "critical",
    );
  });
});
