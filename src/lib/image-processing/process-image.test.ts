import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { readBlobBytes } from "./bytes";
import {
  MAX_CANVAS_PIXELS,
  MAX_OUTPUT_BYTES,
  MAX_SOURCE_BYTES,
  PREPROCESSING_VERSION,
} from "./constants";
import { ImageProcessingError, isImageProcessingError } from "./errors";
import { orientedSize, type ExifOrientation } from "./exif-orientation";
import { SHA256_HEX_PATTERN, sha256Hex, type DigestFn } from "./hash";
import { processImage } from "./process-image";
import { buildSyntheticJpeg } from "./synthetic-jpeg";
import type {
  DrawRequest,
  ImageProcessingAdapters,
  ProcessedImage,
} from "./types";

interface FakeImage {
  kind: "image";
  width: number;
  height: number;
}

interface FakeCanvas {
  kind: "canvas";
  id: number;
  width: number;
  height: number;
  orientation: ExifOrientation;
}

const nodeDigest: DigestFn = (bytes) =>
  webcrypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);

interface FakeOptions {
  decoded?: { width: number; height: number; orientationApplied?: boolean };
  encodedBytes?: (canvas: FakeCanvas, quality: number) => number;
  typeFor?: (mime: string) => string;
}

function fakeAdapters(options: FakeOptions = {}) {
  const decoded = options.decoded ?? { width: 4032, height: 3024 };
  const canvases: FakeCanvas[] = [];
  const released = new Set<number>();
  const decodeRelease = vi.fn();
  const draws: Array<DrawRequest & { from: string }> = [];
  const adapters: ImageProcessingAdapters<FakeImage, FakeCanvas> = {
    readBytes: vi.fn(readBlobBytes),
    decode: vi.fn(async () => ({
      image: {
        kind: "image" as const,
        width: decoded.width,
        height: decoded.height,
      },
      width: decoded.width,
      height: decoded.height,
      orientationApplied: decoded.orientationApplied ?? false,
      release: decodeRelease,
    })),
    draw: vi.fn((input: FakeImage | FakeCanvas, request: DrawRequest) => {
      draws.push({
        ...request,
        from: input.kind === "image" ? "image" : `canvas${input.id}`,
      });
      const canvas: FakeCanvas = {
        kind: "canvas",
        id: canvases.length,
        ...orientedSize(request.width, request.height, request.orientation),
        orientation: request.orientation,
      };
      canvases.push(canvas);
      return canvas;
    }),
    encode: vi.fn(async (canvas: FakeCanvas, mime: string, quality: number) => {
      const bytes = options.encodedBytes?.(canvas, quality) ?? 1234;
      return new Blob([new Uint8Array(bytes).fill(canvas.id + 1)], {
        type: options.typeFor ? options.typeFor(mime) : mime,
      });
    }),
    releaseCanvas: vi.fn((canvas: FakeCanvas) => {
      released.add(canvas.id);
    }),
    digest: nodeDigest,
    createObjectURL: vi.fn(() => "blob:preview-1"),
  };
  const allReleased = () => canvases.every((canvas) => released.has(canvas.id));
  return { adapters, canvases, released, decodeRelease, draws, allReleased };
}

const jpegFile = (
  width: number,
  height: number,
  orientation?: ExifOrientation,
) =>
  new Blob(
    [
      buildSyntheticJpeg({
        width,
        height,
        exif: {
          ...(orientation ? { orientation } : {}),
          make: "SecretFakeCam",
          gps: { latitude: 12.3456, longitude: 98.7654 },
        },
      }) as Uint8Array<ArrayBuffer>,
    ],
    { type: "image/jpeg" },
  );

function pngHeader(width: number, height: number): Blob {
  const be32 = (v: number) => [
    (v >>> 24) & 0xff,
    (v >> 16) & 0xff,
    (v >> 8) & 0xff,
    v & 0xff,
  ];
  return new Blob([
    new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...be32(13),
      0x49,
      0x48,
      0x44,
      0x52,
      ...be32(width),
      ...be32(height),
      8,
      6,
      0,
      0,
      0,
    ]),
  ]);
}

function expectProcessed(
  result: ProcessedImage | ImageProcessingError,
): asserts result is ProcessedImage {
  if (isImageProcessingError(result)) {
    throw new Error(`expected success, got ${result.message}`);
  }
}

