import { describe, expect, it } from "vitest";

import {
  buildStartObservationRequest,
  captureFixFromPosition,
  captureQuality,
  flaggedSaveAllowed,
  geolocationErrorOutcome,
} from "./capture";
import { POOR_ACCURACY_M, startObservationRequestSchema } from "./contracts";
import {
  draftNotesFormSchema,
  editedDraftFields,
  mergeDraftEdits,
  updateDraftRequestOf,
} from "./draft-form";

const sessionId = "62000000-0000-4000-8000-000000008701";
const clientGeneratedId = "82000000-0000-4000-8000-000000008701";

function position(latitude: number, longitude: number, accuracy: number) {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.parse("2026-09-19T02:00:00Z"),
  } as unknown as GeolocationPosition;
}

describe("capture helpers", () => {
  it("rounds a browser fix and keeps its own timestamp", () => {
    expect(
      captureFixFromPosition(position(13.755100491, 100.505100049, 7.4)),
    ).toEqual({
      lat: 13.7551,
      lng: 100.5051,
      accuracyM: 7.4,
      capturedAt: "2026-09-19T02:00:00.000Z",
    });
    expect(captureFixFromPosition(position(Number.NaN, 100, 5))).toBeNull();
    expect(captureFixFromPosition(position(13, 100, 0))).toBeNull();
  });

  it("warns above the poor-accuracy threshold only", () => {
    expect(captureQuality(POOR_ACCURACY_M)).toBe("good");
    expect(captureQuality(POOR_ACCURACY_M + 0.1)).toBe("poor");
  });

  it("maps geolocation errors to capture outcomes", () => {
    expect(geolocationErrorOutcome({ code: 1 })).toBe("denied");
    expect(geolocationErrorOutcome({ code: 2 })).toBe("position_unavailable");
    expect(geolocationErrorOutcome({ code: 3 })).toBe("timeout");
  });

  it("allows the flagged save only after a retry or timeout, never after denial", () => {
    expect(
      flaggedSaveAllowed({
        outcome: "position_unavailable",
        retries: 0,
        sawTimeout: false,
      }),
    ).toBe(false);
    expect(
      flaggedSaveAllowed({
        outcome: "position_unavailable",
        retries: 1,
        sawTimeout: false,
      }),
    ).toBe(true);
    expect(
      flaggedSaveAllowed({ outcome: "timeout", retries: 0, sawTimeout: true }),
    ).toBe(true);
    expect(
      flaggedSaveAllowed({ outcome: "denied", retries: 3, sawTimeout: true }),
    ).toBe(false);
    expect(
      flaggedSaveAllowed({ outcome: null, retries: 3, sawTimeout: true }),
    ).toBe(false);
  });

  it("builds captured and unavailable start bodies the server contract accepts", () => {
    const captured = buildStartObservationRequest(
      clientGeneratedId,
      sessionId,
      {
        kind: "fix",
        fix: {
          lat: 13.7551,
          lng: 100.5051,
          accuracyM: 150,
          capturedAt: "2026-09-19T02:00:00.000Z",
        },
      },
    );
    expect(captured).toEqual({
      clientGeneratedId,
      sessionId,
      capture: {
        locationStatus: "captured",
        lat: 13.7551,
        lng: 100.5051,
        accuracyM: 150,
        capturedAt: "2026-09-19T02:00:00.000Z",
      },
    });

    const flagged = buildStartObservationRequest(clientGeneratedId, sessionId, {
      kind: "flagged",
      reason: "timeout",
      capturedAt: "2026-09-19T02:00:00.000Z",
    });
    expect(flagged).toEqual({
      clientGeneratedId,
      sessionId,
      capture: {
        locationStatus: "unavailable",
        unavailableReason: "timeout",
        capturedAt: "2026-09-19T02:00:00.000Z",
      },
    });
    for (const body of [captured, flagged]) {
      expect(startObservationRequestSchema.safeParse(body).success).toBe(true);
    }

    expect(
      buildStartObservationRequest("not-a-uuid", sessionId, {
        kind: "flagged",
        reason: "timeout",
        capturedAt: "2026-09-19T02:00:00.000Z",
      }),
    ).toBeNull();
  });
});

describe("draft form helpers", () => {
  const base = {
    commonName: "มะม่วง",
    scientificName: "",
    evidenceNote: "",
  };

  it("sends trimmed values and blanks as null with the expected version", () => {
    expect(
      updateDraftRequestOf({
        expectedVersion: 4,
        commonName: "  มะม่วง ",
        scientificName: "   ",
        evidenceNote: "ใบเดี่ยว",
      }),
    ).toEqual({
      expectedVersion: 4,
      commonName: "มะม่วง",
      scientificName: null,
      evidenceNote: "ใบเดี่ยว",
    });
  });

  it("limits fields by their trimmed length", () => {
    const valid = draftNotesFormSchema.safeParse({
      expectedVersion: 1,
      commonName: `${"ก".repeat(120)}   `,
      scientificName: "",
      evidenceNote: "",
    });
    expect(valid.success).toBe(true);
    const tooLong = draftNotesFormSchema.safeParse({
      expectedVersion: 1,
      commonName: "ก".repeat(121),
      scientificName: "",
      evidenceNote: "",
    });
    expect(tooLong.success).toBe(false);
  });

  it("re-applies only the student's edits onto the latest version", () => {
    const local = { ...base, evidenceNote: "ใบเดี่ยว" };
    const latest = {
      commonName: "มะม่วงป่า",
      scientificName: "Mangifera caloneura",
      evidenceNote: "",
    };
    expect(editedDraftFields(base, local)).toEqual(["evidenceNote"]);
    expect(mergeDraftEdits(base, local, latest)).toEqual({
      values: {
        commonName: "มะม่วงป่า",
        scientificName: "Mangifera caloneura",
        evidenceNote: "ใบเดี่ยว",
      },
      reapplied: ["evidenceNote"],
    });
  });

  it("keeps the student's value when both screens changed the same field", () => {
    const local = { ...base, commonName: "มะม่วงหิมพานต์" };
    const latest = { ...base, commonName: "มะปราง" };
    expect(mergeDraftEdits(base, local, latest).values.commonName).toBe(
      "มะม่วงหิมพานต์",
    );
    // Whitespace alone is not an edit.
    expect(
      editedDraftFields(base, { ...base, commonName: "มะม่วง  " }),
    ).toEqual([]);
  });
});
