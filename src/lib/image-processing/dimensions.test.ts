import { describe, expect, it } from "vitest";

import { MAX_CANVAS_PIXELS, MAX_EDGE_PX } from "./constants";
import {
  fitWithinMaxEdge,
  planDownscaleSteps,
  stepDownDimensions,
} from "./dimensions";

describe("fitWithinMaxEdge", () => {
  it.each([
    [4032, 3024, 2048, 1536],
    [3024, 4032, 1536, 2048],
    [3000, 8000, 768, 2048],
    [8000, 6000, 2048, 1536],
    [4096, 4096, 2048, 2048],
    [2049, 1, 2048, 1],
    [100000, 3, 2048, 1],
    [2048, 1024, 2048, 1024],
    [640, 480, 640, 480],
    [1, 1, 1, 1],
  ])("%i×%i → %i×%i", (width, height, expectedWidth, expectedHeight) => {
    expect(fitWithinMaxEdge({ width, height })).toEqual({
      width: expectedWidth,
      height: expectedHeight,
    });
  });

  it("never exceeds 2,048 px, never returns 0, and keeps the aspect ratio", () => {
    for (let width = 1; width <= 12000; width += 997) {
      for (let height = 1; height <= 12000; height += 1231) {
        const fitted = fitWithinMaxEdge({ width, height });
        expect(Math.max(fitted.width, fitted.height)).toBeLessThanOrEqual(
          MAX_EDGE_PX,
        );
        expect(Math.min(fitted.width, fitted.height)).toBeGreaterThanOrEqual(1);
        expect(
          Number.isInteger(fitted.width) && Number.isInteger(fitted.height),
        ).toBe(true);
        if (Math.max(width, height) > MAX_EDGE_PX) {
          expect(Math.max(fitted.width, fitted.height)).toBe(MAX_EDGE_PX);
          const ratio = width / height;
          const fittedRatio = fitted.width / fitted.height;
          // Rounding to whole pixels moves the short edge by at most 0.5 px.
          const shortEdge = Math.min(fitted.width, fitted.height);
          expect(Math.abs(fittedRatio / ratio - 1)).toBeLessThanOrEqual(
            shortEdge === 1 ? Infinity : 0.5 / (shortEdge - 0.5),
          );
        } else {
          expect(fitted).toEqual({ width, height });
        }
      }
    }
  });

  it("rejects zero, negative, and non-finite sizes", () => {
    expect(() => fitWithinMaxEdge({ width: 0, height: 10 })).toThrow(
      RangeError,
    );
    expect(() => fitWithinMaxEdge({ width: 10, height: -1 })).toThrow(
      RangeError,
    );
    expect(() => fitWithinMaxEdge({ width: Number.NaN, height: 10 })).toThrow(
      RangeError,
    );
    expect(() => fitWithinMaxEdge({ width: 10, height: 10 }, 0)).toThrow(
      RangeError,
    );
  });
});

describe("planDownscaleSteps", () => {
  it("keeps every canvas of an 8000×6000 source under the iOS canvas limit", () => {
    const steps = planDownscaleSteps(
      { width: 8000, height: 6000 },
      { width: 2048, height: 1536 },
    );
    expect(steps).toEqual([
      { width: 4000, height: 3000 },
      { width: 2048, height: 1536 },
    ]);
    for (const step of steps) {
      expect(step.width * step.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    }
  });

  it("skips halvings whose canvas would exceed the limit", () => {
    const steps = planDownscaleSteps(
      { width: 16000, height: 4000 },
      { width: 2048, height: 512 },
    );
    expect(steps[0]).toEqual({ width: 8000, height: 2000 });
    expect(steps.at(-1)).toEqual({ width: 2048, height: 512 });
    for (const step of steps) {
      expect(step.width * step.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    }
    const tight = planDownscaleSteps(
      { width: 8000, height: 6000 },
      { width: 2048, height: 1536 },
      10_000_000,
    );
    expect(tight).toEqual([{ width: 2048, height: 1536 }]);
  });

  it("uses a single draw when no halving fits", () => {
    expect(
      planDownscaleSteps(
        { width: 4032, height: 3024 },
        { width: 2048, height: 1536 },
      ),
    ).toEqual([{ width: 2048, height: 1536 }]);
    expect(
      planDownscaleSteps(
        { width: 640, height: 480 },
        { width: 640, height: 480 },
      ),
    ).toEqual([{ width: 640, height: 480 }]);
  });

  it("halves at most 2× per step after the first and ends on the target", () => {
    const steps = planDownscaleSteps(
      { width: 8192, height: 8192 },
      { width: 2048, height: 2048 },
    );
    expect(steps).toEqual([
      { width: 4096, height: 4096 },
      { width: 2048, height: 2048 },
    ]);
  });

  it("rejects upscaling and oversized targets", () => {
    expect(() =>
      planDownscaleSteps(
        { width: 100, height: 100 },
        { width: 200, height: 100 },
      ),
    ).toThrow(RangeError);
    expect(() =>
      planDownscaleSteps(
        { width: 10000, height: 10000 },
        { width: 5000, height: 5000 },
      ),
    ).toThrow(RangeError);
  });
});

describe("stepDownDimensions", () => {
  it("shrinks the longest edge by 0.85 and keeps the aspect ratio", () => {
    expect(stepDownDimensions({ width: 2048, height: 1536 })).toEqual({
      width: 1740,
      height: 1305,
    });
    expect(stepDownDimensions({ width: 768, height: 2048 })).toEqual({
      width: 653,
      height: 1740,
    });
  });

  it("returns null when the image cannot shrink further", () => {
    expect(stepDownDimensions({ width: 1, height: 1 })).toBeNull();
    expect(stepDownDimensions({ width: 1, height: 1 }, 0.5)).toBeNull();
  });

  it("never returns 0", () => {
    const next = stepDownDimensions({ width: 5000, height: 2 });
    expect(next).toEqual({ width: 4250, height: 2 });
    expect(stepDownDimensions({ width: 2, height: 1 })).toEqual({
      width: 1,
      height: 1,
    });
  });
});
