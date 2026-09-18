import type { ExifOrientation } from "./exif-orientation";

/**
 * Minimal baseline JPEG writer for flat-colour 8 × 8 blocks. It exists for the
 * browser orientation self-test and for fixtures; it is not a general encoder.
 * With an all-ones quantisation table, each block decodes to exactly its
 * colour (DC-only, every AC coefficient zero), so tests can assert pixels.
 */

export type Rgb = readonly [number, number, number];

export interface SyntheticExifOptions {
  orientation?: ExifOrientation;
  /** TIFF byte order: "II" when true, "MM" when false (default). */
  littleEndian?: boolean;
  /** Fake coordinates written as GPS IFD tags (decimal degrees). */
  gps?: { latitude: number; longitude: number };
  /** Written as the TIFF Make tag; handy for metadata-stripping assertions. */
  make?: string;
}

export interface SyntheticJpegOptions {
  width: number;
  height: number;
  /** Colour of the 8 × 8 block at block column `bx`, row `by`. */
  blockColor?: (bx: number, by: number) => Rgb;
  exif?: SyntheticExifOptions;
}

class ByteSink {
  private buffer = new Uint8Array(1024);
  length = 0;

  push(...values: number[]): void {
    for (const value of values) {
      if (this.length === this.buffer.length) {
        const next = new Uint8Array(this.buffer.length * 2);
        next.set(this.buffer);
        this.buffer = next;
      }
      this.buffer[this.length] = value & 0xff;
      this.length += 1;
    }
  }

  pushBytes(bytes: ArrayLike<number>): void {
    for (let i = 0; i < bytes.length; i += 1) this.push(bytes[i]!);
  }

  u16(value: number, littleEndian = false): void {
    if (littleEndian) this.push(value & 0xff, value >> 8);
    else this.push(value >> 8, value & 0xff);
  }

  u32(value: number, littleEndian = false): void {
    const bytes = [
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ];
    this.pushBytes(littleEndian ? bytes.reverse() : bytes);
  }

  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

class BitWriter {
  private current = 0;
  private count = 0;

  constructor(private readonly sink: ByteSink) {}

  write(code: number, length: number): void {
    for (let bit = length - 1; bit >= 0; bit -= 1) {
      this.current = (this.current << 1) | ((code >> bit) & 1);
      this.count += 1;
      if (this.count === 8) this.emit();
    }
  }

  flush(): void {
    if (this.count === 0) return;
    const pad = 8 - this.count;
    this.current = (this.current << pad) | ((1 << pad) - 1);
    this.emit();
  }

  private emit(): void {
    this.sink.push(this.current);
    if (this.current === 0xff) this.sink.push(0x00); // byte stuffing
    this.current = 0;
    this.count = 0;
  }
}

/** Standard luminance DC table (ITU T.81 Annex K.3). */
const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
/** Optimised AC table holding only End-of-Block, as libjpeg emits for flat images. */
const AC_BITS = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const AC_VALUES = [0x00];

function huffmanCodes(
  bits: number[],
  values: number[],
): Map<number, [number, number]> {
  const codes = new Map<number, [number, number]>();
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let i = 0; i < bits[length - 1]!; i += 1) {
      codes.set(values[k]!, [code, length]);
      code += 1;
      k += 1;
    }
    code <<= 1;
  }
  return codes;
}

const clampByte = (value: number) =>
  Math.min(255, Math.max(0, Math.round(value)));

function toYCbCr([r, g, b]: Rgb): [number, number, number] {
  return [
    clampByte(0.299 * r + 0.587 * g + 0.114 * b),
    clampByte(128 - 0.168736 * r - 0.331264 * g + 0.5 * b),
    clampByte(128 + 0.5 * r - 0.418688 * g - 0.081312 * b),
  ];
}

function rationals(degrees: number): number[] {
  const absolute = Math.abs(degrees);
  const whole = Math.floor(absolute);
  const minutes = Math.floor((absolute - whole) * 60);
  const seconds = Math.round(((absolute - whole) * 60 - minutes) * 60 * 100);
  return [whole, 1, minutes, 1, seconds, 100];
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Raw value bytes in the file's byte order. */
  data: number[];
}

function valueBytes(
  type: "short" | "long" | "rational",
  values: number[],
  le: boolean,
): number[] {
  const sink = new ByteSink();
  for (const value of values) {
    if (type === "short") sink.u16(value, le);
    else sink.u32(value, le);
  }
  return Array.from(sink.toBytes());
}

const ascii = (text: string) => [
  ...Array.from(text, (c) => c.charCodeAt(0) & 0x7f),
  0,
];

function ifdSize(entries: IfdEntry[]): number {
  const external = entries.reduce(
    (sum, entry) =>
      sum +
      (entry.data.length > 4 ? entry.data.length + (entry.data.length % 2) : 0),
    0,
  );
  return 2 + entries.length * 12 + 4 + external;
}

function writeIfd(
  sink: ByteSink,
  entries: IfdEntry[],
  offset: number,
  le: boolean,
): void {
  let dataOffset = offset + 2 + entries.length * 12 + 4;
  const external: number[][] = [];
  sink.u16(entries.length, le);
  for (const entry of entries) {
    sink.u16(entry.tag, le);
    sink.u16(entry.type, le);
    sink.u32(entry.count, le);
    if (entry.data.length <= 4) {
      sink.pushBytes([...entry.data, 0, 0, 0, 0].slice(0, 4));
    } else {
      sink.u32(dataOffset, le);
      const padded = entry.data.length % 2 ? [...entry.data, 0] : entry.data;
      external.push(padded);
      dataOffset += padded.length;
    }
  }
  sink.u32(0, le); // no next IFD
  for (const data of external) sink.pushBytes(data);
}

