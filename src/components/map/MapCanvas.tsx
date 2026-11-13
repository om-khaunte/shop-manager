"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { panBy, screenToWorld, worldToScreen, zoomAt, type Camera, type Point } from "@/lib/geometry/camera";
import {
  corners,
  handleCursor,
  handlePosition,
  objectBounds,
  RESIZE_HANDLES,
  resizeFromHandle,
  snap,
  type HandleDir,
} from "@/lib/geometry/shapes";
import type { Layout, MapObject } from "@/lib/model/types";
import { layerOf, type LayerId } from "@/lib/model/types";
import type { CameraController } from "./useCamera";
import { FLOOR, INK, MapObjects, sortForDrawing } from "./MapObjects";
import { placeLabels } from "./labels";

export type InteractionMode = "select" | "pan";

export interface TransformHandlers {
  start: () => void;
  preview: (id: string, patch: Partial<MapObject>) => void;
  end: () => void;
  cancel: () => void;
}

interface Props {
  layout: Layout;
  cameraCtl: CameraController;
  selectedId: string | null;
  revealId: string | null;
  editing: boolean;
  mode: InteractionMode;
  hiddenLayers: LayerId[];
  showGrid: boolean;
  snapStep: number;
  onSelect: (id: string | null) => void;
  transform: TransformHandlers;
}

type Gesture =
  | { type: "pending"; id: number; start: Point; targetId: string | null }
  | { type: "pan"; id: number; last: Point }
  | { type: "pinch"; startDist: number; startMid: Point; startCam: Camera }
  | { type: "move"; id: number; objectId: string; start: Point; origin: MapObject; active: boolean }
  | { type: "resize"; id: number; objectId: string; handle: HandleDir; origin: MapObject };

const TAP_SLOP = 4;
const ACCENT = "var(--color-accent)";

