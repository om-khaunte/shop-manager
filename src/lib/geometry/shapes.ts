import type { MapObject, Rotation } from "../model/types";
import type { Point } from "./camera";

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type Footprint = Pick<MapObject, "x" | "y" | "w" | "h" | "rotation">;

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export function normalizeRotation(deg: number): Rotation {
  const r = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
  return r as Rotation;
}

export function rotateBy(r: Rotation, steps: number): Rotation {
  return ROTATIONS[(((ROTATIONS.indexOf(r) + steps) % 4) + 4) % 4];
}

/** Rotates a local-frame vector into world orientation (SVG convention: positive = clockwise on screen). */
export function rotateVector(v: Point, rotation: number): Point {
  const a = (rotation * Math.PI) / 180;
  const c = Math.round(Math.cos(a) * 1e12) / 1e12;
  const s = Math.round(Math.sin(a) * 1e12) / 1e12;
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function corners(o: Footprint): Point[] {
  const hw = o.w / 2;
  const hh = o.h / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => {
    const r = rotateVector(p, o.rotation);
    return { x: o.x + r.x, y: o.y + r.y };
  });
}

/** Axis-aligned bounds of the rotated footprint. */
export function objectBounds(o: Footprint): Rect {
  const pts = corners(o);
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

export function unionBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  return rects.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

export function expandRect(r: Rect, by: number): Rect {
  return { minX: r.minX - by, minY: r.minY - by, maxX: r.maxX + by, maxY: r.maxY + by };
}

export function worldToLocal(o: Footprint, p: Point): Point {
  return rotateVector({ x: p.x - o.x, y: p.y - o.y }, -o.rotation);
}

export function containsPoint(o: Footprint, p: Point, tolerance = 0): boolean {
  const l = worldToLocal(o, p);
  return Math.abs(l.x) <= o.w / 2 + tolerance && Math.abs(l.y) <= o.h / 2 + tolerance;
}

export function snap(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** Handle direction in local frame: -1, 0, or 1 on each axis. */
export interface HandleDir {
  hx: -1 | 0 | 1;
  hy: -1 | 0 | 1;
}

export const RESIZE_HANDLES: HandleDir[] = [
  { hx: -1, hy: -1 },
  { hx: 0, hy: -1 },
  { hx: 1, hy: -1 },
  { hx: 1, hy: 0 },
  { hx: 1, hy: 1 },
  { hx: 0, hy: 1 },
  { hx: -1, hy: 1 },
  { hx: -1, hy: 0 },
];

export function handlePosition(o: Footprint, d: HandleDir): Point {
  const r = rotateVector({ x: (d.hx * o.w) / 2, y: (d.hy * o.h) / 2 }, o.rotation);
  return { x: o.x + r.x, y: o.y + r.y };
}

/**
 * Resizes a footprint by dragging handle `d` to world point `p`, keeping the
 * opposite edge(s) fixed. Works for any rotation. Sizes are snapped to `step`.
 */
export function resizeFromHandle(
  o: Footprint,
  d: HandleDir,
  p: Point,
  step = 0,
  minSize = 4,
): Pick<MapObject, "x" | "y" | "w" | "h"> {
  const local = worldToLocal(o, p);
  let left = -o.w / 2;
  let right = o.w / 2;
  let top = -o.h / 2;
  let bottom = o.h / 2;
  if (d.hx === 1) right = Math.max(left + minSize, left + snapSize(local.x - left, step, minSize));
  if (d.hx === -1) left = Math.min(right - minSize, right - snapSize(right - local.x, step, minSize));
  if (d.hy === 1) bottom = Math.max(top + minSize, top + snapSize(local.y - top, step, minSize));
  if (d.hy === -1) top = Math.min(bottom - minSize, bottom - snapSize(bottom - local.y, step, minSize));
  const center = rotateVector({ x: (left + right) / 2, y: (top + bottom) / 2 }, o.rotation);
  return { x: o.x + center.x, y: o.y + center.y, w: right - left, h: bottom - top };
}

function snapSize(size: number, step: number, minSize: number): number {
  const s = step > 0 ? snap(size, step) : size;
  return Math.max(minSize, s);
}

/** Cursor for a handle after rotation, so diagonal handles show the right arrow. */
export function handleCursor(d: HandleDir, rotation: Rotation): string {
  const v = rotateVector({ x: d.hx, y: d.hy }, rotation);
  const x = Math.round(v.x);
  const y = Math.round(v.y);
  if (x === 0) return "ns-resize";
  if (y === 0) return "ew-resize";
  return x === y ? "nwse-resize" : "nesw-resize";
}
