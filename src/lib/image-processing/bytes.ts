/** Bounds-checked byte helpers shared by the header parsers. */

/** Bytes read from the start of a source for sniffing, EXIF, and dimensions. */
export const HEADER_BYTES = 256 * 1024;

export function u16(
  bytes: Uint8Array,
  offset: number,
  littleEndian = false,
): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null;
  const a = bytes[offset]!;
  const b = bytes[offset + 1]!;
  return littleEndian ? a | (b << 8) : (a << 8) | b;
}

export function u32(
  bytes: Uint8Array,
  offset: number,
  littleEndian = false,
): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  const a = bytes[offset]!;
  const b = bytes[offset + 1]!;
  const c = bytes[offset + 2]!;
  const d = bytes[offset + 3]!;
  const value = littleEndian
    ? a + b * 0x100 + c * 0x10000 + d * 0x1000000
    : a * 0x1000000 + b * 0x10000 + c * 0x100 + d;
  return value;
}

export function asciiAt(
  bytes: Uint8Array,
  offset: number,
  text: string,
): boolean {
  if (offset < 0 || offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Reads `blob` (optionally only its first `maxBytes`) as bytes. Falls back to
 * FileReader for engines whose Blob lacks `arrayBuffer()`.
 */
export async function readBlobBytes(
  blob: Blob,
  maxBytes?: number,
): Promise<Uint8Array> {
  const part =
    maxBytes !== undefined && blob.size > maxBytes
      ? blob.slice(0, maxBytes)
      : blob;
  if (typeof part.arrayBuffer === "function") {
    return new Uint8Array(await part.arrayBuffer());
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(new Uint8Array(result));
      else reject(new Error("FileReader returned no ArrayBuffer"));
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsArrayBuffer(part);
  });
}
