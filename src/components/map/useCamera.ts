"use client";

import { useCallback, useRef, useState } from "react";
import { easeInOutCubic, interpolateCamera, type Camera, type Viewport } from "@/lib/geometry/camera";

export interface CameraController {
  camera: Camera | null;
  cameraRef: React.RefObject<Camera | null>;
  viewportRef: React.RefObject<Viewport>;
  /** Immediate change; cancels any running transition. */
  setCamera: (c: Camera) => void;
  /** Short eased transition; resolves when done. Immediate under reduced motion. */
  animateTo: (c: Camera, durationMs?: number) => Promise<void>;
  setViewport: (v: Viewport) => void;
  viewport: Viewport;
}

export function useCamera(reducedMotion: boolean): CameraController {
  const [camera, setCameraState] = useState<Camera | null>(null);
  const [viewport, setViewportState] = useState<Viewport>({ width: 0, height: 0 });
  const cameraRef = useRef<Camera | null>(null);
  const viewportRef = useRef<Viewport>({ width: 0, height: 0 });
  const frame = useRef<number | null>(null);
  const settle = useRef<(() => void) | null>(null);

  const apply = useCallback((c: Camera) => {
    cameraRef.current = c;
    setCameraState(c);
  }, []);

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    settle.current?.();
    settle.current = null;
  }, []);

  const setCamera = useCallback(
    (c: Camera) => {
      stop();
      apply(c);
    },
    [apply, stop],
  );

  const animateTo = useCallback(
    (target: Camera, durationMs = 420) => {
      stop();
      const from = cameraRef.current;
      if (!from || reducedMotion || durationMs <= 0) {
        apply(target);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        settle.current = resolve;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          apply(interpolateCamera(from, target, easeInOutCubic(t), viewportRef.current));
          if (t < 1) {
            frame.current = requestAnimationFrame(tick);
          } else {
            frame.current = null;
            settle.current = null;
            resolve();
          }
        };
        frame.current = requestAnimationFrame(tick);
      });
    },
    [apply, reducedMotion, stop],
  );

  const setViewport = useCallback((v: Viewport) => {
    viewportRef.current = v;
    setViewportState(v);
  }, []);

  return { camera, cameraRef, viewportRef, setCamera, animateTo, setViewport, viewport };
}
