"use client";

import { useEffect, useRef, useState } from "react";
import type { ObjectKind } from "@/lib/model/types";
import type { InteractionMode } from "../map/MapCanvas";
import { IconChevronDown, IconGrid, IconHand, IconMagnet, IconPlus, IconPointer } from "../icons";
import { Button, cx, Segmented } from "../ui";

interface Props {
  onAdd: (kind: ObjectKind) => void;
  snap: boolean;
  onToggleSnap: () => void;
  snapStep: number;
  onSnapStep: (n: number) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  mode: InteractionMode;
  onMode: (m: InteractionMode) => void;
}

export function EditBar(p: Props) {
  return (
    <div className="relative z-10 flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-[#f7f4ed] px-2 md:px-3">
      <span className="mr-1 hidden text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase sm:block">Add</span>
      <Button size="sm" onClick={() => p.onAdd("machine")}>
        <IconPlus width={11} height={11} /> Machine
      </Button>
      <Button size="sm" onClick={() => p.onAdd("storage")}>
        <IconPlus width={11} height={11} /> Storage
      </Button>
      <Button size="sm" onClick={() => p.onAdd("workbench")}>
        <IconPlus width={11} height={11} /> Workbench
      </Button>
      <RoomMenu onAdd={p.onAdd} />
      <Button size="sm" onClick={() => p.onAdd("label")}>
        <IconPlus width={11} height={11} /> Label
      </Button>

      <span className="mx-1.5 h-4 w-px shrink-0 bg-line" />

      <Button size="sm" active={p.snap} onClick={p.onToggleSnap} aria-pressed={p.snap} title="Snap to grid (hold Alt to bypass)">
        <IconMagnet width={12} height={12} /> Snap
      </Button>
      <select
        aria-label="Snap step"
        value={p.snapStep}
        disabled={!p.snap}
        onChange={(e) => p.onSnapStep(Number(e.target.value))}
        className="h-6 shrink-0 border border-line bg-white px-1 font-mono text-[11px] outline-none disabled:opacity-40"
      >
        {[5, 10, 20, 50].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <Button size="sm" active={p.showGrid} onClick={p.onToggleGrid} aria-pressed={p.showGrid}>
        <IconGrid width={12} height={12} /> Grid
      </Button>

      <div className="ml-2 w-[84px] shrink-0 md:hidden">
        <Segmented
          ariaLabel="Touch mode"
          value={p.mode}
          onChange={p.onMode}
          options={[
            { value: "select", label: <IconPointer width={12} height={12} />, title: "Select and move" },
            { value: "pan", label: <IconHand width={12} height={12} />, title: "Pan only" },
          ]}
        />
      </div>

      <span className="ml-auto hidden shrink-0 pl-3 text-[10px] text-ink-3 xl:block">
        Drag to move · handles resize · R rotate · Alt bypasses snap · Esc cancels
      </span>
    </div>
  );
}

function RoomMenu({ onAdd }: { onAdd: (k: ObjectKind) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const items: { kind: ObjectKind; label: string }[] = [
    { kind: "wall", label: "Wall segment" },
    { kind: "door", label: "Door" },
    { kind: "feature", label: "Room feature" },
  ];
  return (
    <div ref={ref} className="shrink-0">
      <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IconPlus width={11} height={11} /> Room <IconChevronDown width={10} height={10} />
      </Button>
      {open && (
        <div className="fixed z-40 mt-1 w-40 border border-line bg-panel py-1 shadow-[0_4px_12px_rgba(34,33,31,0.08)]">
          {items.map((i) => (
            <button
              key={i.kind}
              type="button"
              className={cx("block w-full px-3 py-1.5 text-left text-xs hover:bg-line-2")}
              onClick={() => {
                onAdd(i.kind);
                setOpen(false);
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
