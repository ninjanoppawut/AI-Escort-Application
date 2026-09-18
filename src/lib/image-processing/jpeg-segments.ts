import { u16 } from "./bytes";

export interface JpegSegment {
  /** Marker byte after 0xFF, for example 0xE1 for APP1. */
  marker: number;
  /** First payload byte (after the two length bytes). */
  dataStart: number;
  /** Payload end, clamped to the available bytes. */
  dataEnd: number;
  /** False when the declared length runs past the available bytes. */
  complete: boolean;
}

/** Markers without a length field (SOI, TEM, RST0–RST7). */
function isStandalone(marker: number): boolean {
  return (
    marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
  );
}

/**
 * Walks JPEG header segments up to Start-of-Scan. Stops silently on malformed
 * or truncated input instead of throwing, so callers can fall back safely.
 */
export function* jpegSegments(bytes: Uint8Array): Generator<JpegSegment> {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return;
    // Skip fill bytes (any number of 0xFF before the marker).
    while (offset + 1 < bytes.length && bytes[offset + 1] === 0xff) {
      offset += 1;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined) return;
    if (isStandalone(marker)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return;
    const length = u16(bytes, offset + 2);
    if (length === null || length < 2) return;
    const dataStart = offset + 4;
    const declaredEnd = offset + 2 + length;
    const complete = declaredEnd <= bytes.length;
    yield {
      marker,
      dataStart,
      dataEnd: Math.min(declaredEnd, bytes.length),
      complete,
    };
    if (!complete) return;
    offset = declaredEnd;
  }
}
