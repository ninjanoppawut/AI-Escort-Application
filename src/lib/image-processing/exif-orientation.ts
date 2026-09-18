import { asciiAt, u16, u32 } from "./bytes";
import { jpegSegments } from "./jpeg-segments";

/** EXIF orientation values 1–8 (TIFF tag 0x0112). */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const ORIENTATION_TAG = 0x0112;
const TIFF_SHORT = 3;

function isOrientation(value: number): value is ExifOrientation {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

/** Reads the IFD0 orientation from a TIFF block in `[start, end)`. */
function readTiffOrientation(
  bytes: Uint8Array,
  start: number,
  end: number,
): ExifOrientation | null {
  const view = bytes.subarray(start, end);
  let littleEndian: boolean;
  if (asciiAt(view, 0, "II")) littleEndian = true;
  else if (asciiAt(view, 0, "MM")) littleEndian = false;
  else return null;
  if (u16(view, 2, littleEndian) !== 42) return null;
  const ifdOffset = u32(view, 4, littleEndian);
  if (ifdOffset === null || ifdOffset < 8) return null;
  const count = u16(view, ifdOffset, littleEndian);
  if (count === null) return null;
  for (let index = 0; index < count; index += 1) {
    const entry = ifdOffset + 2 + index * 12;
    if (entry + 12 > view.length) return null;
    if (u16(view, entry, littleEndian) !== ORIENTATION_TAG) continue;
    const type = u16(view, entry + 2, littleEndian);
    const components = u32(view, entry + 4, littleEndian);
    const value = u16(view, entry + 8, littleEndian);
    if (type !== TIFF_SHORT || !components || value === null) return null;
    return isOrientation(value) ? value : null;
  }
  return null;
}

/**
 * Returns the EXIF orientation of a JPEG, or 1 when it is missing, invalid,
 * truncated, or malformed. Never throws on hostile length fields.
 */
export function readJpegOrientation(bytes: Uint8Array): ExifOrientation {
  for (const segment of jpegSegments(bytes)) {
    if (segment.marker !== 0xe1) continue;
    // APP1 may also hold XMP; only "Exif\0\0" carries the TIFF block.
    if (!asciiAt(bytes, segment.dataStart, "Exif\0\0")) continue;
    const tiffStart = segment.dataStart + 6;
    if (tiffStart >= segment.dataEnd) return 1;
    return readTiffOrientation(bytes, tiffStart, segment.dataEnd) ?? 1;
  }
  return 1;
}

/** True for orientations 5–8, whose upright image swaps width and height. */
export function orientationSwapsDimensions(
  orientation: ExifOrientation,
): boolean {
  return orientation >= 5;
}

/** Upright size of an image stored as `width × height` with `orientation`. */
export function orientedSize(
  width: number,
  height: number,
  orientation: ExifOrientation,
): { width: number; height: number } {
  return orientationSwapsDimensions(orientation)
    ? { width: height, height: width }
    : { width, height };
}

/** Canvas `setTransform(a, b, c, d, e, f)` arguments. */
export type TransformMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Transform that draws a stored image of `width × height` (after scaling) upright
 * onto a canvas sized `orientedSize(width, height, orientation)`. Apply with
 * `ctx.setTransform(...matrix)` and then `ctx.drawImage(source, 0, 0, width, height)`.
 */
export function orientationTransform(
  orientation: ExifOrientation,
  width: number,
  height: number,
): TransformMatrix {
  switch (orientation) {
    case 1:
      return [1, 0, 0, 1, 0, 0];
    case 2: // mirrored horizontally
      return [-1, 0, 0, 1, width, 0];
    case 3: // rotated 180°
      return [-1, 0, 0, -1, width, height];
    case 4: // mirrored vertically
      return [1, 0, 0, -1, 0, height];
    case 5: // transposed
      return [0, 1, 1, 0, 0, 0];
    case 6: // needs 90° clockwise rotation
      return [0, 1, -1, 0, height, 0];
    case 7: // transversed
      return [0, -1, -1, 0, height, width];
    case 8: // needs 90° counter-clockwise rotation
      return [0, -1, 1, 0, 0, width];
  }
}
