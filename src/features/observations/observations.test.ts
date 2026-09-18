import { describe, expect, it } from "vitest";

import {
  OBSERVATION_STATUSES,
  OBSERVATION_STATUS_LABELS,
  observationDraftSchema,
  startObservationRequestSchema,
  updateObservationDraftRequestSchema,
} from "./contracts";
import {
  OBSERVATION_ERROR_PRESENTATIONS,
  OBSERVATION_UI_ERROR_CODES,
  httpStatusForObservationError,
  mapPostgresObservationError,
} from "./errors";
import {
  interpretStartObservationRow,
  interpretUpdateDraftRow,
} from "./results";

const sessionId = "70000000-0000-4000-8000-000000000001";
const clientGeneratedId = "80000000-0000-4000-8000-000000000001";
const observationId = "81000000-0000-4000-8000-000000000001";

const draft = {
  id: observationId,
  clientGeneratedId,
  status: "draft",
  version: 2,
  capture: {
    locationStatus: "captured",
    lat: 13.755123,
    lng: 100.505988,
    accuracyM: 8.5,
    capturedAt: "2026-09-18T10:00:00+00:00",
    unavailableReason: null,
  },
  draft: {
    commonName: "Golden shower",
    scientificName: "Cassia fistula",
    evidenceNote: null,
  },
  session: {
    id: sessionId,
    classId: "20000000-0000-4000-8000-000000000001",
    title: "Morning round",
    status: "open",
  },
  activity: { id: "60000000-0000-4000-8000-000000000001", title: "Garden" },
  groupStatus: "active",
  permissions: { canEdit: true, blockedCode: null, blockedReason: null },
  createdAt: "2026-09-18T10:00:01+00:00",
  updatedAt: "2026-09-18T10:05:00+00:00",
  refreshedAt: "2026-09-18T10:05:01+00:00",
};

