import { z } from "zod";

// GeoJSON is [longitude, latitude] in WGS84 (API_AND_REALTIME.md §22). An
// optional altitude is accepted from mapping tools and dropped.
export const positionSchema = z
  .array(z.number().finite())
  .min(2)
  .max(3)
  .refine(
    ([longitude, latitude]) =>
      longitude !== undefined &&
      latitude !== undefined &&
      longitude >= -180 &&
      longitude <= 180 &&
      latitude >= -90 &&
      latitude <= 90,
    "พิกัดต้องเป็น [ลองจิจูด, ละติจูด] ในช่วงที่ถูกต้อง",
  )
  .transform(([longitude, latitude]) => [longitude!, latitude!] as const);

export type Position = z.output<typeof positionSchema>;

const MAX_POINTS = 2000;

const ringSchema = z
  .array(positionSchema)
  .min(4, "ขอบเขตต้องมีอย่างน้อย 3 มุมและปิดรูป")
  .max(MAX_POINTS)
  .refine((ring) => {
    const first = ring[0];
    const last = ring[ring.length - 1];
    return (
      first !== undefined &&
      last !== undefined &&
      first[0] === last[0] &&
      first[1] === last[1]
    );
  }, "จุดแรกและจุดสุดท้ายของขอบเขตต้องเป็นจุดเดียวกัน");

export const polygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(ringSchema).min(1).max(10),
  })
  .refine(
    (polygon) =>
      polygon.coordinates.reduce((total, ring) => total + ring.length, 0) <=
      MAX_POINTS,
    `ขอบเขตมีจุดได้ไม่เกิน ${MAX_POINTS} จุด`,
  );

export const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z
    .array(positionSchema)
    .min(2, "เส้นทางต้องมีอย่างน้อย 2 จุด")
    .max(MAX_POINTS),
});

export const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: positionSchema,
});

export type PolygonGeometry = z.output<typeof polygonSchema>;
export type LineStringGeometry = z.output<typeof lineStringSchema>;
export type PointGeometry = z.output<typeof pointSchema>;

type GeometrySchema =
  typeof polygonSchema | typeof lineStringSchema | typeof pointSchema;

/**
 * Parses pasted or uploaded GeoJSON. Mapping tools usually export a Feature or
 * FeatureCollection, so the first geometry of the expected type is used.
 */
export function parseGeoJsonText<TSchema extends GeometrySchema>(
  text: string,
  schema: TSchema,
  expectedType: "Polygon" | "LineString" | "Point",
):
  { data: z.output<TSchema>; error?: never } | { data?: never; error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      error: "ไม่ใช่ GeoJSON ที่อ่านได้ ตรวจวงเล็บและเครื่องหมายจุลภาค",
    };
  }

  const candidates: unknown[] = [];
  const collect = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    const record = item as {
      type?: unknown;
      geometry?: unknown;
      features?: unknown;
    };
    if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
      record.features.forEach(collect);
    } else if (record.type === "Feature") {
      collect(record.geometry);
    } else {
      candidates.push(item);
    }
  };
  collect(value);

  const match = candidates.find(
    (candidate) => (candidate as { type?: unknown }).type === expectedType,
  );
  if (!match) {
    return { error: `ไม่พบรูปร่างแบบ ${expectedType} ใน GeoJSON นี้` };
  }

  const parsed = schema.safeParse(match);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "รูปร่างใน GeoJSON ไม่ถูกต้อง",
    };
  }
  return { data: parsed.data as z.output<TSchema> };
}

export interface GeometryBounds {
  minLongitude: number;
  maxLongitude: number;
  minLatitude: number;
  maxLatitude: number;
}

export function geometryBounds(positions: readonly Position[]) {
  if (!positions.length) return null;
  return positions.reduce<GeometryBounds>(
    (bounds, [longitude, latitude]) => ({
      minLongitude: Math.min(bounds.minLongitude, longitude),
      maxLongitude: Math.max(bounds.maxLongitude, longitude),
      minLatitude: Math.min(bounds.minLatitude, latitude),
      maxLatitude: Math.max(bounds.maxLatitude, latitude),
    }),
    {
      minLongitude: Infinity,
      maxLongitude: -Infinity,
      minLatitude: Infinity,
      maxLatitude: -Infinity,
    },
  );
}

/**
 * Projects positions into a square SVG viewBox for the schematic preview used
 * while map tiles are unavailable. Longitude is scaled by cos(latitude) so
 * shapes keep their proportions.
 */
export function createSchematicProjection(
  bounds: GeometryBounds,
  size: number,
  padding: number,
) {
  const midLatitude =
    ((bounds.minLatitude + bounds.maxLatitude) / 2) * (Math.PI / 180);
  const scaleX = Math.cos(midLatitude);
  const width = Math.max(
    (bounds.maxLongitude - bounds.minLongitude) * scaleX,
    1e-9,
  );
  const height = Math.max(bounds.maxLatitude - bounds.minLatitude, 1e-9);
  const scale = (size - padding * 2) / Math.max(width, height);
  const offsetX = (size - width * scale) / 2;
  const offsetY = (size - height * scale) / 2;

  return ([longitude, latitude]: Position) => ({
    x: offsetX + (longitude - bounds.minLongitude) * scaleX * scale,
    y: offsetY + (bounds.maxLatitude - latitude) * scale,
  });
}
