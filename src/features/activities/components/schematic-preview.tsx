import { cn } from "@/lib/utils";

import type {
  LineStringGeometry,
  PointGeometry,
  PolygonGeometry,
  Position,
} from "../geojson";
import { createSchematicProjection, geometryBounds } from "../geojson";

const SIZE = 240;
const PADDING = 20;

/**
 * A named position drawn on the sketch. Markers carry shape, number, and a
 * text label so they never rely on color: live students are ringed circles,
 * stale ones dashed rings. The equivalent list view lives next to the sketch.
 */
export interface SchematicMarker {
  id: string;
  number: number;
  label: string;
  lat: number;
  lng: number;
  stale: boolean;
}

/**
 * Coordinate sketch shown while map tiles are unavailable. It is not a map:
 * the checkpoint list next to it is the equivalent accessible view.
 */
export function SchematicPreview({
  boundary,
  route,
  checkpoints,
  markers = [],
  className,
}: {
  boundary: PolygonGeometry | null;
  route: LineStringGeometry | null;
  checkpoints: { sequenceNumber: number; location: PointGeometry }[];
  markers?: readonly SchematicMarker[];
  className?: string;
}) {
  const outerRing = boundary?.coordinates[0] ?? [];
  const routePositions = route?.coordinates ?? [];
  const markerPositions: Position[] = markers.map(
    (marker) => [marker.lng, marker.lat] as const,
  );
  const positions: Position[] = [
    ...outerRing,
    ...routePositions,
    ...checkpoints.map((checkpoint) => checkpoint.location.coordinates),
    // Students outside the boundary stay on the sketch instead of vanishing.
    ...markerPositions,
  ];
  const bounds = geometryBounds(positions);

  if (!bounds) {
    return (
      <div
        className={cn(
          "border-border bg-background text-muted-foreground grid aspect-square w-full max-w-60 place-items-center rounded-lg border border-dashed p-4 text-center text-[13px]",
          className,
        )}
      >
        ยังไม่มีพิกัดให้แสดง
      </div>
    );
  }

  const project = createSchematicProjection(bounds, SIZE, PADDING);
  const toPath = (ring: readonly Position[]) =>
    ring
      .map((position, index) => {
        const { x, y } = project(position);
        return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const staleCount = markers.filter((marker) => marker.stale).length;
  const label = [
    boundary ? "ขอบเขตสำรวจ" : null,
    route ? "เส้นทาง" : null,
    checkpoints.length ? `จุดตรวจ ${checkpoints.length} จุด` : null,
    markers.length ? `นักเรียน ${markers.length} คน` : null,
    staleCount ? `ตำแหน่งเก่า ${staleCount} คน` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <figure className={cn("grid w-full max-w-60 gap-2", className)}>
      <svg
        aria-label={`ภาพร่างพิกัด: ${label}`}
        className="border-border aspect-square w-full rounded-lg border bg-[#F3F6F2]"
        role="img"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        {boundary ? (
          <path
            d={`${toPath(outerRing)} Z`}
            fill="rgba(31,107,71,.09)"
            stroke="#1F6B47"
            strokeDasharray="6 4"
            strokeWidth={2}
          />
        ) : null}
        {route ? (
          <path
            d={toPath(routePositions)}
            fill="none"
            stroke="#16211C"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        ) : null}
        {checkpoints.map((checkpoint) => {
          const { x, y } = project(checkpoint.location.coordinates);
          return (
            <g key={checkpoint.sequenceNumber}>
              <rect
                fill="#14472F"
                height={16}
                rx={3}
                width={16}
                x={x - 8}
                y={y - 8}
              />
              <text
                fill="#FFFFFF"
                fontSize={10}
                fontWeight={700}
                textAnchor="middle"
                x={x}
                y={y + 3.5}
              >
                {checkpoint.sequenceNumber}
              </text>
            </g>
          );
        })}
        {markers.map((marker) => {
          const { x, y } = project([marker.lng, marker.lat]);
          const labelOnLeft = x > SIZE * 0.7;
          return (
            <g
              data-marker-id={marker.id}
              data-stale={marker.stale ? "true" : "false"}
              key={marker.id}
            >
              <circle
                cx={x}
                cy={y}
                fill={marker.stale ? "#FFFFFF" : "#1E7A45"}
                r={9}
                stroke={marker.stale ? "#5E6D64" : "#FFFFFF"}
                strokeDasharray={marker.stale ? "3 2" : undefined}
                strokeWidth={2}
              />
              <circle
                cx={x}
                cy={y}
                fill="none"
                r={11.5}
                stroke={marker.stale ? "none" : "#1E7A45"}
                strokeWidth={1.5}
              />
              <text
                fill={marker.stale ? "#16211C" : "#FFFFFF"}
                fontSize={9}
                fontWeight={700}
                textAnchor="middle"
                x={x}
                y={y + 3}
              >
                {marker.number}
              </text>
              <text
                fill="#16211C"
                fontSize={9}
                fontWeight={600}
                paintOrder="stroke"
                stroke="#F3F6F2"
                strokeWidth={3}
                textAnchor={labelOnLeft ? "end" : "start"}
                x={labelOnLeft ? x - 14 : x + 14}
                y={y + 3}
              >
                {marker.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-4 rounded-sm border-2 border-dashed border-[#1F6B47]"
          />
          ขอบเขต
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-4 rounded bg-[#16211C]"
          />
          เส้นทาง
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 rounded-[2px] bg-[#14472F]"
          />
          จุดตรวจ
        </span>
        {markers.length ? (
          <>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block size-3 rounded-full border-2 border-white bg-[#1E7A45] ring-[1.5px] ring-[#1E7A45]"
              />
              นักเรียน (สด)
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block size-3 rounded-full border-2 border-dashed border-[#5E6D64] bg-white"
              />
              ตำแหน่งเก่า
            </span>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
