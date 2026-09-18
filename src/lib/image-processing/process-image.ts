import { HEADER_BYTES } from "./bytes";
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCE_PIXELS,
  PREPROCESSING_VERSION,
} from "./constants";
import { getBrowserImageAdapters } from "./decode";
import { fitWithinMaxEdge, planDownscaleSteps, type Size } from "./dimensions";
import { encodeWithinBudget, type RenderedSurface } from "./encode";
import {
  canvasFailed,
  imageDecodeFailed,
  ImageProcessingError,
  invalidImageType,
  sourceTooLarge,
} from "./errors";
import { orientedSize, readJpegOrientation } from "./exif-orientation";
import { sha256Hex } from "./hash";
import { readHeaderDimensions, sniffImageType } from "./sniff";
import type {
  DecodedImage,
  ImageProcessingAdapters,
  ProcessedImage,
} from "./types";

let queueTail: Promise<unknown> = Promise.resolve();

/** Runs tasks one at a time so low-end phones never hold two decodes. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(task, task);
  queueTail = run.catch(() => undefined);
  return run;
}

const sameSize = (a: Size, b: Size) =>
  a.width === b.width && a.height === b.height;

async function runPipeline<TImage, TCanvas>(
  file: Blob,
  adapters: ImageProcessingAdapters<TImage, TCanvas>,
): Promise<ProcessedImage | ImageProcessingError> {
  // 1. Sniff magic bytes; File.type is never trusted.
  let header: Uint8Array;
  try {
    header = await adapters.readBytes(file, HEADER_BYTES);
  } catch {
    return imageDecodeFailed();
  }
  const mimeType = sniffImageType(header);
  if (!mimeType) return invalidImageType();

  // 2. Source guards before any pixel allocation.
  if (file.size > MAX_SOURCE_BYTES) return sourceTooLarge("bytes");
  const headerSize = readHeaderDimensions(header, mimeType);
  if (headerSize && headerSize.width * headerSize.height > MAX_SOURCE_PIXELS) {
    return sourceTooLarge("pixels");
  }
  const exifOrientation =
    mimeType === "image/jpeg" ? readJpegOrientation(header) : 1;

  // 3. Decode.
  let decoded: DecodedImage<TImage>;
  try {
    decoded = await adapters.decode(file);
  } catch {
    return imageDecodeFailed();
  }
  let decodedReleased = false;
  const releaseDecoded = () => {
    if (decodedReleased) return;
    decodedReleased = true;
    decoded.release();
  };

  let base: TCanvas | null = null;
  try {
    const raw = { width: decoded.width, height: decoded.height };
    if (!(raw.width >= 1 && raw.height >= 1)) return imageDecodeFailed();
    if (raw.width * raw.height > MAX_SOURCE_PIXELS) {
      return sourceTooLarge("pixels");
    }

    // 4. Orientation + resize: halve in stored orientation, rotate on the
    //    last draw so the upright result's longest edge is ≤ 2,048 px.
    const orientation = decoded.orientationApplied ? 1 : exifOrientation;
    const target = fitWithinMaxEdge(
      orientedSize(raw.width, raw.height, orientation),
    );
    const targetStored = orientedSize(target.width, target.height, orientation);
    const steps = planDownscaleSteps(raw, targetStored);
    let current: TImage | TCanvas = decoded.image;
    let drawn: TCanvas | null = null;
    try {
      for (const [index, step] of steps.entries()) {
        const canvas: TCanvas = adapters.draw(current, {
          width: step.width,
          height: step.height,
          orientation: index === steps.length - 1 ? orientation : 1,
        });
        if (drawn) adapters.releaseCanvas(drawn);
        else releaseDecoded();
        drawn = canvas;
        current = canvas;
      }
    } catch (error) {
      if (drawn) adapters.releaseCanvas(drawn);
      return error instanceof ImageProcessingError ? error : canvasFailed();
    }
    if (drawn === null) return canvasFailed();
    base = drawn;
    const baseCanvas: TCanvas = drawn;

    // 5. Always re-encode (strips all metadata) within the byte budget.
    const encoded = await encodeWithinBudget<TCanvas>({
      initialSize: target,
      preferWebp: adapters.webpSupported !== false,
      render: (size): RenderedSurface<TCanvas> => {
        if (sameSize(size, target)) {
          return { canvas: baseCanvas, dispose: () => undefined };
        }
        const canvas = adapters.draw(baseCanvas, { ...size, orientation: 1 });
        return { canvas, dispose: () => adapters.releaseCanvas(canvas) };
      },
      encode: (canvas, type, quality) => adapters.encode(canvas, type, quality),
    });
    if (encoded instanceof ImageProcessingError) return encoded;
    if (encoded.webpSupported !== undefined) {
      adapters.webpSupported = encoded.webpSupported;
    }

    // 6. Hash where practical; a missing digest never blocks the image.
    let sha256: string | null = null;
    if (adapters.digest) {
      try {
        sha256 = await sha256Hex(
          await adapters.readBytes(encoded.blob),
          adapters.digest,
        );
      } catch {
        sha256 = null;
      }
    }

    // 7. Local preview.
    return {
      blob: encoded.blob,
      mimeType: encoded.mimeType,
      width: encoded.width,
      height: encoded.height,
      byteSize: encoded.blob.size,
      sha256,
      preprocessingVersion: PREPROCESSING_VERSION,
      previewUrl: adapters.createObjectURL(encoded.blob),
    };
  } catch (error) {
    return error instanceof ImageProcessingError ? error : canvasFailed();
  } finally {
    releaseDecoded();
    if (base !== null) adapters.releaseCanvas(base);
  }
}

/**
 * Prepares one captured or picked image for upload (OBS-006, D-021):
 * sniff → source guards → decode + orientation → resize (≤ 2,048 px) →
 * re-encode (WebP or JPEG, quality 0.85/0.82, ≤ 5 MB) → SHA-256 → preview URL.
 *
 * Resolves with an `ImageProcessingError` instead of rejecting. Calls are
 * queued so only one image is processed at a time. Capture time must be
 * recorded separately by the caller; nothing is read from image metadata.
 */
export function processImage(
  file: Blob,
): Promise<ProcessedImage | ImageProcessingError>;
export function processImage<TImage, TCanvas>(
  file: Blob,
  adapters: ImageProcessingAdapters<TImage, TCanvas>,
): Promise<ProcessedImage | ImageProcessingError>;
export function processImage<TImage, TCanvas>(
  file: Blob,
  adapters?: ImageProcessingAdapters<TImage, TCanvas>,
): Promise<ProcessedImage | ImageProcessingError> {
  return enqueue(() =>
    adapters
      ? runPipeline(file, adapters)
      : runPipeline(file, getBrowserImageAdapters()),
  );
}
