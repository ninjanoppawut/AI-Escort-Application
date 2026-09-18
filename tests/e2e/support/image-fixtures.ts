/**
 * Synthetic image fixtures for browser tests of the client image pipeline
 * (OBS-006). No real photos, people, or places: every image is generated
 * from flat-colour 8 × 8 blocks by the repository's minimal JPEG writer, with
 * a fake EXIF Make and fake GPS coordinates.
 *
 * Default fixture: 4032 × 3024 stored pixels (~220 KB) tagged orientation 6,
 * so a correct pipeline outputs an upright 1536 × 2048 image. Stored layout:
 *
 *   stored (raw)            upright after orientation 6 (90° clockwise)
 *   +-------+-------+       +-------+-------+
 *   |  RED  | GREEN |       | BLUE  |  RED  |
 *   +-------+-------+       +-------+-------+
 *   |     BLUE      |       | BLUE  | GREEN |
 *   +---------------+       +-------+-------+
 */
import { buildSyntheticJpeg } from "../../../src/lib/image-processing/synthetic-jpeg";

export const FIXTURE_COLORS = {
  red: [220, 20, 60],
  green: [34, 139, 34],
  blue: [30, 60, 200],
} as const;

/** Clearly synthetic coordinates; never a real student location. */
export const FIXTURE_FAKE_GPS = {
  latitude: 12.3456,
  longitude: 98.7654,
} as const;

/** Written as the EXIF Make tag; must never appear in processed output. */
export const FIXTURE_FAKE_MAKE = "AIEscortFakeCam";

export interface ExifJpegFixtureOptions {
  width?: number;
  height?: number;
  orientation?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** TIFF byte order; big-endian ("MM") by default. */
  littleEndian?: boolean;
  /** Set false to omit the GPS IFD. */
  gps?: boolean;
}

/**
 * Valid baseline JPEG with an EXIF APP1 segment containing Orientation, Make,
 * and GPS latitude/longitude tags. Decoded pixel colours match
 * `FIXTURE_COLORS` within ±1 per channel.
 */
export function createExifJpegFixture(
  options: ExifJpegFixtureOptions = {},
): Buffer {
  const {
    width = 4032,
    height = 3024,
    orientation = 6,
    littleEndian = false,
    gps = true,
  } = options;
  const halfX = Math.ceil(width / 8) / 2;
  const halfY = Math.ceil(height / 8) / 2;
  const bytes = buildSyntheticJpeg({
    width,
    height,
    blockColor: (bx, by) =>
      by >= halfY
        ? FIXTURE_COLORS.blue
        : bx < halfX
          ? FIXTURE_COLORS.red
          : FIXTURE_COLORS.green,
    exif: {
      orientation,
      littleEndian,
      make: FIXTURE_FAKE_MAKE,
      ...(gps ? { gps: FIXTURE_FAKE_GPS } : {}),
    },
  });
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Upright size a correct pipeline must output for the default fixture. */
export const DEFAULT_FIXTURE_EXPECTED_SIZE = {
  width: 1536,
  height: 2048,
} as const;

/** True when a JPEG has an APP1 segment starting with "Exif\0\0". */
export function hasExifApp1(buffer: Uint8Array): boolean {
  const bytes = Buffer.from(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return false;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return false;
    if (
      marker === 0xe1 &&
      bytes
        .subarray(offset + 4, offset + 10)
        .equals(Buffer.from("Exif\0\0", "latin1"))
    ) {
      return true;
    }
    offset += 2 + length;
  }
  return false;
}

/**
 * True when an image of any accepted type carries EXIF: a JPEG APP1 Exif
 * segment, a WebP "EXIF" chunk, or a PNG "eXIf" chunk.
 */
export function hasExifMetadata(buffer: Uint8Array): boolean {
  const bytes = Buffer.from(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  if (bytes.length < 12) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return hasExifApp1(bytes);
  if (
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      if (bytes.toString("latin1", offset, offset + 4) === "EXIF") return true;
      const size = bytes.readUInt32LE(offset + 4);
      offset += 8 + size + (size % 2);
    }
    return false;
  }
  if (bytes.readUInt32BE(0) === 0x89504e47) {
    for (let offset = 8; offset + 8 <= bytes.length;) {
      const size = bytes.readUInt32BE(offset);
      if (bytes.toString("latin1", offset + 4, offset + 8) === "eXIf")
        return true;
      offset += 12 + size;
    }
    return false;
  }
  return false;
}

/** True when the fake camera Make string survives anywhere in the bytes. */
export function containsFakeCameraMake(buffer: Uint8Array): boolean {
  return Buffer.from(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  ).includes(FIXTURE_FAKE_MAKE, 0, "latin1");
}
