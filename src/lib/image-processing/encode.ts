import {
  DIMENSION_STEP,
  MAX_ENCODE_ATTEMPTS,
  MAX_OUTPUT_BYTES,
  QUALITY_STEPS,
  type OutputMimeType,
} from "./constants";
import { stepDownDimensions, type Size } from "./dimensions";
import {
  canvasFailed,
  compressionFailed,
  encodeFailed,
  ImageProcessingError,
} from "./errors";

/** Encodes a canvas-like surface, e.g. `canvas.toBlob` wrapped in a promise. */
export type ImageEncoder<TCanvas> = (
  canvas: TCanvas,
  mimeType: OutputMimeType,
  quality: number,
) => Promise<Blob>;

export interface RenderedSurface<TCanvas> {
  canvas: TCanvas;
  /** Releases the surface's memory; a no-op for surfaces owned elsewhere. */
  dispose(): void;
}

export interface EncodeWithinBudgetOptions<TCanvas> {
  /** Upright size of the first attempt (already fitted to 2,048 px). */
  initialSize: Size;
  /** Produces an upright surface at `size`; called once per size. */
  render: (
    size: Size,
  ) => RenderedSurface<TCanvas> | Promise<RenderedSurface<TCanvas>>;
  encode: ImageEncoder<TCanvas>;
  /** Try WebP first. Pass false once the browser is known to fall back. */
  preferWebp?: boolean;
  maxBytes?: number;
  maxAttempts?: number;
  qualitySteps?: readonly number[];
  dimensionStep?: number;
}

export interface EncodedImage {
  blob: Blob;
  mimeType: OutputMimeType;
  width: number;
  height: number;
  quality: number;
  /** Encoder calls counted against `maxAttempts` (WebP probes excluded). */
  attempts: number;
  /** False when a WebP request came back in another format. */
  webpSupported: boolean | undefined;
}

/**
 * Re-encodes an image until it fits the byte budget. Always encodes at least
 * once, which is what strips EXIF/GPS/device metadata even from small images.
 *
 * WebP is used only if the returned blob really is `image/webp`; Safari
 * silently returns PNG instead, in which case JPEG is used from then on and
 * the probe does not count as an attempt. Qualities follow `qualitySteps`
 * (0.85 then 0.82, never lower per D-021). When every quality is still over
 * budget the longest edge shrinks by `dimensionStep` and the loop repeats, up
 * to `maxAttempts` encoder calls in total, then fails with IMAGE_TOO_LARGE.
 */
export async function encodeWithinBudget<TCanvas>(
  options: EncodeWithinBudgetOptions<TCanvas>,
): Promise<EncodedImage | ImageProcessingError> {
  const {
    initialSize,
    render,
    encode,
    preferWebp = true,
    maxBytes = MAX_OUTPUT_BYTES,
    maxAttempts = MAX_ENCODE_ATTEMPTS,
    qualitySteps = QUALITY_STEPS,
    dimensionStep = DIMENSION_STEP,
  } = options;

  let mimeType: OutputMimeType = preferWebp ? "image/webp" : "image/jpeg";
  let webpSupported: boolean | undefined;
  let attempts = 0;
  let size: Size | null = initialSize;

  while (size && attempts < maxAttempts) {
    let surface: RenderedSurface<TCanvas>;
    try {
      surface = await render(size);
    } catch (error) {
      return error instanceof ImageProcessingError ? error : canvasFailed();
    }
    try {
      for (const quality of qualitySteps) {
        if (attempts >= maxAttempts) break;
        let blob = await encode(surface.canvas, mimeType, quality);
        if (mimeType === "image/webp" && blob.type !== "image/webp") {
          webpSupported = false;
          mimeType = "image/jpeg";
          blob = await encode(surface.canvas, mimeType, quality);
        } else if (mimeType === "image/webp") {
          webpSupported = true;
        }
        attempts += 1;
        if (blob.type !== mimeType || blob.size === 0) return encodeFailed();
        if (blob.size <= maxBytes) {
          return {
            blob,
            mimeType,
            width: size.width,
            height: size.height,
            quality,
            attempts,
            webpSupported,
          };
        }
      }
    } catch (error) {
      if (error instanceof ImageProcessingError) return error;
      return encodeFailed();
    } finally {
      surface.dispose();
    }
    size = stepDownDimensions(size, dimensionStep);
  }
  return compressionFailed();
}
