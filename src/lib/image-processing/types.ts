import type { OutputMimeType, PREPROCESSING_VERSION } from "./constants";
import type { ExifOrientation } from "./exif-orientation";
import type { DigestFn } from "./hash";

export interface DecodedImage<TImage> {
  image: TImage;
  /** Size of `image` as the browser will draw it. */
  width: number;
  height: number;
  /** True when the decoder already applied EXIF orientation (self-tested). */
  orientationApplied: boolean;
  /** Frees decoder memory (e.g. `ImageBitmap.close()`). */
  release(): void;
}

export interface DrawRequest {
  /** Size to draw the input at, before orientation. */
  width: number;
  height: number;
  /** The new surface is `orientedSize(width, height, orientation)`. */
  orientation: ExifOrientation;
}

/**
 * Browser capabilities the pipeline needs. Injected so the orchestration can
 * be tested without a canvas (jsdom has none).
 */
export interface ImageProcessingAdapters<TImage, TCanvas> {
  readBytes(blob: Blob, maxBytes?: number): Promise<Uint8Array>;
  decode(blob: Blob): Promise<DecodedImage<TImage>>;
  /** Creates a new surface and draws `input` into it; throws on failure. */
  draw(input: TImage | TCanvas, request: DrawRequest): TCanvas;
  encode(
    canvas: TCanvas,
    mimeType: OutputMimeType,
    quality: number,
  ): Promise<Blob>;
  releaseCanvas(canvas: TCanvas): void;
  /** SHA-256 digest, or null when Web Crypto is unavailable. */
  digest: DigestFn | null;
  createObjectURL(blob: Blob): string;
  /** Remembered after the first encode so later images skip the WebP probe. */
  webpSupported?: boolean;
}

export interface ProcessedImage {
  /** Re-encoded image with no EXIF, GPS, or device metadata. */
  blob: Blob;
  mimeType: OutputMimeType;
  width: number;
  height: number;
  byteSize: number;
  /** Lowercase SHA-256 hex of `blob`; null only without Web Crypto. */
  sha256: string | null;
  preprocessingVersion: typeof PREPROCESSING_VERSION;
  /** Object URL for local preview. Revoke with `revokePreviewUrl` when done. */
  previewUrl: string;
}
