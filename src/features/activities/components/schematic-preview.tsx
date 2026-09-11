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
 * Coordinate sketch shown while map tiles are unavailable. It is not a map:
 * the checkpoint list next to it is the equivalent accessible view.
 */
export function SchematicPreview({
  boundary,
  route,
  checkpoints,
}: {
  boundary: PolygonGeometry | null;
  route: LineStringGeometry | null;
  checkpoints: { sequenceNumber: number; location: PointGeometry }[];
}) {
  const outerRing = boundary?.coordinates[0] ?? [];
  const routePositions = route?.coordinates ?? [];
  const positions: Position[] = [
    ...outerRing,
    ...routePositions,
    ...checkpoints.map((checkpoint) => checkpoint.location.coordinates),
  ];
  const bounds = geometryBounds(positions);

  if (!bounds) {
    return (
      <div className="border-border bg-background text-muted-foreground grid aspect-square w-full max-w-60 place-items-center rounded-lg border border-dashed p-4 text-center text-[13px]">
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

  const label = [
    boundary ? "ขอบเขตสำรวจ" : null,
    route ? "เส้นทาง" : null,
    checkpoints.length ? `จุดตรวจ ${checkpoints.length} จุด` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <figure className="grid w-full max-w-60 gap-2">
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
      </figcaption>
    </figure>
  );
}
