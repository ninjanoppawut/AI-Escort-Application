import { z } from "zod";

import { fixFromPosition } from "@/features/sessions/live-location/publisher";

import {
  POOR_ACCURACY_M,
  observationDraftSchema,
  startObservationRequestSchema,
  type LocationUnavailableReason,
  type StartObservationRequest,
} from "./contracts";

// P8-04 capture step (design S-14, D-019–D-020, D-051). Pure helpers shared by
// the capture sheet, the draft screen, and their tests; nothing here
// authorizes a start — the server re-checks participant and group state.

/**
 * A fresh fix for every capture: never a cached position (maximumAge 0), and a
 * 20 s ceiling so a silent GPS ends in an explicit timeout.
 */
export const CAPTURE_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

// Pending owner item 37 (docs/OWNER_QUESTIONS_PENDING.md): the approved Thai
// wording of the capture-time notice. Working copy from design S-14.
export const CAPTURE_TIME_NOTICE =
  "หมุดของต้นไม้จะใช้ตำแหน่งนี้ ณ ตอนเริ่มบันทึก ไม่ใช่ตอนกดส่ง";

export interface CaptureFix {
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: string;
}

/** Rounded, validated fix from a browser position, or null when unusable. */
export function captureFixFromPosition(
  position: GeolocationPosition,
): CaptureFix | null {
  const fix = fixFromPosition(position);
  if (!fix || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return null;
  return {
    lat: fix.lat,
    lng: fix.lng,
    accuracyM: fix.accuracyM,
    capturedAt: fix.recordedAt,
  };
}

export type CaptureQuality = "good" | "poor";

/** Poor accuracy warns only; it never blocks a start (D-051). */
export function captureQuality(accuracyM: number): CaptureQuality {
  return accuracyM > POOR_ACCURACY_M ? "poor" : "good";
}

export type GeolocationOutcome = "denied" | LocationUnavailableReason;

export function geolocationErrorOutcome(
  error: Pick<GeolocationPositionError, "code">,
): GeolocationOutcome {
  if (error.code === 1) return "denied";
  if (error.code === 3) return "timeout";
  return "position_unavailable";
}

/**
 * The flagged no-coordinate save appears only after the student retried or the
 * GPS timed out (D-020), and never after a denied permission (owner item 36).
 */
export function flaggedSaveAllowed(input: {
  outcome: GeolocationOutcome | null;
  retries: number;
  sawTimeout: boolean;
}) {
  if (input.outcome === null || input.outcome === "denied") return false;
  return input.retries > 0 || input.sawTimeout;
}

export type CaptureChoice =
  | { kind: "fix"; fix: CaptureFix }
  | {
      kind: "flagged";
      reason: LocationUnavailableReason;
      capturedAt: string;
    };

/**
 * The start body for one capture. An unavailable capture never carries a
 * coordinate or accuracy (D-020).
 */
export function buildStartObservationRequest(
  clientGeneratedId: string,
  sessionId: string,
  choice: CaptureChoice,
): StartObservationRequest | null {
  const capture =
    choice.kind === "fix"
      ? {
          locationStatus: "captured" as const,
          lat: choice.fix.lat,
          lng: choice.fix.lng,
          accuracyM: choice.fix.accuracyM,
          capturedAt: choice.fix.capturedAt,
        }
      : {
          locationStatus: "unavailable" as const,
          unavailableReason: choice.reason,
          capturedAt: choice.capturedAt,
        };
  const parsed = startObservationRequestSchema.safeParse({
    clientGeneratedId,
    sessionId,
    capture,
  });
  return parsed.success ? parsed.data : null;
}

export const startObservationResponseSchema = z
  .object({
    outcome: z.enum(["created", "existing"]),
    observation: observationDraftSchema,
  })
  .strict();

export type StartObservationResponse = z.infer<
  typeof startObservationResponseSchema
>;

export const LOCATION_UNAVAILABLE_REASON_LABELS: Record<
  LocationUnavailableReason,
  string
> = {
  position_unavailable: "อุปกรณ์หาตำแหน่งไม่ได้",
  timeout: "รอตำแหน่งนานเกินไป",
  unsupported: "อุปกรณ์หรือเบราว์เซอร์นี้หาตำแหน่งไม่ได้",
};

/** Owner-only display of a stored coordinate, about 1 m precision. */
export function formatCoordinate(value: number) {
  return value.toFixed(5);
}

export function formatCaptureTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  return `${date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} · ${date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })} น.`;
}
