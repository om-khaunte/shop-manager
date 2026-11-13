"use client";

import type { ReactNode } from "react";
import { isStackLayout } from "@/lib/model/locations";
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
const ACCENT = "var(--color-accent)";
const LINE = "var(--map-diagram-line)";
const FAINT = "var(--map-diagram-faint)";

const CHAR_W = 0.58; // average glyph width as a fraction of font size
const MIN_SIZE = 7.5;

/** Splits on the space that best balances two lines; null if it can't be done. */
function splitTwo(label: string, maxChars: number): [string, string] | null {
  const words = label.split(/\s+/).filter(Boolean);
  let best: [string, string] | null = null;
  let bestWorst = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const worst = Math.max(a.length, b.length);
    if (worst <= maxChars && worst < bestWorst) {
      best = [a, b];
      bestWorst = worst;
    }
  }
  return best;
}

/**
 * Fits a label into a cell: full text at full size, then wrapped to two lines,
 * then shrunk, and only as a last resort cut with an ellipsis. It never falls
 * back to the code, so a renamed compartment always shows its own name.
 */
function fitLabel(label: string, width: number, height: number, baseSize: number, allowTwoLines: boolean): { lines: string[]; size: number } {
  for (let size = baseSize; size >= MIN_SIZE; size -= 0.5) {
    const maxChars = Math.floor(width / (size * CHAR_W));
    if (label.length <= maxChars) return { lines: [label], size };
    if (allowTwoLines && size * 2.3 <= height) {
      const two = splitTwo(label, maxChars);
      if (two) return { lines: two, size };
    }
  }
  const maxChars = Math.max(1, Math.floor(width / (MIN_SIZE * CHAR_W)));
  return { lines: [`${label.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`], size: MIN_SIZE };
}

/**
 * Front elevation of one storage unit (or of one compartment's contents).
 * Separate from the top-down footprint: it shows where compartments sit
 * within the unit, and a small preview of what each compartment holds.
 */