export function MapCanvas({
  layout,
  cameraCtl,
  selectedId,
  revealId,
  editing,
  mode,
  hiddenLayers,
  showGrid,
  snapStep,
  onSelect,
  transform,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { camera, cameraRef, setCamera, setViewport, viewport } = cameraCtl;
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<"pan" | "move" | null>(null);

  const visible = useMemo(
    () => sortForDrawing(Object.values(layout.objects).filter((o) => !hiddenLayers.includes(layerOf(o.kind)))),
    [layout.objects, hiddenLayers],
  );

  // Viewport size -------------------------------------------------------------
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setViewport]);

  const localPoint = useCallback((e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  // Wheel zoom (non-passive so the page never scrolls) -----------------------
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      if (!cam) return;
      const p = localPoint(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dy = e.deltaY * unit;
      if (e.shiftKey && !e.ctrlKey) {
        setCamera(panBy(cam, -e.deltaY * unit, -e.deltaX * unit));
        return;
      }
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0018));
      setCamera(zoomAt(cam, p, factor));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [cameraRef, localPoint, setCamera]);

  // Escape cancels an in-progress drag/resize ---------------------------------
  const cancelGesture = useCallback(() => {
    const g = gesture.current;
    if (g && (g.type === "move" || g.type === "resize")) {
      if (g.type === "resize" || g.active) transform.cancel();
    }
    gesture.current = null;
    setDragging(null);
  }, [transform]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gesture.current;
      if (e.key === "Escape" && g && (g.type === "move" || g.type === "resize")) {
        e.stopImmediatePropagation();
        cancelGesture();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancelGesture]);

  // Pointer gestures ------------------------------------------------------------
  const objectIdFrom = (target: EventTarget | null): string | null => {
    const el = (target as Element | null)?.closest?.("[data-object-id]");
    return el?.getAttribute("data-object-id") ?? null;
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const cam = cameraRef.current;
    if (!cam || !a || !b) return;
    gesture.current = {
      type: "pinch",
      startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      startCam: cam,
    };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!cameraRef.current) return;
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released; the gesture still works without capture */
    }

    if (pointers.current.size === 2) {
      cancelGesture();
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;

    const handleAttr = (e.target as Element).getAttribute?.("data-handle");
    if (handleAttr && editing && selectedId) {
      const [hx, hy] = handleAttr.split(",").map(Number) as [HandleDir["hx"], HandleDir["hy"]];
      const origin = layout.objects[selectedId];
      if (origin && !origin.locked) {
        transform.start();
        gesture.current = { type: "resize", id: e.pointerId, objectId: selectedId, handle: { hx, hy }, origin };
        setDragging("move");
        return;
      }
    }

    const targetId = objectIdFrom(e.target);
    const panButton = e.button === 1 || (e.button === 0 && e.altKey);
    if (editing && mode === "select" && targetId && !panButton && e.button === 0) {
      const origin = layout.objects[targetId];
      if (targetId !== selectedId) onSelect(targetId);
      if (origin && !origin.locked) {
        gesture.current = {
          type: "move",
          id: e.pointerId,
          objectId: targetId,
          start: screenToWorld(cameraRef.current, p),
          origin,
          active: false,
        };
        return;
      }
    }
    gesture.current = { type: "pending", id: e.pointerId, start: p, targetId: panButton ? null : targetId };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = localPoint(e);
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === "mouse") {
        const id = objectIdFrom(e.target);
        if (id !== hoveredId) setHoveredId(id);
      }
      return;
    }
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    const cam = cameraRef.current;
    if (!g || !cam) return;

    if (g.type === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(g.startCam, g.startMid, dist / g.startDist);
      setCamera(panBy(zoomed, mid.x - g.startMid.x, mid.y - g.startMid.y));
      return;
    }
    if (g.id !== e.pointerId) return;

    if (g.type === "pending") {
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > TAP_SLOP) {
        gesture.current = { type: "pan", id: g.id, last: p };
        setDragging("pan");
        setCamera(panBy(cam, p.x - g.start.x, p.y - g.start.y));
      }
      return;
    }
    if (g.type === "pan") {
      setCamera(panBy(cam, p.x - g.last.x, p.y - g.last.y));
      g.last = p;
      return;
    }
    if (g.type === "move") {
      const w = screenToWorld(cam, p);
      const dx = w.x - g.start.x;
      const dy = w.y - g.start.y;
      if (!g.active) {
        if (Math.hypot(dx * cam.k, dy * cam.k) <= TAP_SLOP) return;
        g.active = true;
        transform.start();
        setDragging("move");
      }
      const b = objectBounds(g.origin);
      const offX = g.origin.x - b.minX;
      const offY = g.origin.y - b.minY;
      const step = e.altKey ? 0 : snapStep;
      transform.preview(g.objectId, {
        x: snap(b.minX + dx, step) + offX,
        y: snap(b.minY + dy, step) + offY,
      });
      return;
    }
    if (g.type === "resize") {
      const w = screenToWorld(cam, p);
      transform.preview(g.objectId, resizeFromHandle(g.origin, g.handle, w, e.altKey ? 0 : snapStep, 4));
    }
  };

  const endPointer = (e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.type === "pinch") {
      if (pointers.current.size < 2) {
        gesture.current = null;
        setDragging(null);
      }
      return;
    }
    if (g.id !== e.pointerId) return;
    if (g.type === "pending" && !cancelled) onSelect(g.targetId);
    if ((g.type === "move" && g.active) || g.type === "resize") {
      if (cancelled) transform.cancel();
      else transform.end();
    }
    gesture.current = null;
    setDragging(null);
  };

  // Render ----------------------------------------------------------------------
  const selected = selectedId ? layout.objects[selectedId] : undefined;
  const selectedVisible = selected && !hiddenLayers.includes(layerOf(selected.kind));
  const emphasized = useMemo(() => {
    const s = new Set<string>();
    if (selectedId) s.add(selectedId);
    if (revealId) s.add(revealId);
    if (hoveredId) s.add(hoveredId);
    if (focusedId) s.add(focusedId);
    return s;
  }, [selectedId, revealId, hoveredId, focusedId]);

  const labels = useMemo(
    () => (camera && viewport.width ? placeLabels(visible, camera, viewport, emphasized) : []),
    [camera, viewport, visible, emphasized],
  );

  const polygon = (o: MapObject, pad = 0) => {
    if (!camera) return "";
    const pts = corners({ ...o, w: o.w + (pad * 2) / camera.k, h: o.h + (pad * 2) / camera.k });
    return pts.map((pt) => worldToScreen(camera, pt)).map((pt) => `${pt.x},${pt.y}`).join(" ");
  };

  const k = camera?.k ?? 1;
  const cursor =
    dragging === "pan" ? "grabbing" : dragging === "move" ? "grabbing" : editing && mode === "select" ? "default" : "grab";

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full touch-none select-none"
      style={{ cursor, background: "var(--color-outside)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e, false)}
      onPointerCancel={(e) => endPointer(e, true)}
      onPointerLeave={() => setHoveredId(null)}
      aria-label={`Shop floor plan: ${layout.name}`}
      role="application"
    >
      <defs>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width={7 / k} height={7 / k} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={7 / k} stroke="var(--map-hatch)" strokeWidth={0.8 / k} />
        </pattern>
        <pattern id="hatch-light" patternUnits="userSpaceOnUse" width={7 / k} height={7 / k} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={7 / k} stroke="var(--map-hatch-light)" strokeWidth={0.8 / k} />
        </pattern>
      </defs>

      {camera && (
        <>
          <g transform={`matrix(${camera.k} 0 0 ${camera.k} ${camera.tx} ${camera.ty})`}>
            <rect x={0} y={0} width={layout.width} height={layout.height} fill={FLOOR} />
            {showGrid && <Grid width={layout.width} height={layout.height} k={camera.k} />}
            <MapObjects
              objects={visible}
              hoveredId={editing && selected?.locked ? null : hoveredId}
              editing={editing}
              onFocusObject={setFocusedId}
              onActivate={(id) => onSelect(id)}
            />
          </g>

          {/* Screen-space overlays: crisp at every zoom, never rotated */}
          <g pointerEvents="none">
            {labels.map((l) =>
              l.kind === "text" ? (
                <text
                  key={l.id}
                  x={l.x}
                  y={l.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="map-label"
                  fill="var(--map-label-muted)"
                  fontSize={l.size}
                  fontWeight={500}
                  letterSpacing="0.12em"
                >
                  {l.text}
                </text>
              ) : (
                <text
                  key={l.id}
                  x={l.x}
                  y={l.code ? l.y - 5 : l.y}
                  textAnchor={l.anchor}
                  dominantBaseline="central"
                  className="map-label"
                  fill={l.emphasis && l.id === selectedId ? "var(--map-strong)" : INK}
                  fontSize={l.size}
                  fontWeight={l.emphasis ? 600 : 500}
                >
                  {l.text}
                  {l.code && (
                    <tspan x={l.x} dy={13} fontFamily="var(--font-mono)" fontSize={9.5} fill="var(--map-label-code)" fontWeight={400}>
                      {l.code}
                    </tspan>
                  )}
                </text>
              ),
            )}

            {focusedId && focusedId !== selectedId && layout.objects[focusedId] && (
              <polygon points={polygon(layout.objects[focusedId], 4)} fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray="4 3" />
            )}

            {revealId && layout.objects[revealId] && (
              <polygon key={`reveal-${revealId}`} className="fade-in" points={polygon(layout.objects[revealId], 6)} fill="none" stroke={ACCENT} strokeWidth={2} />
            )}

            {selected && selectedVisible && (
              <polygon points={polygon(selected, 3)} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeDasharray={selected.locked && editing ? "4 3" : undefined} />
            )}
          </g>

          {editing && selected && selectedVisible && !selected.locked && mode === "select" && (
            <g>
              {RESIZE_HANDLES.map((d) => {
                const p = worldToScreen(camera, handlePosition(selected, d));
                return (
                  <rect
                    key={`${d.hx},${d.hy}`}
                    data-handle={`${d.hx},${d.hy}`}
                    x={p.x - 4}
                    y={p.y - 4}
                    width={8}
                    height={8}
                    fill="var(--color-floor)"
                    stroke={ACCENT}
                    strokeWidth={1.25}
                    style={{ cursor: handleCursor(d, selected.rotation) }}
                  />
                );
              })}
            </g>
          )}

          {editing && selected?.locked && selectedVisible && (
            <LockBadge at={worldToScreen(camera, handlePosition(selected, { hx: 1, hy: -1 }))} />
          )}
        </>
      )}
    </svg>
  );
}

function LockBadge({ at }: { at: Point }) {
  return (
    <g transform={`translate(${at.x + 6} ${at.y - 18})`} pointerEvents="none">
      <rect width={14} height={14} fill="var(--color-floor)" stroke={ACCENT} strokeWidth={1} />
      <rect x={4} y={6.5} width={6} height={4.5} fill={ACCENT} />
      <path d="M5 6.5 V5 a2 2 0 0 1 4 0 V6.5" fill="none" stroke={ACCENT} strokeWidth={1.1} />
    </g>
  );
}

function Grid({ width, height, k }: { width: number; height: number; k: number }) {
  const minor = k * 20 >= 9 ? 20 : k * 50 >= 9 ? 50 : 100;
  const lines: React.ReactNode[] = [];
  for (let x = 0; x <= width; x += minor) {
    const major = x % 100 === 0;
    lines.push(
      <line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} stroke={major ? "var(--map-grid-major)" : "var(--map-grid-minor)"} strokeWidth={1} vectorEffect="non-scaling-stroke" />,
    );
  }
  for (let y = 0; y <= height; y += minor) {
    const major = y % 100 === 0;
    lines.push(
      <line key={`y${y}`} x1={0} y1={y} x2={width} y2={y} stroke={major ? "var(--map-grid-major)" : "var(--map-grid-minor)"} strokeWidth={1} vectorEffect="non-scaling-stroke" />,
    );
  }
  return <g pointerEvents="none">{lines}</g>;
}
