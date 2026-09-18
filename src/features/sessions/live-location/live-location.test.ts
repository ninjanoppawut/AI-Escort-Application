import { describe, expect, it } from "vitest";

import {
  LIVE_LOCATION_TIMING,
  locationSampleMessageSchema,
  parseSessionTopic,
  recordLocationSampleRequestSchema,
  roundCoordinate,
  sessionGroupTopic,
  sessionLiveLocationsSchema,
  sessionLocationTopic,
  sessionSignalSchema,
  sessionTeachersTopic,
} from "./contracts";
import {
  distanceMeters,
  fixFromPosition,
  isPublishStopStatus,
  shouldBroadcast,
  shouldPublish,
  shouldRecordDurable,
} from "./publisher";
import { interpretRecordSampleRow } from "./results";

const sessionId = "70000000-0000-4000-8000-000000000001";
const groupId = "30000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";

describe("session topics", () => {
  it("builds and parses the three private session topics", () => {
    expect(parseSessionTopic(sessionTeachersTopic(sessionId))).toEqual({
      kind: "teachers",
      sessionId,
    });
    expect(parseSessionTopic(sessionGroupTopic(sessionId, groupId))).toEqual({
      kind: "group",
      sessionId,
      groupId,
    });
    expect(parseSessionTopic(sessionLocationTopic(sessionId, userId))).toEqual({
      kind: "location",
      sessionId,
      userId,
    });
  });

  it("rejects topics the database parser also rejects", () => {
    for (const topic of [
      "session:7000000A-0000-4000-8000-00000000000B:teachers",
      `session:${sessionId}:teachers:extra`,
      `session:${sessionId}:location`,
      `class:${sessionId}:groups`,
      `session:${sessionId}:observations`,
      "",
    ]) {
      expect(parseSessionTopic(topic)).toBeNull();
    }
  });
});

describe("live-location payloads", () => {
  const sample = {
    type: "location.sample",
    version: 1,
    sessionId,
    seq: 3,
    lat: 13.755123,
    lng: 100.505988,
    accuracyM: 8,
    headingDeg: null,
    speedMps: 1.2,
    recordedAt: "2026-09-18T10:00:00.000Z",
  } as const;

  it("accepts a sample and never carries identity", () => {
    expect(locationSampleMessageSchema.parse(sample)).toEqual(sample);
    expect(
      locationSampleMessageSchema.safeParse({ ...sample, userId }).success,
    ).toBe(false);
    expect(
      locationSampleMessageSchema.safeParse({ ...sample, displayName: "Ada" })
        .success,
    ).toBe(false);
  });

  it("bounds coordinates and accuracy", () => {
    for (const patch of [
      { lat: 91 },
      { lng: -181 },
      { accuracyM: 0 },
      { accuracyM: Number.NaN },
      { seq: -1 },
    ]) {
      expect(
        locationSampleMessageSchema.safeParse({ ...sample, ...patch }).success,
      ).toBe(false);
    }
  });

  it("validates the durable sample request strictly", () => {
    const request = {
      clientSampleId: "80000000-0000-4000-8000-000000000001",
      lat: 13.75,
      lng: 100.5,
      accuracyM: 12,
      recordedAt: "2026-09-18T10:00:00+07:00",
    };
    expect(recordLocationSampleRequestSchema.parse(request)).toEqual(request);
    expect(
      recordLocationSampleRequestSchema.safeParse({ ...request, userId })
        .success,
    ).toBe(false);
    expect(
      recordLocationSampleRequestSchema.safeParse({
        ...request,
        recordedAt: "yesterday",
      }).success,
    ).toBe(false);
  });

  it("accepts pointer-only signals including the realtime message id", () => {
    const signal = {
      id: "90000000-0000-4000-8000-000000000001",
      type: "session.group_status_changed",
      version: 1,
      sessionId,
      sessionGroupId: null,
      groupId,
      changedAt: "2026-09-18T10:00:00.000Z",
    };
    expect(sessionSignalSchema.parse(signal)).toEqual(signal);
    expect(sessionSignalSchema.safeParse({ ...signal, lat: 13 }).success).toBe(
      false,
    );
  });

  it("parses the teacher read model strictly", () => {
    const model = {
      sessionStatus: "open",
      activeSessionGroupId: "31000000-0000-4000-8000-000000000001",
      activeGroupId: groupId,
      publishing: true,
      items: [
        {
          userId,
          displayName: "Ada Leader",
          roleAtStart: "leader",
          latestSample: {
            lat: 13.755123,
            lng: 100.505988,
            accuracyM: 8.5,
            recordedAt: "2026-09-18T10:00:00+00:00",
            receivedAt: "2026-09-18T10:00:01+00:00",
          },
        },
      ],
      refreshedAt: "2026-09-18T10:00:02+00:00",
    };
    expect(sessionLiveLocationsSchema.parse(model)).toEqual(model);
    expect(
      sessionLiveLocationsSchema.safeParse({ ...model, track: [] }).success,
    ).toBe(false);
  });

  it("rounds coordinates to six decimals", () => {
    expect(roundCoordinate(13.7551234567)).toBe(13.755123);
    expect(roundCoordinate(-100.5059876)).toBe(-100.505988);
  });
});

