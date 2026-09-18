import { describe, expect, it } from "vitest";

import { redactTelemetry } from "@/lib/observability/redaction";

describe("telemetry redaction", () => {
  it("redacts prohibited keys recursively", () => {
    expect(
      redactTelemetry({
        flow: "observation-upload",
        access_token: "secret-token",
        location: {
          latitude: 13.7563,
          longitude: 100.5018,
        },
        nested: [{ evidence_note: "private student text" }],
      }),
    ).toEqual({
      flow: "observation-upload",
      access_token: "[REDACTED]",
      location: {
        latitude: "[REDACTED]",
        longitude: "[REDACTED]",
      },
      nested: [{ evidence_note: "[REDACTED]" }],
    });
  });

  it("redacts signed query values and JWT-like strings", () => {
    const value = redactTelemetry({
      callback: "https://example.test/file?token=private-value&download=1",
      message:
        "credential eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature leaked",
    });

    expect(value).toEqual({
      callback: "https://example.test/file?token=[REDACTED]&download=1",
      message: "credential [REDACTED] leaked",
    });
  });

  it("preserves low-cardinality operational fields", () => {
    expect(
      redactTelemetry({
        routeTemplate: "/api/classes/:id",
        statusClass: "2xx",
        flow: "class-join",
      }),
    ).toEqual({
      routeTemplate: "/api/classes/:id",
      statusClass: "2xx",
      flow: "class-join",
    });
  });

  it("redacts live-location sample fields (P7-03)", () => {
    expect(
      redactTelemetry({
        route: "/api/sessions/:id/location-samples",
        body: { lat: 13.75, lng: 100.5, accuracyM: 8, headingDeg: 90 },
        latestSample: { lat: 13.75, lng: 100.5 },
        queuePosition: 2,
      }),
    ).toEqual({
      route: "/api/sessions/:id/location-samples",
      body: {
        lat: "[REDACTED]",
        lng: "[REDACTED]",
        accuracyM: "[REDACTED]",
        headingDeg: "[REDACTED]",
      },
      latestSample: "[REDACTED]",
      queuePosition: 2,
    });
  });
});
