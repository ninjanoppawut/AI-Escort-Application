import { describe, expect, it } from "vitest";

import {
  createSchematicProjection,
  geometryBounds,
  lineStringSchema,
  parseGeoJsonText,
  pointSchema,
  polygonSchema,
} from "./geojson";

const square = {
  type: "Polygon",
  coordinates: [
    [
      [100.5, 13.75],
      [100.51, 13.75],
      [100.51, 13.76],
      [100.5, 13.76],
      [100.5, 13.75],
    ],
  ],
};

describe("GeoJSON schemas", () => {
  it("accepts closed polygons and rejects open or out-of-range rings", () => {
    expect(polygonSchema.safeParse(square).success).toBe(true);
    const open = {
      ...square,
      coordinates: [square.coordinates[0]!.slice(0, 4)],
    };
    expect(polygonSchema.safeParse(open).success).toBe(false);
    const flipped = {
      type: "Polygon",
      coordinates: [
        [
          [13.75, 100.5],
          [13.76, 100.5],
          [13.76, 100.51],
          [13.75, 100.5],
        ],
      ],
    };
    expect(polygonSchema.safeParse(flipped).success).toBe(false);
  });

  it("drops altitude and requires at least two route points", () => {
    expect(
      pointSchema.parse({ type: "Point", coordinates: [100.5, 13.75, 12] }),
    ).toEqual({ type: "Point", coordinates: [100.5, 13.75] });
    expect(
      lineStringSchema.safeParse({
        type: "LineString",
        coordinates: [[100.5, 13.75]],
      }).success,
    ).toBe(false);
  });
});

describe("parseGeoJsonText", () => {
  it("reads raw geometries, Features, and FeatureCollections", () => {
    expect(
      parseGeoJsonText(JSON.stringify(square), polygonSchema, "Polygon").data,
    ).toEqual(square);
    const collection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [1, 2] } },
        { type: "Feature", properties: {}, geometry: square },
      ],
    };
    expect(
      parseGeoJsonText(JSON.stringify(collection), polygonSchema, "Polygon")
        .data,
    ).toEqual(square);
  });

  it("explains unreadable JSON and missing shapes in Thai", () => {
    expect(parseGeoJsonText("{", polygonSchema, "Polygon").error).toContain(
      "GeoJSON",
    );
    expect(
      parseGeoJsonText(JSON.stringify(square), lineStringSchema, "LineString")
        .error,
    ).toBe("ไม่พบรูปร่างแบบ LineString ใน GeoJSON นี้");
  });
});

describe("schematic projection", () => {
  it("fits bounds inside the viewBox with north up", () => {
    const positions = square.coordinates[0]!.map(
      ([longitude, latitude]) => [longitude!, latitude!] as const,
    );
    const bounds = geometryBounds(positions);
    expect(bounds).not.toBeNull();
    const project = createSchematicProjection(bounds!, 200, 10);
    const southWest = project([100.5, 13.75]);
    const northEast = project([100.51, 13.76]);
    expect(southWest.y).toBeGreaterThan(northEast.y);
    for (const point of [southWest, northEast]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(200);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(200);
    }
    expect(geometryBounds([])).toBeNull();
  });
});
