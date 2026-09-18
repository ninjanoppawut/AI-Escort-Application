import { afterEach, describe, expect, it, vi } from "vitest";

import { readBlobBytes } from "./bytes";
import {
  createOrientationProbe,
  decodeImage,
  detectWebpEncodeSupport,
  drawToCanvas,
  encodeCanvas,
  getBrowserImageAdapters,
  probeAppliesOrientation,
  releaseCanvas,
  type DecodeMethod,
} from "./decode";
import { readJpegOrientation } from "./exif-orientation";
import { readHeaderDimensions, sniffImageType } from "./sniff";

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeMethod(width: number, height: number) {
  const release = vi.fn();
  const method = vi.fn<DecodeMethod>(async () => ({
    image: {} as CanvasImageSource,
    width,
    height,
    orientationApplied: false,
    release,
  }));
  return { method, release };
}

describe("orientation self-test", () => {
  it("builds a 16×8 JPEG tagged orientation 6", async () => {
    const bytes = await readBlobBytes(createOrientationProbe());
    expect(sniffImageType(bytes)).toBe("image/jpeg");
    expect(readHeaderDimensions(bytes, "image/jpeg")).toEqual({
      width: 16,
      height: 8,
    });
    expect(readJpegOrientation(bytes)).toBe(6);
  });

  it("detects a decoder that applies EXIF orientation", async () => {
    const upright = fakeMethod(8, 16);
    await expect(probeAppliesOrientation(upright.method)).resolves.toBe(true);
    expect(upright.release).toHaveBeenCalledTimes(1);

    const raw = fakeMethod(16, 8);
    await expect(probeAppliesOrientation(raw.method)).resolves.toBe(false);
    expect(raw.release).toHaveBeenCalledTimes(1);
  });
});

describe("decodeImage", () => {
  it("reports the decoder's orientation behaviour from its probe", async () => {
    const { method } = fakeMethod(4032, 3024);
    const decoded = await decodeImage(new Blob(), [method], async () => true);
    expect(decoded).toMatchObject({
      width: 4032,
      height: 3024,
      orientationApplied: true,
    });
  });

  it("falls back to the next method when one fails", async () => {
    const broken = vi.fn<DecodeMethod>(async () => {
      throw new Error("unsupported");
    });
    const working = fakeMethod(10, 20);
    const decoded = await decodeImage(
      new Blob(),
      [broken, working.method],
      async () => false,
    );
    expect(decoded).toMatchObject({
      width: 10,
      height: 20,
      orientationApplied: false,
    });
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it("skips a method whose probe fails and rethrows when all fail", async () => {
    const { method } = fakeMethod(10, 20);
    await expect(
      decodeImage(new Blob(), [method], async () => {
        throw new Error("probe failed");
      }),
    ).rejects.toThrow("probe failed");
    expect(method).not.toHaveBeenCalled();
  });
});

describe("canvas adapters", () => {
  function fakeContext() {
    return {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillStyle: "",
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
    };
  }

  it("draws rotated with high-quality smoothing onto an upright canvas", () => {
    const context = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const source = document.createElement("img");
    const canvas = drawToCanvas(source, {
      width: 2048,
      height: 1536,
      orientation: 6,
    });
    expect([canvas.width, canvas.height]).toEqual([1536, 2048]);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1536, 2048);
    expect(context.setTransform).toHaveBeenNthCalledWith(
      1,
      0,
      1,
      -1,
      0,
      1536,
      0,
    );
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 2048, 1536);
    expect(context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
  });

  it("throws canvas_failed and releases the canvas without a 2D context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() =>
      drawToCanvas(document.createElement("img"), {
        width: 10,
        height: 10,
        orientation: 1,
      }),
    ).toThrow(
      expect.objectContaining({
        code: "IMAGE_PROCESSING_FAILED",
        reason: "canvas_failed",
      }),
    );
  });

  it("releaseCanvas zeroes the backing store", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 50;
    releaseCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it("encodeCanvas passes type and quality and rejects a null blob", async () => {
    const canvas = document.createElement("canvas");
    const blob = new Blob([new Uint8Array(3)], { type: "image/webp" });
    const toBlob = vi
      .spyOn(canvas, "toBlob")
      .mockImplementationOnce((callback) => callback(blob))
      .mockImplementationOnce((callback) => callback(null));
    await expect(encodeCanvas(canvas, "image/webp", 0.85)).resolves.toBe(blob);
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.85,
    );
    await expect(
      encodeCanvas(canvas, "image/jpeg", 0.82),
    ).rejects.toMatchObject({
      code: "IMAGE_PROCESSING_FAILED",
      reason: "encode_failed",
    });
  });

  it("detects WebP encoding from a 1×1 data URL", () => {
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");
    toDataURL.mockReturnValueOnce("data:image/webp;base64,UklGR");
    expect(detectWebpEncodeSupport()).toBe(true);
    // Safari ignores the WebP request and returns PNG.
    toDataURL.mockReturnValueOnce("data:image/png;base64,iVBOR");
    expect(detectWebpEncodeSupport()).toBe(false);
    toDataURL.mockImplementationOnce(() => {
      throw new Error("tainted");
    });
    expect(detectWebpEncodeSupport()).toBeUndefined();
  });

  it("getBrowserImageAdapters is a singleton so WebP support is remembered", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,iVBOR",
    );
    const adapters = getBrowserImageAdapters();
    expect(adapters.webpSupported).toBe(false);
    expect(getBrowserImageAdapters()).toBe(adapters);
    adapters.webpSupported = true;
    expect(getBrowserImageAdapters().webpSupported).toBe(true);
  });
});