describe("publisher lifecycle", () => {
  const allowed = {
    canPublish: true,
    noticeAcknowledged: true,
    visible: true,
    online: true,
  };

  it("publishes only when every gate holds", () => {
    expect(shouldPublish(allowed)).toBe(true);
    for (const key of Object.keys(allowed) as Array<keyof typeof allowed>) {
      expect(shouldPublish({ ...allowed, [key]: false })).toBe(false);
    }
  });

  it("throttles broadcasts by interval and movement with a heartbeat", () => {
    const start = { lat: 13.75, lng: 100.5, sentAtMs: 0 };
    expect(shouldBroadcast(null, start, 0)).toBe(true);
    expect(shouldBroadcast(start, { lat: 13.751, lng: 100.5 }, 1_000)).toBe(
      false,
    );
    expect(shouldBroadcast(start, { lat: 13.751, lng: 100.5 }, 3_000)).toBe(
      true,
    );
    expect(shouldBroadcast(start, { lat: 13.75, lng: 100.5 }, 3_000)).toBe(
      false,
    );
    expect(
      shouldBroadcast(
        start,
        { lat: 13.75, lng: 100.5 },
        LIVE_LOCATION_TIMING.heartbeatIntervalMs,
      ),
    ).toBe(true);
  });

  it("keeps durable samples at the durable interval", () => {
    expect(shouldRecordDurable(null, 0)).toBe(true);
    expect(shouldRecordDurable(0, 14_999)).toBe(false);
    expect(shouldRecordDurable(0, 15_000)).toBe(true);
  });

  it("measures distance in meters", () => {
    const meters = distanceMeters(
      { lat: 13.75, lng: 100.5 },
      { lat: 13.751, lng: 100.5 },
    );
    expect(meters).toBeGreaterThan(110);
    expect(meters).toBeLessThan(112);
  });

  it("converts a browser position and rejects unusable fixes", () => {
    const position = (coords: Partial<GeolocationCoordinates>) =>
      ({
        timestamp: Date.parse("2026-09-18T10:00:00.000Z"),
        coords: {
          latitude: 13.7551234567,
          longitude: 100.5059876,
          accuracy: 9,
          heading: null,
          speed: null,
          altitude: null,
          altitudeAccuracy: null,
          ...coords,
        },
      }) as GeolocationPosition;

    expect(fixFromPosition(position({}))).toEqual({
      lat: 13.755123,
      lng: 100.505988,
      accuracyM: 9,
      headingDeg: null,
      speedMps: null,
      recordedAt: "2026-09-18T10:00:00.000Z",
    });
    expect(fixFromPosition(position({ accuracy: 0 }))).toBeNull();
    expect(fixFromPosition(position({ latitude: Number.NaN }))).toBeNull();
  });

  it("stops publishing on denials but not on transient failures", () => {
    for (const status of [401, 403, 404, 409]) {
      expect(isPublishStopStatus(status)).toBe(true);
    }
    for (const status of [200, 422, 429, 500, 503]) {
      expect(isPublishStopStatus(status)).toBe(false);
    }
  });
});

describe("durable sample results", () => {
  const base = { error_details: null, retry_after_s: null };

  it("returns recorded and duplicate samples", () => {
    expect(
      interpretRecordSampleRow({
        ...base,
        outcome: "recorded",
        error_code: null,
        sample_id: "81000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({
      data: {
        outcome: "recorded",
        sampleId: "81000000-0000-4000-8000-000000000001",
      },
    });
    expect(
      interpretRecordSampleRow({
        ...base,
        outcome: "duplicate",
        error_code: null,
        sample_id: "81000000-0000-4000-8000-000000000001",
      }).data?.outcome,
    ).toBe("duplicate");
  });

  it("maps denials to stable codes and HTTP statuses", () => {
    const denied = (error_code: string, extra = {}) =>
      interpretRecordSampleRow({
        ...base,
        outcome: "denied",
        error_code,
        sample_id: null,
        ...extra,
      });

    expect(denied("SESSION_PAUSED").status).toBe(409);
    expect(denied("SESSION_NOT_OPEN").status).toBe(409);
    expect(denied("GROUP_NOT_ACTIVE").error?.code).toBe("GROUP_NOT_ACTIVE");
    expect(denied("GROUP_NOT_ACTIVE").status).toBe(409);

    const limited = denied("RATE_LIMITED", { retry_after_s: 6 });
    expect(limited.status).toBe(429);
    expect(limited.retryAfterSeconds).toBe(6);

    const invalid = denied("VALIDATION_FAILED", {
      error_details: { field: "lat" },
    });
    expect(invalid.status).toBe(422);
    expect(invalid.error?.details).toEqual({ fields: ["lat"] });
  });

  it("denies unknown codes and malformed rows", () => {
    expect(
      interpretRecordSampleRow({
        ...base,
        outcome: "denied",
        error_code: "SOMETHING_ELSE",
        sample_id: null,
      }).status,
    ).toBe(403);
    expect(interpretRecordSampleRow(undefined).status).toBe(403);
    expect(
      interpretRecordSampleRow({
        ...base,
        outcome: "recorded",
        error_code: null,
        sample_id: null,
      }).status,
    ).toBe(403);
  });
});
