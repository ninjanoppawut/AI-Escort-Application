/**
 * Stable image-processing failures. Messages are fixed developer strings and
 * never include file names, bytes, EXIF values, or other file contents.
 */

export type ImageProcessingErrorCode =
  "INVALID_IMAGE_TYPE" | "IMAGE_TOO_LARGE" | "IMAGE_PROCESSING_FAILED";

export type ImageProcessingErrorReason =
  /** Magic bytes are not JPEG, PNG, or WebP (HEIC, GIF, SVG, empty, ...). */
  | "unsupported_type"
  /** Magic bytes matched but the browser could not decode the image. */
  | "decode_failed"
  /** Source bytes or pixels exceed the pre-decode guards. */
  | "source"
  /** Every allowed encode attempt stayed above 5 MB. */
  | "compression"
  /** Canvas allocation or drawing failed (commonly memory on low-end phones). */
  | "canvas_failed"
  /** The browser encoder returned nothing or an unusable format. */
  | "encode_failed";

export class ImageProcessingError extends Error {
  override readonly name = "ImageProcessingError";
  readonly code: ImageProcessingErrorCode;
  readonly reason: ImageProcessingErrorReason;
  /** For `source` failures: which guard tripped. */
  readonly limit: "bytes" | "pixels" | undefined;

  constructor(
    code: ImageProcessingErrorCode,
    reason: ImageProcessingErrorReason,
    limit?: "bytes" | "pixels",
  ) {
    super(`${code}: ${reason}${limit ? ` (${limit})` : ""}`);
    this.code = code;
    this.reason = reason;
    this.limit = limit;
  }
}

export function isImageProcessingError(
  value: unknown,
): value is ImageProcessingError {
  return value instanceof ImageProcessingError;
}

export const invalidImageType = () =>
  new ImageProcessingError("INVALID_IMAGE_TYPE", "unsupported_type");

export const imageDecodeFailed = () =>
  new ImageProcessingError("INVALID_IMAGE_TYPE", "decode_failed");

export const sourceTooLarge = (limit: "bytes" | "pixels") =>
  new ImageProcessingError("IMAGE_TOO_LARGE", "source", limit);

export const compressionFailed = () =>
  new ImageProcessingError("IMAGE_TOO_LARGE", "compression");

export const canvasFailed = () =>
  new ImageProcessingError("IMAGE_PROCESSING_FAILED", "canvas_failed");

export const encodeFailed = () =>
  new ImageProcessingError("IMAGE_PROCESSING_FAILED", "encode_failed");
