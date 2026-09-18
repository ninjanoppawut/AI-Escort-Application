import { describe, expect, it } from "vitest";

import { readBlobBytes } from "./bytes";
import { readHeaderDimensions, sniffImageType } from "./sniff";
import { buildSyntheticJpeg } from "./synthetic-jpeg";

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const le32 = (value: number) => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >>> 24) & 0xff,
];
const be32 = (value: number) => le32(value).reverse();

function png(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be32(13),
    ...ascii("IHDR"),
    ...be32(width),
    ...be32(height),
    8,
    6,
    0,
    0,
    0,
  ]);
}

function webpVp8x(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  return new Uint8Array([
    ...ascii("RIFF"),
    ...le32(30),
    ...ascii("WEBP"),
    ...ascii("VP8X"),
    ...le32(10),
    0,
    0,
    0,
    0,
    w & 0xff,
    (w >> 8) & 0xff,
    (w >> 16) & 0xff,
    h & 0xff,
    (h >> 8) & 0xff,
    (h >> 16) & 0xff,
  ]);
}

function webpVp8(width: number, height: number): Uint8Array {
  return new Uint8Array([
    ...ascii("RIFF"),
    ...le32(30),
    ...ascii("WEBP"),
    ...ascii("VP8 "),
    ...le32(10),
    0x30,
    0x01,
    0x00,
    0x9d,
    0x01,
    0x2a,
    width & 0xff,
    (width >> 8) & 0x3f,
    height & 0xff,
    (height >> 8) & 0x3f,
  ]);
}

function webpVp8l(width: number, height: number): Uint8Array {
  const bits = (width - 1) | ((height - 1) << 14);
  return new Uint8Array([
    ...ascii("RIFF"),
    ...le32(30),
    ...ascii("WEBP"),
    ...ascii("VP8L"),
    ...le32(5),
    0x2f,
    ...le32(bits),
  ]);
}

describe("sniffImageType", () => {
  it("detects JPEG, PNG, and WebP from magic bytes", () => {
    expect(sniffImageType(buildSyntheticJpeg({ width: 8, height: 8 }))).toBe(
      "image/jpeg",
    );
    expect(sniffImageType(png(10, 10))).toBe("image/png");
    expect(sniffImageType(webpVp8x(10, 10))).toBe("image/webp");
  });

  it.each([
    ["empty", new Uint8Array()],
    ["HEIC", new Uint8Array([0, 0, 0, 0x18, ...ascii("ftypheic"), 0, 0, 0, 0])],
    ["GIF", new Uint8Array(ascii("GIF89a\x01\x00\x01\x00"))],
    ["SVG", new Uint8Array(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))],
    ["PDF", new Uint8Array(ascii("%PDF-1.7\n"))],
    ["truncated JPEG", new Uint8Array([0xff, 0xd8])],
    [
      "RIFF but not WebP",
      new Uint8Array([...ascii("RIFF"), ...le32(4), ...ascii("WAVE")]),
    ],
  ])("rejects %s", (_label, bytes) => {
    expect(sniffImageType(bytes)).toBeNull();
  });
});

describe("readHeaderDimensions", () => {
  it("reads stored JPEG dimensions from SOF0", () => {
    const bytes = buildSyntheticJpeg({
      width: 4032,
      height: 24,
      exif: { orientation: 6 },
    });
    expect(readHeaderDimensions(bytes, "image/jpeg")).toEqual({
      width: 4032,
      height: 24,
    });
  });

  it("reads PNG IHDR and all WebP variants", () => {
    expect(readHeaderDimensions(png(9000, 7200), "image/png")).toEqual({
      width: 9000,
      height: 7200,
    });
    expect(readHeaderDimensions(webpVp8x(16383, 5000), "image/webp")).toEqual({
      width: 16383,
      height: 5000,
    });
    expect(readHeaderDimensions(webpVp8(640, 480), "image/webp")).toEqual({
      width: 640,
      height: 480,
    });
    expect(readHeaderDimensions(webpVp8l(300, 200), "image/webp")).toEqual({
      width: 300,
      height: 200,
    });
  });

  it("returns null for truncated headers instead of throwing", () => {
    const jpeg = buildSyntheticJpeg({ width: 64, height: 48 });
    const sof = jpeg.findIndex(
      (byte, index) => byte === 0xff && jpeg[index + 1] === 0xc0,
    );
    expect(
      readHeaderDimensions(jpeg.subarray(0, sof + 6), "image/jpeg"),
    ).toBeNull();
    expect(
      readHeaderDimensions(png(1, 1).subarray(0, 18), "image/png"),
    ).toBeNull();
    expect(
      readHeaderDimensions(webpVp8x(10, 10).subarray(0, 26), "image/webp"),
    ).toBeNull();
  });
});

describe("readBlobBytes", () => {
  it("reads a whole blob or only its prefix", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);
    expect(Array.from(await readBlobBytes(blob))).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(await readBlobBytes(blob, 2))).toEqual([1, 2]);
  });
});
