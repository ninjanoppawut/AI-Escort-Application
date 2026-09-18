import { DIMENSION_STEP, MAX_CANVAS_PIXELS, MAX_EDGE_PX } from "./constants";

export interface Size {
  width: number;
  height: number;
}

function assertSize(size: Size, label: string): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width < 1 ||
    size.height < 1
  ) {
    throw new RangeError(`${label} must be finite and at least 1 × 1 px`);
  }
}

/**
 * Scales `size` so its longest edge is at most `maxEdge`, preserving aspect
 * ratio with integer pixels ≥ 1. Sizes already within the limit are returned
 * unchanged (never upscaled). 4032×3024 → 2048×1536; 3000×8000 → 768×2048.
 */
export function fitWithinMaxEdge(
  size: Size,
  maxEdge: number = MAX_EDGE_PX,
): Size {
  assertSize(size, "size");
  if (!Number.isFinite(maxEdge) || maxEdge < 1) {
    throw new RangeError("maxEdge must be finite and at least 1 px");
  }
  const width = Math.round(size.width);
  const height = Math.round(size.height);
  const limit = Math.floor(maxEdge);
  const longest = Math.max(width, height);
  if (longest <= limit) return { width, height };
  const scale = limit / longest;
  const clamp = (value: number) =>
    Math.min(limit, Math.max(1, Math.round(value * scale)));
  return width >= height
    ? { width: limit, height: clamp(height) }
    : { width: clamp(width), height: limit };
}

/**
 * Downscale plan from `source` to `target` by repeated halving (better quality
 * than one large jump). Every returned canvas size is at most
 * `maxCanvasPixels`; halvings that would exceed it are skipped without
 * allocating. The last entry is always `target`.
 */
export function planDownscaleSteps(
  source: Size,
  target: Size,
  maxCanvasPixels: number = MAX_CANVAS_PIXELS,
): Size[] {
  assertSize(source, "source");
  assertSize(target, "target");
  if (target.width > source.width || target.height > source.height) {
    throw new RangeError("target must not be larger than source");
  }
  if (target.width * target.height > maxCanvasPixels) {
    throw new RangeError("target exceeds the canvas pixel limit");
  }
  const steps: Size[] = [];
  let width = source.width;
  let height = source.height;
  for (;;) {
    const nextWidth = Math.floor(width / 2);
    const nextHeight = Math.floor(height / 2);
    if (nextWidth < target.width || nextHeight < target.height) break;
    width = nextWidth;
    height = nextHeight;
    if (width === target.width && height === target.height) break;
    if (width * height <= maxCanvasPixels) steps.push({ width, height });
  }
  steps.push({ width: target.width, height: target.height });
  return steps;
}

/**
 * Next smaller size for the compression loop: the longest edge shrinks by
 * `factor` with aspect ratio preserved. Returns null when it cannot shrink.
 */
export function stepDownDimensions(
  size: Size,
  factor: number = DIMENSION_STEP,
): Size | null {
  assertSize(size, "size");
  if (!(factor > 0 && factor < 1)) {
    throw new RangeError("factor must be between 0 and 1");
  }
  const longest = Math.max(size.width, size.height);
  const nextEdge = Math.floor(longest * factor);
  if (nextEdge < 1) return null;
  const next = fitWithinMaxEdge(size, nextEdge);
  return next.width === size.width && next.height === size.height ? null : next;
}
