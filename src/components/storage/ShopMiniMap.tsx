import { corners, objectBounds, unionBounds } from "@/lib/geometry/shapes";
import type { Layout, MapObject } from "@/lib/model/types";

interface Props {
  layout: Layout;
  targetObjectId: string;
}

const pts = (o: MapObject) => corners(o).map((p) => `${p.x},${p.y}`).join(" ");

/** The whole shop in miniature with the destination marked, so people know where to walk. */
export function ShopMiniMap({ layout, targetObjectId }: Props) {
  const all = Object.values(layout.objects);
  const target = layout.objects[targetObjectId];
  if (!target) return null;

  const walls = all.filter((o) => o.kind === "wall");
  const shell = unionBounds((walls.length ? walls : all.filter((o) => !o.example && o.kind !== "label")).map(objectBounds));
  const b = unionBounds([...(shell ? [shell] : []), objectBounds(target)])!;
  const pad = 30;
  const vb = { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + pad * 2, h: b.maxY - b.minY + pad * 2 };
  const tb = objectBounds(target);
  const cx = (tb.minX + tb.maxX) / 2;
  const cy = (tb.minY + tb.maxY) / 2;
  const r = Math.max(vb.w, vb.h) * 0.045;

  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label={`Shop overview. ${target.name} is highlighted.`} className="block max-h-[320px] w-full">
      {all
        .filter((o) => o.id !== target.id && o.kind !== "label")
        .map((o) =>
          o.kind === "wall" ? (
            <polygon key={o.id} points={pts(o)} fill="var(--color-ink-2)" opacity={0.85} />
          ) : o.kind === "door" ? (
            <polygon key={o.id} points={pts(o)} fill="var(--color-panel)" stroke="var(--color-ink-3)" strokeWidth={vb.w * 0.004} />
          ) : (
            <polygon key={o.id} points={pts(o)} fill="var(--color-line)" stroke="var(--color-ink-3)" strokeWidth={vb.w * 0.003} opacity={0.9} />
          ),
        )}
      <circle cx={cx} cy={cy} r={r * 1.9} fill="var(--color-accent)" opacity={0.14} className="locate-pulse" />
      <polygon points={pts(target)} fill="var(--color-accent)" stroke="var(--color-accent-ink)" strokeWidth={vb.w * 0.008} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-accent)" strokeWidth={vb.w * 0.01} />
    </svg>
  );
}
