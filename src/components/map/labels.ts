import { worldToScreen, type Camera } from "@/lib/geometry/camera";
import { objectBounds } from "@/lib/geometry/shapes";
import type { MapObject } from "@/lib/model/types";

export interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  text: string;
  code?: string;
  size: number;
  kind: "object" | "text";
  emphasis: boolean;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const FONT = 11;
const CHAR_W = 0.58;
const textWidth = (s: string, size = FONT) => s.length * size * CHAR_W;
const overlaps = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

/**
 * Screen-space labels with level of detail: small objects lose their labels
 * first, long names fall back to short labels, and overlapping labels are
 * dropped by priority (selected, then larger footprints). Labels never rotate.
 */
export function placeLabels(
  objects: MapObject[],
  camera: Camera,
  viewport: { width: number; height: number },
  emphasized: Set<string>,
): PlacedLabel[] {
  const placed: Box[] = [];
  const out: PlacedLabel[] = [];
  const k = camera.k;

  const candidates = objects
    .filter((o) => o.kind !== "wall" && (o.labelPosition !== "hidden" || emphasized.has(o.id)))
    .map((o) => {
      const b = objectBounds(o);
      const tl = worldToScreen(camera, { x: b.minX, y: b.minY });
      const br = worldToScreen(camera, { x: b.maxX, y: b.maxY });
      return { o, box: { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y } };
    })
    .filter(({ box }) => box.maxX > -100 && box.minX < viewport.width + 100 && box.maxY > -40 && box.minY < viewport.height + 40)
    .sort((a, b) => {
      const ea = emphasized.has(a.o.id) ? 1 : 0;
      const eb = emphasized.has(b.o.id) ? 1 : 0;
      if (ea !== eb) return eb - ea;
      if ((a.o.kind === "label") !== (b.o.kind === "label")) return a.o.kind === "label" ? -1 : 1;
      return b.o.w * b.o.h - a.o.w * a.o.h;
    });

  const footprints = candidates
    .filter(({ o }) => o.kind === "machine" || o.kind === "storage" || o.kind === "workbench" || o.kind === "feature")
    .map(({ o, box }) => ({ id: o.id, box }));

  for (const { o, box } of candidates) {
    const emphasis = emphasized.has(o.id);
    const w = box.maxX - box.minX;
    const h = box.maxY - box.minY;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;

    if (o.kind === "label") {
      const size = Math.min(22, o.h * k * 0.5);
      if (size < 8 && !emphasis) continue;
      const s = Math.max(size, 9);
      const text = o.name.toUpperCase();
      const tw = textWidth(text, s) * 1.15;
      const lb = { minX: cx - tw / 2, minY: cy - s * 0.7, maxX: cx + tw / 2, maxY: cy + s * 0.7 };
      if (placed.some((p) => overlaps(p, lb))) continue;
      placed.push(lb);
      out.push({ id: o.id, x: cx, y: cy, anchor: "middle", text, size: s, kind: "text", emphasis });
      continue;
    }

    const maxDim = Math.max(w, h);
    const threshold = o.kind === "door" ? 90 : o.kind === "feature" ? 40 : 26;
    if (maxDim < threshold && !emphasis && !o.example) continue;

    const full = o.name;
    const short = o.shortLabel || o.name;
    const options = maxDim > 110 || emphasis ? [full, short] : [short];
    const showCode = (Math.min(w, h) > 54 && maxDim > 120) || (emphasis && maxDim > 60);
    const pos = o.labelPosition === "hidden" ? "center" : o.labelPosition;

    for (const text of [...new Set(options)]) {
      const tw = textWidth(text);
      const lh = showCode ? 26 : 14;
      if (pos === "center" && tw > w + 36 && !emphasis && text !== options[options.length - 1]) continue;
      let x = cx;
      let y = cy;
      let anchor: PlacedLabel["anchor"] = "middle";
      if (pos === "above") y = box.minY - lh / 2 - 4;
      if (pos === "below") y = box.maxY + lh / 2 + 4;
      if (pos === "left") {
        x = box.minX - 6;
        anchor = "end";
      }
      if (pos === "right") {
        x = box.maxX + 6;
        anchor = "start";
      }
      const left = anchor === "middle" ? x - tw / 2 : anchor === "end" ? x - tw : x;
      const lb = { minX: left - 2, minY: y - lh / 2, maxX: left + tw + 2, maxY: y + lh / 2 };
      if (!emphasis && placed.some((p) => overlaps(p, lb))) continue;
      if (!emphasis && pos !== "center" && footprints.some((f) => f.id !== o.id && overlaps(f.box, lb))) continue;
      placed.push(lb);
      out.push({ id: o.id, x, y, anchor, text, code: showCode ? o.code : undefined, size: FONT, kind: "object", emphasis });
      break;
    }
  }
  return out;
}
