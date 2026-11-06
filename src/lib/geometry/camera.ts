import type { Rect } from "./shapes";

/** screen = world * k + (tx, ty), all screen values in CSS pixels relative to the viewport element. */
export interface Camera {
  tx: number;
  ty: number;
  k: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.08;
export const MAX_ZOOM = 12;

export function clampZoom(k: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Math.min(max, Math.max(min, k));
}

export function screenToWorld(cam: Camera, p: Point): Point {
  return { x: (p.x - cam.tx) / cam.k, y: (p.y - cam.ty) / cam.k };
}

export function worldToScreen(cam: Camera, p: Point): Point {
  return { x: p.x * cam.k + cam.tx, y: p.y * cam.k + cam.ty };
}

/** Scales by `factor` while keeping the world point under `anchor` (screen space) fixed. */
export function zoomAt(cam: Camera, anchor: Point, factor: number): Camera {
  const k = clampZoom(cam.k * factor);
  const world = screenToWorld(cam, anchor);
  return { k, tx: anchor.x - world.x * k, ty: anchor.y - world.y * k };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, tx: cam.tx + dx, ty: cam.ty + dy };
}

/** Camera that fits `bounds` inside the viewport minus `padding` pixels on each side. */
export function fitBounds(
  bounds: Rect,
  viewport: Viewport,
  padding = 32,
  maxZoom = MAX_ZOOM,
): Camera {
  const vw = Math.max(1, viewport.width - padding * 2);
  const vh = Math.max(1, viewport.height - padding * 2);
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const k = clampZoom(Math.min(vw / bw, vh / bh), MIN_ZOOM, maxZoom);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { k, tx: viewport.width / 2 - cx * k, ty: viewport.height / 2 - cy * k };
}

/** Interpolates in log-zoom space around the viewport center so transitions feel even. */
export function interpolateCamera(a: Camera, b: Camera, t: number, viewport: Viewport): Camera {
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  const wa = screenToWorld(a, center);
  const wb = screenToWorld(b, center);
  const k = Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * t);
  const wx = wa.x + (wb.x - wa.x) * t;
  const wy = wa.y + (wb.y - wa.y) * t;
  return { k, tx: center.x - wx * k, ty: center.y - wy * k };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
