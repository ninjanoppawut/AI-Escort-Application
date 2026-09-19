"use client";

import type { KeyboardEvent } from "react";

import {
  createSchematicProjection,
  geometryBounds,
  type PolygonGeometry,
  type Position,
} from "@/features/activities/geojson";
import {
  OBSERVATION_STATUS_TOKENS,
  ObservationStatusShapeMarker,
  type ObservationStatusShape,
} from "@/features/observations/components/observation-status-badge";
import { observationStatusSchema } from "@/features/observations/contracts";
import { cn } from "@/lib/utils";

import type { CompletedMapItem } from "../contracts";

const SIZE = 320;
const PADDING = 24;
/** Marker head radius in sketch units (about 26–30 CSS px at full width). */
const RADIUS = 11;

/** The status shape in 10×10 units, as ObservationStatusShapeMarker draws it. */
function ShapeGlyph({ shape }: { shape: ObservationStatusShape }) {
  switch (shape) {
    case "diamond":
      return <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" />;
    case "hexagon":
      return <polygon points="2.5,0.7 7.5,0.7 9.8,5 7.5,9.3 2.5,9.3 0.2,5" />;
    case "triangle":
      return <polygon points="5,0.6 9.6,9.3 0.4,9.3" />;
    case "square":
      return <rect height="8" width="8" x="1" y="1" />;
    case "octagon":
      return (
        <polygon points="3,0.5 7,0.5 9.5,3 9.5,7 7,9.5 3,9.5 0.5,7 0.5,3" />
      );
    case "checked-circle":
      return (
        <>
          <circle cx="5" cy="5" r="4.5" />
          <path
            d="M2.9 5.1 4.4 6.6 7.2 3.6"
            fill="none"
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="1.3"
          />
        </>
      );
    default:
      return <circle cx="5" cy="5" r="4.5" />;
  }
}

function tokenOf(status: string) {
  const parsed = observationStatusSchema.safeParse(status);
  return parsed.success ? OBSERVATION_STATUS_TOKENS[parsed.data] : null;
}

/**
 * Completed-map sketch: the activity boundary and one marker per record at
 * its capture location, drawn with the status shape (never color alone).
 * Markers are focusable buttons; records filtered out stay dimmed so the map
 * keeps its context. Without map tiles this sketch plus the list is the map.
 */
export function CompletedMapSketch({
  boundary,
  items,
  visibleIds,
  selectedId,
  onSelect,
}: {
  boundary: PolygonGeometry | null;
  items: readonly CompletedMapItem[];
  visibleIds: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (observationId: string) => void;
}) {
  const ring = boundary?.coordinates[0] ?? [];
  const positions: Position[] = [
    ...ring,
    ...items.map((item) => [item.lng!, item.lat!] as const),
  ];
  const bounds = geometryBounds(positions);
  const legend = [
    ...new Map(
      items.flatMap((item) => {
        const token = tokenOf(item.status);
        return token ? [[item.status, token] as const] : [];
      }),
    ).entries(),
  ];

  if (!bounds) {
    return (
      <div className="border-border text-muted-foreground grid aspect-square w-full place-items-center rounded-xl border border-dashed p-4 text-center text-sm">
        ยังไม่มีพิกัดให้แสดง · ดูรายการแทน
      </div>
    );
  }

  const project = createSchematicProjection(bounds, SIZE, PADDING);
  const boundaryPath = ring
    .map((position, index) => {
      const { x, y } = project(position);
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  function keySelect(event: KeyboardEvent, observationId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(observationId);
    }
  }

  return (
    <figure className="grid gap-2">
      <svg
        aria-label={`แผนที่ผลลัพธ์ ${items.length} หมุด`}
        className="border-border w-full rounded-xl border bg-[#F4F8F2]"
        data-completed-map=""
        role="group"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        {boundaryPath ? (
          <path
            d={`${boundaryPath} Z`}
            fill="#E6F2EA"
            stroke="#1F5C3A"
            strokeDasharray="4 3"
            strokeWidth="1.5"
          />
        ) : null}
        {items.map((item) => {
          const token = tokenOf(item.status);
          const { x, y } = project([item.lng!, item.lat!]);
          const selected = item.observationId === selectedId;
          const dimmed = !visibleIds.has(item.observationId);
          const label = `${item.commonName} · ${token?.label ?? item.status}${
            item.isMine ? " · ของฉัน" : ""
          } · บันทึกโดย ${item.recorderName ?? "นักเรียน"}`;
          return (
            <g
              aria-label={label}
              aria-pressed={selected}
              className={cn(
                "cursor-pointer outline-none focus-visible:[&>circle:first-child]:stroke-[#1F5C3A]",
                token?.markerClassName ?? "fill-[#475569]",
                dimmed && "opacity-30",
              )}
              data-map-marker={item.observationId}
              data-marker-shape={token?.shape ?? "circle"}
              data-marker-status={item.status}
              key={item.observationId}
              onClick={() => onSelect(item.observationId)}
              onKeyDown={(event) => keySelect(event, item.observationId)}
              role="button"
              tabIndex={dimmed ? -1 : 0}
            >
              {/* 44 px-class touch target around the marker head. */}
              <circle
                cx={x}
                cy={y}
                fill="transparent"
                r={RADIUS + 5}
                stroke={selected ? "#16432A" : "transparent"}
                strokeWidth="2"
              />
              <g
                stroke={item.isMine ? "#16211C" : "#fff"}
                strokeWidth={item.isMine ? 1.2 : 0.6}
                transform={`translate(${x - RADIUS} ${y - RADIUS}) scale(${(RADIUS * 2) / 10})`}
              >
                <ShapeGlyph shape={token?.shape ?? "circle"} />
              </g>
            </g>
          );
        })}
      </svg>
      <figcaption className="grid gap-1.5">
        <ul
          aria-label="สัญลักษณ์สถานะ"
          className="flex flex-wrap gap-x-3 gap-y-1"
        >
          {legend.map(([status, token]) => (
            <li className="flex items-center gap-1.5 text-[13px]" key={status}>
              <ObservationStatusShapeMarker
                className={cn("size-3.5", token.markerClassName)}
                shape={token.shape}
              />
              {token.label}
            </li>
          ))}
          {items.some((item) => item.isMine) ? (
            <li className="flex items-center gap-1.5 text-[13px]">
              <span className="inline-block size-3.5 rounded-full border-2 border-[#16211C]" />
              ของฉัน
            </li>
          ) : null}
        </ul>
        <p className="text-muted-foreground text-[12px]">
          แผนภาพพิกัด ไม่ใช่แผนที่ฐาน · สลับเป็น “รายการ”
          เพื่อดูทุกรายการเป็นข้อความ
        </p>
      </figcaption>
    </figure>
  );
}
