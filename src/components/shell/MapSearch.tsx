"use client";

import { useMemo, useRef, useState } from "react";
import { KIND_LABEL, type MapObject } from "@/lib/model/types";
import { IconSearch } from "../icons";
import { cx, Mono } from "../ui";

function score(o: MapObject, q: string): number {
  const fields = [o.name, o.shortLabel ?? "", o.code, KIND_LABEL[o.kind], o.zone ?? ""].map((s) => s.toLowerCase());
  if (fields[0].startsWith(q) || fields[1].startsWith(q)) return 3;
  if (fields[2].toLowerCase() === q) return 3;
  if (fields.slice(0, 3).some((f) => f.includes(q))) return 2;
  if (fields.slice(3).some((f) => f.includes(q))) return 1;
  return 0;
}

/** Searches map objects only (name, short label, code, type, area). */
export function MapSearch({ objects, onPick }: { objects: MapObject[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return objects
      .filter((o) => o.kind !== "wall")
      .map((o) => ({ o, s: score(o, query) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.o.name.localeCompare(b.o.name))
      .slice(0, 8)
      .map((r) => r.o);
  }, [objects, q]);

  const pick = (o: MapObject) => {
    onPick(o.id);
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full max-w-[280px]">
      <label className="flex h-7 items-center gap-1.5 border border-line bg-white px-2 focus-within:border-ink">
        <IconSearch className="shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          value={q}
          placeholder="Find on map"
          aria-label="Find on map"
          role="combobox"
          aria-expanded={open && q.length > 0}
          aria-controls="map-search-results"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && results[active]) {
              pick(results[active]);
            } else if (e.key === "Escape") {
              setQ("");
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-ink-3"
        />
        <kbd className="hidden font-mono text-[10px] text-ink-3 lg:block">/</kbd>
      </label>
      {open && q.trim() && (
        <div id="map-search-results" role="listbox" className="absolute top-8 right-0 left-0 z-30 border border-line bg-panel shadow-[0_4px_12px_rgba(34,33,31,0.08)]">
          {results.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={cx("flex h-8 w-full items-center gap-2 px-2.5 text-left text-xs", i === active && "bg-line-2")}
            >
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <span className="text-2xs text-ink-3">{KIND_LABEL[o.kind]}</span>
              <Mono className="w-10 text-right text-ink-3">{o.code}</Mono>
            </button>
          ))}
          {results.length === 0 && <div className="px-2.5 py-2 text-xs text-ink-3">No map objects match “{q.trim()}”.</div>}
          <div className="border-t border-line-2 px-2.5 py-1.5 text-[10px] text-ink-3">Searches map objects. Item search is not available yet.</div>
        </div>
      )}
    </div>
  );
}

export function focusMapSearch() {
  const el = document.querySelector<HTMLInputElement>('input[aria-label="Find on map"]');
  el?.focus();
}
