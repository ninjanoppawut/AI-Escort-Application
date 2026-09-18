import { describe, expect, it } from "vitest";

import {
  orientationSwapsDimensions,
  orientationTransform,
  orientedSize,
  readJpegOrientation,
  type ExifOrientation,
} from "./exif-orientation";
import { buildExifApp1, buildSyntheticJpeg } from "./synthetic-jpeg";

const ORIENTATIONS: ExifOrientation[] = [1, 2, 3, 4, 5, 6, 7, 8];

function jpegWith(segments: number[][]): Uint8Array {
  const base = buildSyntheticJpeg({ width: 8, height: 8 });
  return new Uint8Array([0xff, 0xd8, ...segments.flat(), ...base.subarray(2)]);
}

/** Offset of the orientation SHORT value inside an APP1 built by buildExifApp1. */
function orientationValueOffset(
  app1: Uint8Array,
  littleEndian: boolean,
): number {
  const tag = littleEndian ? [0x12, 0x01] : [0x01, 0x12];
  const index = app1.findIndex(
    (byte, i) => byte === tag[0] && app1[i + 1] === tag[1],
  );
  return index + 8;
}

describe("readJpegOrientation", () => {
  it.each(
    ORIENTATIONS.flatMap((orientation) => [
      [orientation, false] as const,
      [orientation, true] as const,
    ]),
  )("reads orientation %i (little-endian: %s)", (orientation, littleEndian) => {
    const bytes = buildSyntheticJpeg({
      width: 16,
      height: 8,
      exif: {
        orientation,
        littleEndian,
        make: "FakeCam",
        gps: { latitude: 1.5, longitude: -2.25 },
      },
    });
    expect(readJpegOrientation(bytes)).toBe(orientation);
  });

  it("returns 1 without an APP1 segment or orientation tag", () => {
    expect(
      readJpegOrientation(buildSyntheticJpeg({ width: 8, height: 8 })),
    ).toBe(1);
    expect(
      readJpegOrientation(
        buildSyntheticJpeg({ width: 8, height: 8, exif: { make: "FakeCam" } }),
      ),
    ).toBe(1);
  });

  it("returns 1 for non-JPEG, empty, and SOI-only input", () => {
    expect(readJpegOrientation(new Uint8Array())).toBe(1);
    expect(readJpegOrientation(new Uint8Array([0xff, 0xd8]))).toBe(1);
    expect(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(
      1,
    );
  });

  it("skips XMP APP1 and finds a later Exif APP1 after APP0", () => {
    const xmp = [
      0xff,
      0xe1,
      0x00,
      0x0c,
      ...Array.from("http://ns.a", (c) => c.charCodeAt(0)).slice(0, 10),
    ];
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
    const exif = Array.from(buildExifApp1({ orientation: 8 }));
    expect(readJpegOrientation(jpegWith([app0, xmp, exif]))).toBe(8);
  });

  it("tolerates fill bytes before a marker", () => {
    const exif = Array.from(buildExifApp1({ orientation: 3 }));
    expect(readJpegOrientation(jpegWith([[0xff, 0xff], exif]))).toBe(3);
  });

  it("returns 1 for out-of-range orientation values", () => {
    for (const littleEndian of [false, true]) {
      const app1 = buildExifApp1({ orientation: 6, littleEndian });
      const offset = orientationValueOffset(app1, littleEndian);
      for (const bad of [0, 9, 0xffff]) {
        const copy = app1.slice();
        copy[offset] = littleEndian ? bad & 0xff : bad >> 8;
        copy[offset + 1] = littleEndian ? bad >> 8 : bad & 0xff;
        expect(readJpegOrientation(jpegWith([Array.from(copy)]))).toBe(1);
      }
    }
  });

  it("returns 1 when the APP1 is truncated at every length", () => {
    const full = buildSyntheticJpeg({
      width: 8,
      height: 8,
      exif: { orientation: 6, gps: { latitude: 1, longitude: 1 } },
    });
    const app1Length = (full[4]! << 8) | full[5]!;
    for (let end = 0; end < 4 + app1Length; end += 1) {
      const result = readJpegOrientation(full.subarray(0, end));
      expect([1, 6]).toContain(result);
    }
    // Cutting before the orientation value cannot produce 6.
    expect(readJpegOrientation(full.subarray(0, 20))).toBe(1);
  });

  it("does not throw on hostile length and offset fields", () => {
    // Big-endian APP1 layout: 10 byte order, 12 magic, 14 IFD0 offset,
    // 18 entry count, 20 first entry tag (orientation).
    const app1 = buildExifApp1({ orientation: 6 });

    // A declared length past the end of the file is clamped: the complete
    // TIFF block before the cut is still read.
    const overlong = app1.slice();
    overlong.set([0xff, 0xff], 2);
    expect(readJpegOrientation(new Uint8Array([0xff, 0xd8, ...overlong]))).toBe(
      6,
    );

    const cases: Array<(copy: Uint8Array) => void> = [
      // Declared length past the end with the TIFF block cut short.
      (copy) => {
        copy.set([0xff, 0xff], 2);
        copy.fill(0, 20);
      },
      // Segment length shorter than its own length field.
      (copy) => {
        copy[2] = 0x00;
        copy[3] = 0x01;
      },
      // IFD0 offset pointing past the TIFF block.
      (copy) => {
        copy.set([0x7f, 0xff, 0xff, 0xff], 14);
      },
      // IFD0 offset inside the TIFF header.
      (copy) => {
        copy.set([0, 0, 0, 2], 14);
      },
      // Entry count far larger than the block, with no orientation entry.
      (copy) => {
        copy.set([0xff, 0xff], 18);
        copy.set([0x01, 0x13], 20);
      },
      // Orientation stored with the wrong TIFF type (LONG instead of SHORT).
      (copy) => {
        copy.set([0x00, 0x04], 22);
      },
      // Unknown byte order.
      (copy) => {
        copy.set([0x58, 0x58], 10);
      },
      // Wrong TIFF magic number.
      (copy) => {
        copy.set([0, 43], 12);
      },
    ];
    for (const mutate of cases) {
      const copy = app1.slice();
      mutate(copy);
      expect(() =>
        readJpegOrientation(jpegWith([Array.from(copy)])),
      ).not.toThrow();
      expect(readJpegOrientation(jpegWith([Array.from(copy)]))).toBe(1);
    }
  });
});

describe("orientation helpers", () => {
  it("swaps dimensions only for orientations 5–8", () => {
    expect(ORIENTATIONS.filter(orientationSwapsDimensions)).toEqual([
      5, 6, 7, 8,
    ]);
    expect(orientedSize(4032, 3024, 6)).toEqual({ width: 3024, height: 4032 });
    expect(orientedSize(4032, 3024, 3)).toEqual({ width: 4032, height: 3024 });
  });

  it.each(ORIENTATIONS)(
    "orientation %i maps the stored corners onto the upright canvas",
    (orientation) => {
      const width = 40;
      const height = 30;
      const [a, b, c, d, e, f] = orientationTransform(
        orientation,
        width,
        height,
      );
      const apply = (x: number, y: number) => [
        a * x + c * y + e,
        b * x + d * y + f,
      ];
      const upright = orientedSize(width, height, orientation);
      const corners = [
        apply(0, 0),
        apply(width, 0),
        apply(0, height),
        apply(width, height),
      ].map(([x, y]) => `${x},${y}`);
      // The four stored corners land exactly on the four canvas corners.
      expect(new Set(corners)).toEqual(
        new Set([
          "0,0",
          `${upright.width},0`,
          `0,${upright.height}`,
          `${upright.width},${upright.height}`,
        ]),
      );
    },
  );

  it("rotates the stored top-left corner to the expected upright corner", () => {
    const expected: Record<ExifOrientation, string> = {
      1: "0,0",
      2: "40,0",
      3: "40,30",
      4: "0,30",
      5: "0,0",
      6: "30,0",
      7: "30,40",
      8: "0,40",
    };
    for (const orientation of ORIENTATIONS) {
      const [, , , , e, f] = orientationTransform(orientation, 40, 30);
      expect(`${e},${f}`).toBe(expected[orientation]);
    }
  });
});
