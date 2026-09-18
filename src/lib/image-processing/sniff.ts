import { asciiAt, u16, u32 } from "./bytes";
import type { AcceptedMimeType } from "./constants";
import { jpegSegments } from "./jpeg-segments";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Detects JPEG, PNG, or WebP from magic bytes. `File.type` is never trusted:
 * it comes from the file name or the picker and can be wrong or spoofed.
 * Returns null for anything else (HEIC, GIF, SVG, empty, truncated).
 */
export function sniffImageType(bytes: Uint8Array): AcceptedMimeType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    asciiAt(bytes, 0, "RIFF") &&
    asciiAt(bytes, 8, "WEBP")
  ) {
    return "image/webp";
  }
  return null;
}

export interface PixelSize {
  width: number;
  height: number;
}

/** JPEG Start-of-Frame markers (excluding DHT C4, JPG C8, DAC CC). */
function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function jpegDimensions(bytes: Uint8Array): PixelSize | null {
  for (const segment of jpegSegments(bytes)) {
    if (!isStartOfFrame(segment.marker)) continue;
    const height = u16(bytes, segment.dataStart + 1);
    const width = u16(bytes, segment.dataStart + 3);
    if (
      height === null ||
      width === null ||
      segment.dataStart + 5 > segment.dataEnd
    ) {
      return null;
    }
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function pngDimensions(bytes: Uint8Array): PixelSize | null {
  if (!asciiAt(bytes, 12, "IHDR")) return null;
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  if (!width || !height) return null;
  return { width, height };
}

function webpDimensions(bytes: Uint8Array): PixelSize | null {
  if (asciiAt(bytes, 12, "VP8X")) {
    if (bytes.length < 30) return null;
    const u24 = (at: number) =>
      bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
    return { width: u24(24) + 1, height: u24(27) + 1 };
  }
  if (asciiAt(bytes, 12, "VP8 ")) {
    // Frame tag (3 bytes) + start code 9D 01 2A, then 14-bit sizes.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a)
      return null;
    const w = u16(bytes, 26, true);
    const h = u16(bytes, 28, true);
    if (w === null || h === null) return null;
    const size = { width: w & 0x3fff, height: h & 0x3fff };
    return size.width && size.height ? size : null;
  }
  if (asciiAt(bytes, 12, "VP8L")) {
    if (bytes[20] !== 0x2f) return null;
    const bits = u32(bytes, 21, true);
    if (bits === null) return null;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * Reads stored pixel dimensions from the file header without decoding, so
 * decompression bombs are rejected before the browser allocates pixels.
 * JPEG dimensions are pre-orientation. Returns null when not found.
 */
export function readHeaderDimensions(
  bytes: Uint8Array,
  mimeType: AcceptedMimeType,
): PixelSize | null {
  switch (mimeType) {
    case "image/jpeg":
      return jpegDimensions(bytes);
    case "image/png":
      return pngDimensions(bytes);
    case "image/webp":
      return webpDimensions(bytes);
  }
}