/** Builds a complete APP1 segment (FF E1, length, "Exif\0\0", TIFF block). */
export function buildExifApp1(options: SyntheticExifOptions): Uint8Array {
  const le = options.littleEndian ?? false;
  const ifd0: IfdEntry[] = [];
  if (options.make !== undefined) {
    const data = ascii(options.make);
    ifd0.push({ tag: 0x010f, type: 2, count: data.length, data });
  }
  if (options.orientation !== undefined) {
    ifd0.push({
      tag: 0x0112,
      type: 3,
      count: 1,
      data: valueBytes("short", [options.orientation], le),
    });
  }
  const gpsEntries: IfdEntry[] = [];
  if (options.gps) {
    const { latitude, longitude } = options.gps;
    gpsEntries.push(
      { tag: 0x0000, type: 1, count: 4, data: [2, 3, 0, 0] },
      {
        tag: 0x0001,
        type: 2,
        count: 2,
        data: ascii(latitude >= 0 ? "N" : "S"),
      },
      {
        tag: 0x0002,
        type: 5,
        count: 3,
        data: valueBytes("rational", rationals(latitude), le),
      },
      {
        tag: 0x0003,
        type: 2,
        count: 2,
        data: ascii(longitude >= 0 ? "E" : "W"),
      },
      {
        tag: 0x0004,
        type: 5,
        count: 3,
        data: valueBytes("rational", rationals(longitude), le),
      },
    );
    ifd0.push({ tag: 0x8825, type: 4, count: 1, data: [] }); // offset patched below
  }
  const ifd0Offset = 8;
  const gpsOffset = ifd0Offset + ifdSize(ifd0);
  const gpsPointer = ifd0.find((entry) => entry.tag === 0x8825);
  if (gpsPointer) gpsPointer.data = valueBytes("long", [gpsOffset], le);

  const tiff = new ByteSink();
  tiff.pushBytes(le ? [0x49, 0x49] : [0x4d, 0x4d]);
  tiff.u16(42, le);
  tiff.u32(ifd0Offset, le);
  writeIfd(tiff, ifd0, ifd0Offset, le);
  if (gpsEntries.length > 0) writeIfd(tiff, gpsEntries, gpsOffset, le);

  const payload = tiff.toBytes();
  const segment = new ByteSink();
  segment.push(0xff, 0xe1);
  segment.u16(2 + 6 + payload.length);
  segment.pushBytes(ascii("Exif"));
  segment.push(0x00);
  segment.pushBytes(payload);
  return segment.toBytes();
}

/** Encodes a baseline 4:4:4 YCbCr JPEG whose 8 × 8 blocks are flat colours. */
export function buildSyntheticJpeg(options: SyntheticJpegOptions): Uint8Array {
  const { width, height, blockColor = () => [34, 139, 34] as const } = options;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 65535 ||
    height > 65535
  ) {
    throw new RangeError("width and height must be integers from 1 to 65535");
  }
  const sink = new ByteSink();
  sink.push(0xff, 0xd8);
  if (options.exif) sink.pushBytes(buildExifApp1(options.exif));

  // DQT: table 0, all ones, so DC = 8 × (sample − 128) exactly.
  sink.push(0xff, 0xdb);
  sink.u16(67);
  sink.push(0x00);
  for (let i = 0; i < 64; i += 1) sink.push(1);

  // SOF0: 8-bit, three components, no subsampling, all using table 0.
  sink.push(0xff, 0xc0);
  sink.u16(17);
  sink.push(8);
  sink.u16(height);
  sink.u16(width);
  sink.push(3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0);

  // DHT: one DC and one AC table shared by all components.
  sink.push(0xff, 0xc4);
  sink.u16(2 + 17 + DC_VALUES.length + 17 + AC_VALUES.length);
  sink.push(0x00, ...DC_BITS, ...DC_VALUES);
  sink.push(0x10, ...AC_BITS, ...AC_VALUES);

  // SOS
  sink.push(0xff, 0xda);
  sink.u16(12);
  sink.push(3, 1, 0x00, 2, 0x00, 3, 0x00, 0, 63, 0);

  const dc = huffmanCodes(DC_BITS, DC_VALUES);
  const [eobCode, eobLength] = huffmanCodes(AC_BITS, AC_VALUES).get(0x00)!;
  const bits = new BitWriter(sink);
  const predictors = [0, 0, 0];
  const blocksX = Math.ceil(width / 8);
  const blocksY = Math.ceil(height / 8);
  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const components = toYCbCr(blockColor(bx, by));
      for (let c = 0; c < 3; c += 1) {
        const value = 8 * (components[c]! - 128);
        const diff = value - predictors[c]!;
        predictors[c] = value;
        let category = 0;
        for (let magnitude = Math.abs(diff); magnitude > 0; magnitude >>= 1) {
          category += 1;
        }
        const [code, length] = dc.get(category)!;
        bits.write(code, length);
        if (category > 0)
          bits.write(diff >= 0 ? diff : diff + (1 << category) - 1, category);
        bits.write(eobCode, eobLength);
      }
    }
  }
  bits.flush();
  sink.push(0xff, 0xd9);
  return sink.toBytes();
}
