import { readBlobBytes } from "./bytes";
import type { OutputMimeType } from "./constants";
import { canvasFailed, encodeFailed } from "./errors";
import { orientationTransform, orientedSize } from "./exif-orientation";
import { defaultDigest } from "./hash";
import { buildSyntheticJpeg } from "./synthetic-jpeg";
import type {
  DecodedImage,
  DrawRequest,
  ImageProcessingAdapters,
} from "./types";

/**
 * Browser adapters for the image pipeline. Nothing here runs at import time,
 * so the module is safe to import from server components and tests.
 */

export type DecodeMethod = (
  blob: Blob,
) => Promise<DecodedImage<CanvasImageSource>>;

/** Raw 16 × 8 JPEG tagged orientation 6: an upright decode is 8 × 16. */
export const ORIENTATION_PROBE_SIZE = { width: 16, height: 8 } as const;

export function createOrientationProbe(): Blob {
  const bytes = buildSyntheticJpeg({
    ...ORIENTATION_PROBE_SIZE,
    exif: { orientation: 6 },
  });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" });
}

/**
 * Decodes the probe with `method` and reports whether that decoder already
 * applies EXIF orientation. Rejects when the method cannot decode at all.
 */
export async function probeAppliesOrientation(
  method: DecodeMethod,
  probe: Blob = createOrientationProbe(),
): Promise<boolean> {
  const decoded = await method(probe);
  try {
    return (
      decoded.width === ORIENTATION_PROBE_SIZE.height &&
      decoded.height === ORIENTATION_PROBE_SIZE.width
    );
  } finally {
    decoded.release();
  }
}

/** Decodes through `<img>` from an object URL; modern browsers honour EXIF. */
export const decodeWithImageElement: DecodeMethod = async (blob) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image decode failed"));
      image.src = url;
    });
    // `load` already proved decodability; some Safari versions reject
    // decode() for large images, so its failure is not fatal.
    if (typeof image.decode === "function") {
      await image.decode().catch(() => undefined);
    }
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(url);
  }
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    orientationApplied: false,
    release: () => {
      image.removeAttribute("src");
    },
  };
};

/** Decodes with `createImageBitmap(..., { imageOrientation: "from-image" })`. */
export const decodeWithImageBitmap: DecodeMethod = async (blob) => {
  if (typeof createImageBitmap !== "function") {
    throw new Error("createImageBitmap is unavailable");
  }
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  return {
    image: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    orientationApplied: false,
    release: () => bitmap.close(),
  };
};

const probeResults = new WeakMap<DecodeMethod, Promise<boolean>>();

function cachedProbe(method: DecodeMethod): Promise<boolean> {
  let result = probeResults.get(method);
  if (!result) {
    result = probeAppliesOrientation(method);
    probeResults.set(method, result);
  }
  return result;
}

/**
 * Decodes with the first method that works. Each method's orientation
 * behaviour is self-tested once, so the pipeline rotates manually only when
 * that decoder did not (older engines ignore EXIF orientation).
 */
export async function decodeImage(
  blob: Blob,
  methods: readonly DecodeMethod[] = [
    decodeWithImageElement,
    decodeWithImageBitmap,
  ],
  probe: (method: DecodeMethod) => Promise<boolean> = cachedProbe,
): Promise<DecodedImage<CanvasImageSource>> {
  let lastError: unknown = new Error("no decode method available");
  for (const method of methods) {
    try {
      const orientationApplied = await probe(method);
      const decoded = await method(blob);
      return { ...decoded, orientationApplied };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Frees canvas backing memory; Safari keeps it until the size is zero. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** Draws `input` at `width × height`, applying `orientation`, on a new canvas. */
export function drawToCanvas(
  input: CanvasImageSource,
  { width, height, orientation }: DrawRequest,
): HTMLCanvasElement {
  const size = orientedSize(width, height, orientation);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context =
    canvas.width === size.width && canvas.height === size.height
      ? canvas.getContext("2d")
      : null;
  if (!context) {
    releaseCanvas(canvas);
    throw canvasFailed();
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  // Flatten transparency to white so WebP and JPEG output match.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.setTransform(...orientationTransform(orientation, width, height));
  context.drawImage(input, 0, 0, width, height);
  context.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

export function encodeCanvas(
  canvas: HTMLCanvasElement,
  mimeType: OutputMimeType,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(encodeFailed())),
      mimeType,
      quality,
    );
  });
}

/**
 * Cheap 1 × 1 check for WebP encoding. Safari returns a PNG data URL instead,
 * so it skips a full-size WebP attempt. Undefined when the check cannot run;
 * the encode loop still verifies the real blob type either way.
 */
export function detectWebpEncodeSupport(): boolean | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const url = canvas.toDataURL("image/webp");
    releaseCanvas(canvas);
    return url.startsWith("data:image/webp");
  } catch {
    return undefined;
  }
}

let browserAdapters:
  ImageProcessingAdapters<CanvasImageSource, HTMLCanvasElement> | undefined;

/** Lazily created singleton, so the WebP capability is remembered. */
export function getBrowserImageAdapters(): ImageProcessingAdapters<
  CanvasImageSource,
  HTMLCanvasElement
> {
  if (!browserAdapters) {
    const webpSupported = detectWebpEncodeSupport();
    browserAdapters = {
      readBytes: readBlobBytes,
      decode: (blob) => decodeImage(blob),
      draw: drawToCanvas,
      encode: encodeCanvas,
      releaseCanvas,
      digest: defaultDigest(),
      createObjectURL: (blob) => URL.createObjectURL(blob),
      ...(webpSupported === undefined ? {} : { webpSupported }),
    };
  }
  return browserAdapters;
}

/** Releases a `ProcessedImage.previewUrl` once the preview is gone. */
export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}
