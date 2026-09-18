import { LIVE_LOCATION_TIMING, roundCoordinate } from "./contracts";

export interface PublishGate {
  /** Latest authoritative participant view says publishing is allowed. */
  canPublish: boolean;
  /** The student acknowledged the field-mode location notice (PRIVACY §3). */
  noticeAcknowledged: boolean;
  /** The page is visible; hidden pages stop publishing. */
  visible: boolean;
  online: boolean;
}

/** No cached client state authorizes publishing: every input must hold. */
export function shouldPublish(gate: PublishGate) {
  return (
    gate.canPublish && gate.noticeAcknowledged && gate.visible && gate.online
  );
}

export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
  headingDeg: number | null;
  speedMps: number | null;
  recordedAt: string;
}

export interface SentFix {
  lat: number;
  lng: number;
  sentAtMs: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in meters. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Broadcast when moving at most every broadcastIntervalMs, otherwise send a
 * heartbeat so the teacher can tell a still student from a stale one.
 */
export function shouldBroadcast(
  last: SentFix | null,
  next: Pick<Fix, "lat" | "lng">,
  nowMs: number,
  timing = LIVE_LOCATION_TIMING,
) {
  if (!last) return true;
  const elapsed = nowMs - last.sentAtMs;
  if (elapsed >= timing.heartbeatIntervalMs) return true;
  if (elapsed < timing.broadcastIntervalMs) return false;
  return distanceMeters(last, next) >= timing.minimumMovementMeters;
}

export function shouldRecordDurable(
  lastDurableAtMs: number | null,
  nowMs: number,
  timing = LIVE_LOCATION_TIMING,
) {
  return (
    lastDurableAtMs === null ||
    nowMs - lastDurableAtMs >= timing.durableIntervalMs
  );
}

export function fixFromPosition(position: GeolocationPosition): Fix | null {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracy) ||
    accuracy <= 0
  ) {
    return null;
  }
  return {
    lat: roundCoordinate(latitude),
    lng: roundCoordinate(longitude),
    accuracyM: Math.min(accuracy, 100_000),
    headingDeg:
      heading !== null &&
      Number.isFinite(heading) &&
      heading >= 0 &&
      heading <= 360
        ? heading
        : null,
    speedMps:
      speed !== null && Number.isFinite(speed) && speed >= 0 && speed <= 100
        ? speed
        : null,
    recordedAt: new Date(position.timestamp).toISOString(),
  };
}

/** Durable-sample responses that mean publishing must stop at once. */
export function isPublishStopStatus(status: number) {
  return status === 401 || status === 403 || status === 404 || status === 409;
}