describe("processImage", () => {
  it("orients, resizes, encodes, hashes, and previews a 4032×3024 orientation-6 photo", async () => {
    const fake = fakeAdapters();
    const file = jpegFile(4032, 3024, 6);
    const result = await processImage(file, fake.adapters);
    expectProcessed(result);

    expect(result).toMatchObject({
      mimeType: "image/webp",
      width: 1536,
      height: 2048,
      preprocessingVersion: "img-v1",
      previewUrl: "blob:preview-1",
    });
    expect(result.preprocessingVersion).toBe(PREPROCESSING_VERSION);
    expect(result.byteSize).toBe(result.blob.size);
    expect(result.byteSize).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    expect(result.sha256).toMatch(SHA256_HEX_PATTERN);
    expect(result.sha256).toBe(
      await sha256Hex(await readBlobBytes(result.blob), nodeDigest),
    );
    // Stored-orientation draw at 2048×1536, rotated by EXIF 6 on the canvas.
    expect(fake.draws).toEqual([
      { width: 2048, height: 1536, orientation: 6, from: "image" },
    ]);
    expect(fake.allReleased()).toBe(true);
    expect(fake.decodeRelease).toHaveBeenCalledTimes(1);
  });

  it("does not rotate twice when the decoder already applied orientation", async () => {
    const fake = fakeAdapters({
      decoded: { width: 3024, height: 4032, orientationApplied: true },
    });
    const result = await processImage(jpegFile(4032, 3024, 6), fake.adapters);
    expectProcessed(result);
    expect(result).toMatchObject({ width: 1536, height: 2048 });
    expect(fake.draws).toEqual([
      { width: 1536, height: 2048, orientation: 1, from: "image" },
    ]);
  });

  it("keeps small images at their exact size but still re-encodes them", async () => {
    const fake = fakeAdapters({ decoded: { width: 64, height: 48 } });
    const result = await processImage(jpegFile(64, 48), fake.adapters);
    expectProcessed(result);
    expect(result).toMatchObject({ width: 64, height: 48 });
    expect(fake.adapters.encode).toHaveBeenCalledTimes(1);
  });

  it("halves an 8000×6000 source without exceeding the canvas limit", async () => {
    const fake = fakeAdapters({ decoded: { width: 8000, height: 6000 } });
    const result = await processImage(jpegFile(8000, 6000), fake.adapters);
    expectProcessed(result);
    expect(result).toMatchObject({ width: 2048, height: 1536 });
    expect(
      fake.draws.map(({ width, height, from }) => `${width}x${height}<${from}`),
    ).toEqual(["4000x3000<image", "2048x1536<canvas0"]);
    for (const canvas of fake.canvases) {
      expect(canvas.width * canvas.height).toBeLessThanOrEqual(
        MAX_CANVAS_PIXELS,
      );
    }
    expect(fake.allReleased()).toBe(true);
  });

  it("steps dimensions down when every quality is over 5 MB", async () => {
    const fake = fakeAdapters({
      encodedBytes: (canvas) =>
        canvas.width >= 2048 ? MAX_OUTPUT_BYTES + 1 : 4_000_000,
    });
    const result = await processImage(jpegFile(4032, 3024), fake.adapters);
    expectProcessed(result);
    expect(result).toMatchObject({
      width: 1740,
      height: 1305,
      byteSize: 4_000_000,
    });
    expect(fake.allReleased()).toBe(true);
  });

  it("remembers a WebP fallback so later images go straight to JPEG", async () => {
    const fake = fakeAdapters({
      typeFor: (mime) => (mime === "image/webp" ? "image/png" : mime),
    });
    const first = await processImage(jpegFile(64, 48), fake.adapters);
    expectProcessed(first);
    expect(first.mimeType).toBe("image/jpeg");
    expect(fake.adapters.webpSupported).toBe(false);
    vi.mocked(fake.adapters.encode).mockClear();
    await processImage(jpegFile(64, 48), fake.adapters);
    expect(
      vi.mocked(fake.adapters.encode).mock.calls.map((call) => call[1]),
    ).toEqual(["image/jpeg"]);
  });

  it("returns a null hash instead of failing when the digest breaks", async () => {
    const fake = fakeAdapters({ decoded: { width: 64, height: 48 } });
    fake.adapters.digest = async () => {
      throw new Error("insecure context");
    };
    const result = await processImage(jpegFile(64, 48), fake.adapters);
    expectProcessed(result);
    expect(result.sha256).toBeNull();
  });

  describe("failures", () => {
    it("rejects non-image bytes even when File.type claims JPEG", async () => {
      const fake = fakeAdapters();
      const gif = new Blob([new TextEncoder().encode("GIF89a....")], {
        type: "image/jpeg",
      });
      const result = await processImage(gif, fake.adapters);
      expect(result).toMatchObject({
        code: "INVALID_IMAGE_TYPE",
        reason: "unsupported_type",
      });
      expect(fake.adapters.decode).not.toHaveBeenCalled();
    });

    it("rejects oversized source bytes before decoding", async () => {
      const fake = fakeAdapters();
      const file = jpegFile(64, 48);
      Object.defineProperty(file, "size", { value: MAX_SOURCE_BYTES + 1 });
      const result = await processImage(file, fake.adapters);
      expect(result).toMatchObject({
        code: "IMAGE_TOO_LARGE",
        reason: "source",
        limit: "bytes",
      });
      expect(fake.adapters.decode).not.toHaveBeenCalled();
    });

    it("rejects oversized source pixels from the header before decoding", async () => {
      const fake = fakeAdapters();
      const result = await processImage(pngHeader(9000, 8000), fake.adapters);
      expect(result).toMatchObject({
        code: "IMAGE_TOO_LARGE",
        reason: "source",
        limit: "pixels",
      });
      expect(fake.adapters.decode).not.toHaveBeenCalled();
    });

    it("rejects oversized decoded pixels and releases the decode", async () => {
      const fake = fakeAdapters({ decoded: { width: 10000, height: 7000 } });
      const riff = new Blob([new TextEncoder().encode("RIFF\0\0\0\0WEBPXXXX")]);
      const result = await processImage(riff, fake.adapters);
      expect(result).toMatchObject({
        code: "IMAGE_TOO_LARGE",
        limit: "pixels",
      });
      expect(fake.decodeRelease).toHaveBeenCalledTimes(1);
      expect(fake.adapters.draw).not.toHaveBeenCalled();
    });

    it("maps a decode failure to INVALID_IMAGE_TYPE decode_failed", async () => {
      const fake = fakeAdapters();
      vi.mocked(fake.adapters.decode).mockRejectedValueOnce(
        new Error("corrupt"),
      );
      const result = await processImage(jpegFile(64, 48), fake.adapters);
      expect(result).toMatchObject({
        code: "INVALID_IMAGE_TYPE",
        reason: "decode_failed",
      });
    });

    it("fails with IMAGE_TOO_LARGE compression and cleans up", async () => {
      const fake = fakeAdapters({ encodedBytes: () => MAX_OUTPUT_BYTES + 1 });
      const result = await processImage(jpegFile(4032, 3024, 6), fake.adapters);
      expect(result).toBeInstanceOf(ImageProcessingError);
      expect(result).toMatchObject({
        code: "IMAGE_TOO_LARGE",
        reason: "compression",
      });
      expect(fake.allReleased()).toBe(true);
      expect(fake.decodeRelease).toHaveBeenCalledTimes(1);
      expect(fake.adapters.createObjectURL).not.toHaveBeenCalled();
    });

    it("maps a canvas failure to IMAGE_PROCESSING_FAILED and cleans up", async () => {
      const fake = fakeAdapters({ decoded: { width: 8000, height: 6000 } });
      const draw = fake.adapters.draw;
      let calls = 0;
      fake.adapters.draw = (input, request) => {
        calls += 1;
        if (calls === 2) throw new Error("canvas allocation failed");
        return draw(input, request);
      };
      const result = await processImage(jpegFile(64, 48), fake.adapters);
      expect(result).toMatchObject({
        code: "IMAGE_PROCESSING_FAILED",
        reason: "canvas_failed",
      });
      expect(fake.allReleased()).toBe(true);
      expect(fake.decodeRelease).toHaveBeenCalledTimes(1);
    });

    it("never puts file contents in the error", async () => {
      const fake = fakeAdapters({ encodedBytes: () => MAX_OUTPUT_BYTES + 1 });
      const result = await processImage(jpegFile(64, 48, 6), fake.adapters);
      expect(isImageProcessingError(result)).toBe(true);
      const serialized = JSON.stringify({
        ...result,
        message: (result as Error).message,
      });
      expect(serialized).not.toMatch(/SecretFakeCam|12\.3456|Exif/);
      expect((result as Error).message).toBe("IMAGE_TOO_LARGE: compression");
    });
  });

  it("processes one image at a time", async () => {
    const fake = fakeAdapters({ decoded: { width: 64, height: 48 } });
    const decode = fake.adapters.decode;
    let unblock: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let active = 0;
    let maxActive = 0;
    fake.adapters.decode = async (blob) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (active === 1 && maxActive === 1) await gate;
      try {
        return await decode(blob);
      } finally {
        active -= 1;
      }
    };
    const first = processImage(jpegFile(64, 48), fake.adapters);
    const second = processImage(jpegFile(64, 48), fake.adapters);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(decode).toHaveBeenCalledTimes(0);
    unblock();
    await Promise.all([first, second]);
    expect(maxActive).toBe(1);
    expect(decode).toHaveBeenCalledTimes(2);
  });
});
