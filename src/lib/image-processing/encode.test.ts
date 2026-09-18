import { describe, expect, it, vi } from "vitest";

import { MAX_ENCODE_ATTEMPTS, MAX_OUTPUT_BYTES } from "./constants";
import type { Size } from "./dimensions";
import { encodeWithinBudget, type ImageEncoder } from "./encode";
import { ImageProcessingError } from "./errors";

interface FakeCanvas {
  width: number;
  height: number;
}

const blobOf = (bytes: number, type: string) =>
  new Blob([new Uint8Array(bytes)], { type });

function setup(
  sizeFor: (canvas: FakeCanvas, mime: string, quality: number) => number,
  typeFor: (mime: string) => string = (mime) => mime,
) {
  const rendered: Size[] = [];
  const disposed: Size[] = [];
  const calls: Array<{ size: string; mime: string; quality: number }> = [];
  const render = vi.fn((size: Size) => {
    rendered.push(size);
    return { canvas: { ...size }, dispose: () => disposed.push(size) };
  });
  const encode = vi.fn<ImageEncoder<FakeCanvas>>(
    async (canvas, mime, quality) => {
      calls.push({ size: `${canvas.width}x${canvas.height}`, mime, quality });
      return blobOf(sizeFor(canvas, mime, quality), typeFor(mime));
    },
  );
  return { rendered, disposed, calls, render, encode };
}

const initialSize = { width: 2048, height: 1536 };
const OVER = MAX_OUTPUT_BYTES + 1;

describe("encodeWithinBudget", () => {
  it("accepts WebP at quality 0.85 when it fits", async () => {
    const fake = setup(() => 1000);
    const result = await encodeWithinBudget({ initialSize, ...fake });
    expect(result).not.toBeInstanceOf(ImageProcessingError);
    expect(result).toMatchObject({
      mimeType: "image/webp",
      width: 2048,
      height: 1536,
      quality: 0.85,
      attempts: 1,
      webpSupported: true,
    });
    expect(fake.calls).toEqual([
      { size: "2048x1536", mime: "image/webp", quality: 0.85 },
    ]);
    expect(fake.disposed).toEqual([initialSize]);
  });

  it("re-encodes small images too (always strips metadata)", async () => {
    const fake = setup(() => 10);
    await encodeWithinBudget({
      initialSize: { width: 64, height: 48 },
      ...fake,
    });
    expect(fake.encode).toHaveBeenCalledTimes(1);
  });

  it("falls back to quality 0.82 when 0.85 is too large", async () => {
    const fake = setup((_c, _m, quality) =>
      quality === 0.85 ? OVER : 5_000_000,
    );
    const result = await encodeWithinBudget({ initialSize, ...fake });
    expect(result).toMatchObject({ quality: 0.82, attempts: 2, width: 2048 });
    expect(fake.calls.map((call) => call.quality)).toEqual([0.85, 0.82]);
  });

  it("steps dimensions down by 0.85 when both qualities are too large", async () => {
    const fake = setup((canvas) => (canvas.width === 2048 ? OVER : 4_000_000));
    const result = await encodeWithinBudget({ initialSize, ...fake });
    expect(result).toMatchObject({
      width: 1740,
      height: 1305,
      quality: 0.85,
      attempts: 3,
    });
    expect(fake.rendered).toEqual([initialSize, { width: 1740, height: 1305 }]);
    expect(fake.disposed).toHaveLength(2);
  });

  it("never encodes below quality 0.82", async () => {
    const fake = setup(() => OVER);
    await encodeWithinBudget({ initialSize, ...fake });
    for (const call of fake.calls)
      expect(call.quality).toBeGreaterThanOrEqual(0.82);
  });

  it("fails with IMAGE_TOO_LARGE after the attempt budget", async () => {
    const fake = setup(() => OVER);
    const result = await encodeWithinBudget({ initialSize, ...fake });
    expect(result).toBeInstanceOf(ImageProcessingError);
    expect(result).toMatchObject({
      code: "IMAGE_TOO_LARGE",
      reason: "compression",
    });
    expect(fake.encode).toHaveBeenCalledTimes(MAX_ENCODE_ATTEMPTS);
    expect(fake.calls.map((call) => call.size)).toEqual([
      "2048x1536",
      "2048x1536",
      "1740x1305",
      "1740x1305",
      "1479x1109",
      "1479x1109",
    ]);
    expect(fake.disposed).toHaveLength(fake.rendered.length);
  });

  it.each(["image/png", "image/jpeg"])(
    "uses JPEG when a WebP request returns %s, without spending an attempt",
    async (fallbackType) => {
      const fake = setup(
        () => 1000,
        (mime) => (mime === "image/webp" ? fallbackType : mime),
      );
      const result = await encodeWithinBudget({ initialSize, ...fake });
      expect(result).toMatchObject({
        mimeType: "image/jpeg",
        quality: 0.85,
        attempts: 1,
        webpSupported: false,
      });
      expect(fake.calls.map((call) => call.mime)).toEqual([
        "image/webp",
        "image/jpeg",
      ]);
    },
  );

  it("stays on JPEG for the rest of the loop after a WebP fallback", async () => {
    const fake = setup(
      (canvas) => (canvas.width === 2048 ? OVER : 1000),
      (mime) => (mime === "image/webp" ? "image/png" : mime),
    );
    const result = await encodeWithinBudget({ initialSize, ...fake });
    expect(result).toMatchObject({
      mimeType: "image/jpeg",
      width: 1740,
      attempts: 3,
    });
    expect(
      fake.calls.filter((call) => call.mime === "image/webp"),
    ).toHaveLength(1);
  });

  it("skips the WebP probe when WebP is known to be unsupported", async () => {
    const fake = setup(() => 1000);
    const result = await encodeWithinBudget({
      initialSize,
      preferWebp: false,
      ...fake,
    });
    expect(result).toMatchObject({
      mimeType: "image/jpeg",
      webpSupported: undefined,
    });
    expect(fake.calls.map((call) => call.mime)).toEqual(["image/jpeg"]);
  });

  it("fails with IMAGE_PROCESSING_FAILED when the encoder breaks", async () => {
    const rejecting = setup(() => 1000);
    rejecting.encode.mockRejectedValueOnce(new Error("toBlob returned null"));
    await expect(
      encodeWithinBudget({ initialSize, ...rejecting }),
    ).resolves.toMatchObject({
      code: "IMAGE_PROCESSING_FAILED",
      reason: "encode_failed",
    });
    expect(rejecting.disposed).toHaveLength(1);

    const empty = setup(() => 0);
    await expect(
      encodeWithinBudget({ initialSize, ...empty }),
    ).resolves.toMatchObject({
      code: "IMAGE_PROCESSING_FAILED",
      reason: "encode_failed",
    });

    const wrongType = setup(
      () => 1000,
      () => "image/png",
    );
    await expect(
      encodeWithinBudget({ initialSize, preferWebp: false, ...wrongType }),
    ).resolves.toMatchObject({ code: "IMAGE_PROCESSING_FAILED" });
  });

  it("maps a render failure to canvas_failed", async () => {
    const fake = setup(() => 1000);
    fake.render.mockImplementationOnce(() => {
      throw new Error("out of memory");
    });
    await expect(
      encodeWithinBudget({ initialSize, ...fake }),
    ).resolves.toMatchObject({
      code: "IMAGE_PROCESSING_FAILED",
      reason: "canvas_failed",
    });
  });
});
