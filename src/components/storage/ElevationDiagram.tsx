"use client";

import type { CompartmentLayout, StorageLocation } from "@/lib/model/types";

interface Props {
  title: string;
  layout: CompartmentLayout;
  compartments: StorageLocation[];
  highlightedId: string | null;
  onSelect: (id: string) => void;
}

const W = 288;
const PAD = 8;
const ACCENT = "#bf3a21";

/**
 * Front elevation of one storage unit (or one drawer's bins). Separate from
 * the top-down footprint: it shows where compartments sit within the unit.
 */
export function ElevationDiagram({ title, layout, compartments, highlightedId, onSelect }: Props) {
  const isCabinet = layout.type === "cabinet";
  const rows = Math.max(1, layout.rows);
  const cols = isCabinet ? 1 : Math.max(1, layout.cols);
  const innerW = W - PAD * 2;
  const cellW = innerW / cols;
  const cellH = isCabinet ? 26 : layout.type === "shelf" ? 34 : layout.type === "toolRack" ? 46 : Math.min(40, Math.max(24, cellW * 0.72));
  const H = rows * cellH + PAD * 2 + (isCabinet ? 10 : 0);
  const gap = layout.type === "shelf" ? 0 : 2;

  const byCell = new Map(compartments.filter((c) => c.diagramPosition).map((c) => [`${c.diagramPosition!.row}:${c.diagramPosition!.col}`, c]));

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="group" aria-label={`${title} front elevation`}>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="#fff" stroke="#3a3733" strokeWidth={1} />
        {isCabinet && <rect x={PAD} y={H - PAD - 6} width={innerW} height={4} fill="#d6d0c3" />}
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((__, c) => {
            const loc = byCell.get(`${r}:${c}`);
            const x = PAD + c * cellW + gap / 2;
            const y = PAD + r * cellH + gap / 2;
            const w = cellW - gap;
            const h = cellH - gap;
            if (!loc) {
              return <rect key={`${r}:${c}`} x={x} y={y} width={w} height={h} fill="none" stroke="#e6e1d6" strokeDasharray="2 2" />;
            }
            const active = loc.id === highlightedId;
            const fontSize = 10;
            const maxChars = Math.floor((w - 6) / (fontSize * 0.58));
            const suffix = loc.code.split(".").pop() ?? loc.label;
            const text = loc.label.length <= maxChars ? loc.label : suffix.length <= maxChars ? suffix : "";
            return (
              <g
                key={loc.id}
                role="button"
                tabIndex={0}
                aria-label={`${loc.label} (${loc.code})`}
                aria-pressed={active}
                onClick={() => onSelect(loc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(loc.id);
                  }
                }}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-ink [&:hover>rect:first-child]:fill-[#f4f1ea]"
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={active ? "#f5e2dc" : "#faf8f3"}
                  stroke={active ? ACCENT : "#8d877b"}
                  strokeWidth={active ? 2 : 1}
                  className="transition-[fill,stroke] duration-200"
                />
                {isCabinet && <rect x={x + w / 2 - 14} y={y + h - 7} width={28} height={2.5} fill={active ? ACCENT : "#8d877b"} />}
                {layout.type === "toolRack" && <path d={`M ${x + w / 2} ${y + 6} v 14 a 4 4 0 0 0 8 0`} fill="none" stroke={active ? ACCENT : "#8d877b"} strokeWidth={1.2} />}
                {text && (
                  <text
                    x={isCabinet ? x + 8 : x + w / 2}
                    y={isCabinet ? y + h / 2 - 2 : layout.type === "toolRack" ? y + h - 8 : y + h / 2}
                    textAnchor={isCabinet ? "start" : "middle"}
                    dominantBaseline="central"
                    fontSize={fontSize}
                    fontWeight={active ? 600 : 500}
                    fill={active ? "#a3301a" : "#22211f"}
                  >
                    {text}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>{title}</span>
        <span>Front elevation · not to scale</span>
      </figcaption>
    </figure>
  );
}
