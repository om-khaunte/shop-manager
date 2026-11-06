"use client";

import { memo } from "react";
import type { MapObject } from "@/lib/model/types";
import { KIND_LABEL } from "@/lib/model/types";

export const INK = "#22211f";
export const FLOOR = "#fcfbf7";

const DRAW_ORDER: Record<MapObject["kind"], number> = {
  feature: 0,
  workbench: 1,
  storage: 2,
  machine: 3,
  wall: 4,
  door: 5,
  label: 6,
};

export function sortForDrawing(objects: MapObject[]): MapObject[] {
  return [...objects].sort((a, b) => DRAW_ORDER[a.kind] - DRAW_ORDER[b.kind]);
}

const ns = { vectorEffect: "non-scaling-stroke" } as const;

function Footprint({ o, hovered }: { o: MapObject; hovered: boolean }) {
  const x = -o.w / 2;
  const y = -o.h / 2;
  const dashed = o.grouped || o.example ? "5 3" : undefined;

  switch (o.kind) {
    case "machine":
      return (
        <>
          <rect x={x} y={y} width={o.w} height={o.h} fill="#dcd7cc" stroke={hovered ? INK : "#6f6a61"} strokeWidth={1.25} strokeDasharray={dashed} style={ns} />
          {o.grouped && <rect x={x} y={y} width={o.w} height={o.h} fill="url(#hatch)" />}
        </>
      );
    case "storage":
      return (
        <>
          <rect x={x} y={y} width={o.w} height={o.h} fill={o.example ? FLOOR : "#f4efe3"} stroke={hovered ? INK : "#3a3733"} strokeWidth={1.25} strokeDasharray={dashed} style={ns} />
          {o.grouped && <rect x={x} y={y} width={o.w} height={o.h} fill="url(#hatch-light)" />}
          {/* Front / access face */}
          <line x1={x} y1={-y} x2={-x} y2={-y} stroke={INK} strokeWidth={3} style={ns} />
        </>
      );
    case "workbench":
      return (
        <>
          <rect x={x} y={y} width={o.w} height={o.h} fill="#efe9dc" stroke={hovered ? INK : "#958f83"} strokeWidth={1} strokeDasharray={dashed} style={ns} />
          {o.grouped && <rect x={x} y={y} width={o.w} height={o.h} fill="url(#hatch-light)" />}
        </>
      );
    case "feature":
      return <rect x={x} y={y} width={o.w} height={o.h} fill="#e9e6de" stroke={hovered ? INK : "#8d877b"} strokeWidth={1} strokeDasharray="3 2" style={ns} />;
    case "wall":
      if (o.wall?.style === "glass") {
        return (
          <>
            <rect x={x} y={y} width={o.w} height={o.h} fill="#eef0ee" stroke={INK} strokeWidth={1.25} style={ns} />
            <line
              x1={o.w >= o.h ? x : 0}
              y1={o.w >= o.h ? 0 : y}
              x2={o.w >= o.h ? -x : 0}
              y2={o.w >= o.h ? 0 : -y}
              stroke={INK}
              strokeWidth={0.75}
              style={ns}
            />
          </>
        );
      }
      return <rect x={x} y={y} width={o.w} height={o.h} fill={hovered ? "#000" : INK} />;
    case "door":
      return <Door o={o} hovered={hovered} />;
    case "label":
      return <rect x={x} y={y} width={o.w} height={o.h} fill="transparent" />;
  }
}

function Door({ o, hovered }: { o: MapObject; hovered: boolean }) {
  const hw = o.w / 2;
  const hh = o.h / 2;
  const style = o.door?.style ?? "opening";
  const stroke = hovered ? "#000" : INK;
  const leaf = (hingeX: number, length: number, dir: 1 | -1) => (
    <>
      <line x1={hingeX} y1={hh} x2={hingeX} y2={hh + length} stroke={stroke} strokeWidth={1.5} style={ns} />
      <path
        d={`M ${hingeX} ${hh + length} A ${length} ${length} 0 0 ${dir === 1 ? 0 : 1} ${hingeX + dir * length} ${hh}`}
        fill="none"
        stroke={stroke}
        strokeWidth={0.75}
        strokeDasharray="3 2"
        style={ns}
      />
    </>
  );
  return (
    <>
      {/* Opening cut into the wall */}
      <rect x={-hw} y={-hh - 1} width={o.w} height={o.h + 2} fill={FLOOR} />
      <line x1={-hw} y1={-hh} x2={-hw} y2={hh} stroke={INK} strokeWidth={1.5} style={ns} />
      <line x1={hw} y1={-hh} x2={hw} y2={hh} stroke={INK} strokeWidth={1.5} style={ns} />
      {style === "swing-left" && leaf(-hw, o.w, 1)}
      {style === "swing-right" && leaf(hw, o.w, -1)}
      {style === "double" && (
        <>
          {leaf(-hw, o.w / 2, 1)}
          {leaf(hw, o.w / 2, -1)}
        </>
      )}
      {style === "rollup" && (
        <>
          <line x1={-hw} y1={0} x2={hw} y2={0} stroke={stroke} strokeWidth={1} strokeDasharray="6 3" style={ns} />
          <line x1={-hw} y1={hh} x2={hw} y2={hh} stroke={stroke} strokeWidth={0.75} style={ns} />
        </>
      )}
    </>
  );
}

interface Props {
  objects: MapObject[];
  hoveredId: string | null;
  editing: boolean;
  onFocusObject: (id: string | null) => void;
  onActivate: (id: string) => void;
}

/** World-space footprints. Independent of the camera so pans and zooms don't re-render it. */
export const MapObjects = memo(function MapObjects({ objects, hoveredId, editing, onFocusObject, onActivate }: Props) {
  return (
    <>
      {objects.map((o) => (
        <g
          key={o.id}
          data-object-id={o.id}
          transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`}
          tabIndex={0}
          role="button"
          aria-label={`${o.name}, ${KIND_LABEL[o.kind]}, ${o.code}${o.locked && editing ? ", locked" : ""}`}
          onFocus={() => onFocusObject(o.id)}
          onBlur={() => onFocusObject(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onActivate(o.id);
            }
          }}
        >
          <Footprint o={o} hovered={hoveredId === o.id} />
        </g>
      ))}
    </>
  );
});