export function ElevationDiagram({ title, layout, compartments, highlightedId, onSelect }: Props) {
  const stack = isStackLayout(layout.type);
  const rows = Math.max(1, layout.rows);
  const cols = stack ? 1 : Math.max(1, layout.cols);
  const innerW = W - PAD * 2;
  const cellW = innerW / cols;
  const showsContents = !stack && compartments.some((c) => c.compartments);
  const cellH = stack
    ? 26
    : layout.type === "singleBin"
      ? 56
      : showsContents
        ? Math.min(66, Math.max(46, cellW * 0.8))
        : layout.type === "shelf"
          ? 34
          : layout.type === "toolRack"
            ? 46
            : Math.min(40, Math.max(24, cellW * 0.72));
  const H = rows * cellH + PAD * 2 + (stack ? 10 : 0);
  const gap = layout.type === "shelf" ? 0 : 2;

  const byCell = new Map(compartments.filter((c) => c.diagramPosition).map((c) => [`${c.diagramPosition!.row}:${c.diagramPosition!.col}`, c]));

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="group" aria-label={`${title} front elevation`}>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="var(--color-white)" stroke="var(--map-diagram-frame)" strokeWidth={1} />
        {stack && <rect x={PAD} y={H - PAD - 6} width={innerW} height={4} fill="var(--color-line)" />}
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((__, c) => {
            const loc = byCell.get(`${r}:${c}`);
            const x = PAD + c * cellW + gap / 2;
            const y = PAD + r * cellH + gap / 2;
            const w = cellW - gap;
            const h = cellH - gap;
            if (!loc) {
              return <rect key={`${r}:${c}`} x={x} y={y} width={w} height={h} fill="none" stroke="var(--map-diagram-empty)" strokeDasharray="2 2" />;
            }
            const active = loc.id === highlightedId;
            const ink = active ? ACCENT : LINE;
            const contents = !stack ? loc.compartments : null;
            const fontSize = contents ? 9 : 10;
            const plainCell = !stack && !contents && layout.type !== "toolRack" && layout.type !== "singleBin";
            const fit = fitLabel(loc.label, w - 8, h - 4, fontSize, plainCell && h >= 26);
            const lineH = fit.size * 1.15;
            return (
              <g
                key={loc.id}
                role="button"
                tabIndex={0}
                aria-label={`${loc.label} (${loc.code})${contents ? `, contains ${describeContents(contents)}` : ""}`}
                aria-pressed={active}
                onClick={() => onSelect(loc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(loc.id);
                  }
                }}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-ink [&:hover>rect:first-child]:fill-[var(--map-hover-fill)]"
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={active ? "var(--color-accent-soft)" : "var(--color-panel)"}
                  stroke={ink}
                  strokeWidth={active ? 2 : 1}
                  className="transition-[fill,stroke] duration-200"
                />
                {stack && <rect x={x + w / 2 - 14} y={y + h - 7} width={28} height={2.5} fill={ink} />}
                {layout.type === "singleBin" && <BinFront x={x + 6} y={y + 6} w={w - 12} h={h - 12} stroke={ink} />}
                {layout.type === "toolRack" && <path d={`M ${x + w / 2} ${y + 6} v 14 a 4 4 0 0 0 8 0`} fill="none" stroke={ink} strokeWidth={1.2} />}
                {contents && <ContentsPreview layout={contents} x={x + 4} y={y + 15} w={w - 8} h={h - 19} stroke={active ? ACCENT : FAINT} />}
                {fit.lines.map((line, i) => (
                  <text
                    key={i}
                    x={stack ? x + 8 : contents ? x + 4 : x + w / 2}
                    y={
                      (stack ? y + h / 2 - 2 : contents ? y + 8 : layout.type === "toolRack" || layout.type === "singleBin" ? y + h - 12 : y + h / 2) +
                      (i - (fit.lines.length - 1) / 2) * lineH
                    }
                    textAnchor={stack || contents ? "start" : "middle"}
                    dominantBaseline="central"
                    fontSize={fit.size}
                    fontWeight={active ? 600 : 500}
                    fill={active ? "var(--color-accent-ink)" : "var(--color-ink)"}
                  >
                    {line}
                  </text>
                ))}
                <title>{loc.label}</title>
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

export function describeContents(layout: CompartmentLayout): string {
  const n = layout.rows * layout.cols;
  switch (layout.type) {
    case "singleBin":
      return "one bin";
    case "boxGrid":
      return `${n} small box${n === 1 ? "" : "es"} (${layout.rows}×${layout.cols})`;
    case "drawerStack":
      return `${layout.rows} drawer${layout.rows === 1 ? "" : "s"}`;
    default:
      return `${n} bin${n === 1 ? "" : "s"} (${layout.rows}×${layout.cols})`;
  }
}

/** A bin seen from the front: body, rim, and label holder. */
function BinFront({ x, y, w, h, stroke }: { x: number; y: number; w: number; h: number; stroke: string }) {
  const lip = Math.min(4, h * 0.18);
  const tagW = Math.min(w * 0.4, 36);
  const tagH = Math.min(6, h * 0.22);
  return (
    <g fill="none" stroke={stroke} strokeWidth={1}>
      <rect x={x} y={y} width={w} height={h} />
      <line x1={x} y1={y + lip} x2={x + w} y2={y + lip} />
      {h > 14 && <rect x={x + w / 2 - tagW / 2} y={y + lip + (h - lip) * 0.35} width={tagW} height={tagH} />}
    </g>
  );
}

function ContentsPreview({ layout, x, y, w, h, stroke }: { layout: CompartmentLayout; x: number; y: number; w: number; h: number; stroke: string }) {
  if (h < 6 || w < 6) return null;
  if (layout.type === "singleBin") return <BinFront x={x} y={y} w={w} h={h} stroke={stroke} />;
  const stack = isStackLayout(layout.type);
  const rows = Math.max(1, layout.rows);
  const cols = stack ? 1 : Math.max(1, layout.cols);
  const g = layout.type === "boxGrid" ? 1 : 1.5;
  const cw = (w - g * (cols - 1)) / cols;
  const ch = (h - g * (rows - 1)) / rows;
  if (cw < 2 || ch < 2) {
    return <rect x={x} y={y} width={w} height={h} fill={stroke} fillOpacity={0.15} stroke={stroke} strokeWidth={0.75} />;
  }
  const cells: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x + c * (cw + g);
      const cy = y + r * (ch + g);
      cells.push(<rect key={`${r}:${c}`} x={cx} y={cy} width={cw} height={ch} />);
      if (stack && ch > 4) cells.push(<line key={`h${r}`} x1={cx + cw / 2 - Math.min(6, cw * 0.2)} x2={cx + cw / 2 + Math.min(6, cw * 0.2)} y1={cy + ch - 2} y2={cy + ch - 2} />);
      if (layout.type === "binGrid" && ch > 6) cells.push(<line key={`l${r}:${c}`} x1={cx} x2={cx + cw} y1={cy + Math.min(2.5, ch * 0.2)} y2={cy + Math.min(2.5, ch * 0.2)} />);
    }
  }
  return (
    <g fill="none" stroke={stroke} strokeWidth={layout.type === "boxGrid" ? 0.75 : 1}>
      {cells}
    </g>
  );
}
