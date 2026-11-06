import { describe, expect, it } from "vitest";
import { fitBounds, MAX_ZOOM, MIN_ZOOM, screenToWorld, worldToScreen, zoomAt, type Camera } from "./camera";
import { containsPoint, corners, normalizeRotation, objectBounds, resizeFromHandle, rotateBy } from "./shapes";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("screen/world conversion", () => {
  const cams: Camera[] = [
    { tx: 0, ty: 0, k: 1 },
    { tx: 120, ty: -40, k: 0.25 },
    { tx: -900, ty: 3000, k: 7.5 },
    { tx: 13.37, ty: 42.1, k: MIN_ZOOM },
  ];

  it("round-trips at every zoom level", () => {
    for (const cam of cams) {
      for (const p of [{ x: 0, y: 0 }, { x: 1199, y: 1799 }, { x: -50.5, y: 600.25 }]) {
        const back = screenToWorld(cam, worldToScreen(cam, p));
        close(back.x, p.x);
        close(back.y, p.y);
      }
    }
  });

  it("keeps the world point under the cursor fixed while zooming", () => {
    for (const cam of cams) {
      const anchor = { x: 333, y: 211 };
      const before = screenToWorld(cam, anchor);
      for (const f of [1.1, 0.5, 3, 1 / 7]) {
        const after = screenToWorld(zoomAt(cam, anchor, f), anchor);
        close(after.x, before.x);
        close(after.y, before.y);
      }
    }
  });

  it("clamps zoom to sensible limits", () => {
    expect(zoomAt({ tx: 0, ty: 0, k: 1 }, { x: 0, y: 0 }, 1e6).k).toBe(MAX_ZOOM);
    expect(zoomAt({ tx: 0, ty: 0, k: 1 }, { x: 0, y: 0 }, 1e-6).k).toBe(MIN_ZOOM);
  });

  it("fits bounds centered within the viewport", () => {
    const cam = fitBounds({ minX: 0, minY: 0, maxX: 1200, maxY: 1800 }, { width: 800, height: 600 }, 20);
    close(cam.k, 560 / 1800);
    const center = worldToScreen(cam, { x: 600, y: 900 });
    close(center.x, 400);
    close(center.y, 300);
  });
});

describe("rotation and selection bounds", () => {
  const o = { x: 100, y: 50, w: 80, h: 20, rotation: 0 as const };

  it("normalizes rotation to 90° steps", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(44)).toBe(0);
    expect(rotateBy(270, 1)).toBe(0);
    expect(rotateBy(0, -1)).toBe(270);
  });

  it("swaps axis-aligned bounds at 90° and 270°", () => {
    for (const rotation of [90, 270] as const) {
      const b = objectBounds({ ...o, rotation });
      close(b.minX, 90);
      close(b.maxX, 110);
      close(b.minY, 10);
      close(b.maxY, 90);
    }
    const b = objectBounds({ ...o, rotation: 180 });
    close(b.maxX - b.minX, 80);
  });

  it("hit-tests in the object's rotated frame", () => {
    const r = { ...o, rotation: 90 as const };
    expect(containsPoint(r, { x: 100, y: 85 })).toBe(true);
    expect(containsPoint(r, { x: 135, y: 50 })).toBe(false);
    expect(containsPoint(o, { x: 135, y: 50 })).toBe(true);
  });

  it("rotates corners clockwise in screen space", () => {
    const [topLeft] = corners({ x: 0, y: 0, w: 4, h: 2, rotation: 90 });
    close(topLeft.x, 1);
    close(topLeft.y, -2);
  });

  it("resizes from a handle keeping the opposite edge fixed, for any rotation", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const start = { ...o, rotation };
      const fixedBefore = corners(start)[0];
      const dragTo = corners({ ...start, w: 120, h: 40, x: start.x, y: start.y })[2];
      const next = resizeFromHandle(start, { hx: 1, hy: 1 }, { x: dragTo.x + 0, y: dragTo.y + 0 });
      const fixedAfter = corners({ ...start, ...next })[0];
      close(fixedAfter.x, fixedBefore.x);
      close(fixedAfter.y, fixedBefore.y);
      expect(next.w).toBeGreaterThan(o.w);
    }
  });

  it("never resizes below the minimum size", () => {
    const next = resizeFromHandle(o, { hx: 1, hy: 0 }, { x: -500, y: 50 }, 0, 4);
    expect(next.w).toBe(4);
  });
});