describe("observation start request", () => {
  it("accepts a captured fix and an explicit unavailable capture", () => {
    expect(
      startObservationRequestSchema.safeParse({
        clientGeneratedId,
        sessionId,
        capture: {
          locationStatus: "captured",
          lat: 13.75,
          lng: 100.5,
          accuracyM: 250,
          capturedAt: "2026-09-18T10:00:00+07:00",
        },
      }).success,
    ).toBe(true);
    expect(
      startObservationRequestSchema.safeParse({
        clientGeneratedId,
        sessionId,
        capture: {
          locationStatus: "unavailable",
          unavailableReason: "timeout",
          capturedAt: "2026-09-18T10:00:00Z",
        },
      }).success,
    ).toBe(true);
  });

  it("never pairs coordinates with an unavailable capture", () => {
    expect(
      startObservationRequestSchema.safeParse({
        clientGeneratedId,
        sessionId,
        capture: {
          locationStatus: "unavailable",
          unavailableReason: "timeout",
          capturedAt: "2026-09-18T10:00:00Z",
          lat: 13.75,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range fixes, unknown reasons, and extra keys", () => {
    const base = {
      locationStatus: "captured",
      lat: 13.75,
      lng: 100.5,
      accuracyM: 8,
      capturedAt: "2026-09-18T10:00:00Z",
    };
    for (const capture of [
      { ...base, lat: 91 },
      { ...base, lng: 181 },
      { ...base, accuracyM: 0 },
      { ...base, capturedAt: "10:00" },
      {
        locationStatus: "unavailable",
        unavailableReason: "denied",
        capturedAt: "2026-09-18T10:00:00Z",
      },
    ]) {
      expect(
        startObservationRequestSchema.safeParse({
          clientGeneratedId,
          sessionId,
          capture,
        }).success,
      ).toBe(false);
    }
    expect(
      startObservationRequestSchema.safeParse({
        clientGeneratedId,
        sessionId,
        capture: base,
        observerId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });
});

describe("draft edit request", () => {
  it("trims values and stores empty text as null", () => {
    expect(
      updateObservationDraftRequestSchema.parse({
        expectedVersion: 2,
        commonName: "  Golden shower ",
        scientificName: "",
        evidenceNote: null,
      }),
    ).toEqual({
      expectedVersion: 2,
      commonName: "Golden shower",
      scientificName: null,
      evidenceNote: null,
    });
  });

  it("enforces version and length limits", () => {
    expect(
      updateObservationDraftRequestSchema.safeParse({
        expectedVersion: 0,
        commonName: null,
        scientificName: null,
        evidenceNote: null,
      }).success,
    ).toBe(false);
    expect(
      updateObservationDraftRequestSchema.safeParse({
        expectedVersion: 1,
        commonName: "x".repeat(121),
        scientificName: null,
        evidenceNote: null,
      }).success,
    ).toBe(false);
  });
});

describe("observation read model", () => {
  it("parses the owner draft strictly", () => {
    expect(observationDraftSchema.parse(draft)).toEqual(draft);
    expect(
      observationDraftSchema.safeParse({ ...draft, observerId: "x" }).success,
    ).toBe(false);
  });

  it("labels every lifecycle status", () => {
    for (const status of OBSERVATION_STATUSES) {
      expect(OBSERVATION_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("observation results", () => {
  const row = {
    error_code: null,
    error_details: null,
    observation_id: observationId,
    observation_version: 1,
  };

  it("returns created and existing starts", () => {
    expect(
      interpretStartObservationRow({ ...row, outcome: "created" }).data,
    ).toEqual({ outcome: "created", observationId, version: 1 });
    expect(
      interpretStartObservationRow({ ...row, outcome: "existing" }).data
        ?.outcome,
    ).toBe("existing");
  });

  it("maps start denials with safe details only", () => {
    const waiting = interpretStartObservationRow({
      ...row,
      outcome: "denied",
      error_code: "GROUP_NOT_ACTIVE",
      error_details: { reason: "group_waiting", extra: "leak" },
      observation_id: null,
      observation_version: null,
    });
    expect(waiting.status).toBe(409);
    expect(waiting.error?.details).toEqual({ reason: "group_waiting" });

    const invalid = interpretStartObservationRow({
      ...row,
      outcome: "denied",
      error_code: "VALIDATION_FAILED",
      error_details: { field: "capturedAt" },
      observation_id: null,
      observation_version: null,
    });
    expect(invalid.status).toBe(422);
    expect(invalid.error?.details).toEqual({ fields: ["capturedAt"] });

    expect(
      interpretStartObservationRow({
        ...row,
        outcome: "denied",
        error_code: "SOMETHING_NEW",
        observation_id: null,
        observation_version: null,
      }).status,
    ).toBe(403);
    expect(interpretStartObservationRow(null).status).toBe(403);
  });

  it("returns the refreshed record with a version conflict", () => {
    const conflict = interpretUpdateDraftRow({
      outcome: "denied",
      error_code: "OBSERVATION_VERSION_CONFLICT",
      error_details: { currentVersion: 2, observation: draft },
      observation_version: 2,
    });
    expect(conflict.status).toBe(409);
    expect(conflict.error?.code).toBe("OBSERVATION_VERSION_CONFLICT");
    expect(conflict.error?.details).toMatchObject({
      currentVersion: 2,
      observation: { draft: { commonName: "Golden shower" } },
    });
  });

  it("returns updated and unchanged edits", () => {
    expect(
      interpretUpdateDraftRow({
        outcome: "unchanged",
        error_code: null,
        error_details: null,
        observation_version: 3,
      }).data,
    ).toEqual({ outcome: "unchanged", version: 3 });
  });
});

describe("observation errors", () => {
  it("presents every code with UI_CONTRACTS titles and statuses", () => {
    for (const code of OBSERVATION_UI_ERROR_CODES) {
      expect(OBSERVATION_ERROR_PRESENTATIONS[code].title).toBeTruthy();
    }
    expect(
      OBSERVATION_ERROR_PRESENTATIONS.OBSERVATION_VERSION_CONFLICT,
    ).toMatchObject({
      title: "ข้อมูลมีการเปลี่ยนแปลงแล้ว",
      action: "ดูข้อมูลล่าสุดและทำซ้ำ",
    });
    expect(httpStatusForObservationError("AUTH_REQUIRED")).toBe(401);
    expect(httpStatusForObservationError("VALIDATION_FAILED")).toBe(422);
    expect(httpStatusForObservationError("IDEMPOTENCY_KEY_REUSE")).toBe(409);
    expect(httpStatusForObservationError("FORBIDDEN")).toBe(403);
  });

  it("maps raised database codes and hides unknown errors", () => {
    expect(mapPostgresObservationError("FORBIDDEN")).toBe("FORBIDDEN");
    expect(mapPostgresObservationError("EMAIL_NOT_CONFIRMED")).toBe(
      "EMAIL_NOT_CONFIRMED",
    );
    expect(mapPostgresObservationError("relation does not exist")).toBe(
      "FORBIDDEN",
    );
  });
});
