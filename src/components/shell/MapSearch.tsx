"use client";

import { useMemo, useRef, useState } from "react";
import { KIND_LABEL, LOCATION_KIND_LABEL, type ShopDocument } from "@/lib/model/types";
import { searchShop, type SearchResult } from "@/lib/search";
import { IconSearch } from "../icons";
import { cx, Mono } from "../ui";

interface Props {
  doc: ShopDocument | null;
  onPickObject: (id: string) => void;
  onPickLocation: (id: string) => void;
}

/** Searches map objects and storage compartments (drawers, cubbies, bins, ...). */
export function MapSearch({ doc, onPickObject, onPickLocation }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (doc ? searchShop(doc, q) : []), [doc, q]);

  const pick = (r: SearchResult) => {
    if (r.type === "object") onPickObject(r.id);
    else onPickLocation(r.id);
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full max-w-[280px] md:max-w-[340px]">
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
        <div id="map-search-results" role="listbox" className="absolute top-8 right-0 left-0 z-30 border border-line bg-panel shadow-[0_4px_12px_rgba(34,33,31,0.08)] md:right-auto md:w-[400px]">
          {results.map((r, i) => (
            <button
              key={`${r.type}:${r.id}`}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
              className={cx("flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs", i === active && "bg-line-2")}
            >
              {r.type === "object" ? (
                <>
                  <span className="min-w-0 flex-1 truncate">{r.object.name}</span>
                  <span className="text-2xs text-ink-3">{KIND_LABEL[r.object.kind]}</span>
                  <Mono className="w-10 text-right text-ink-3">{r.object.code}</Mono>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.location.label}</span>
                    <span className="block truncate text-2xs text-ink-3">{r.path.slice(0, -1).join(" / ")}</span>
                  </span>
                  <span className="text-2xs text-ink-3">{LOCATION_KIND_LABEL[r.location.kind]}</span>
                  <Mono className="max-w-24 truncate text-right text-ink-3">{r.location.code}</Mono>
                </>
              )}
            </button>
          ))}
          {results.length === 0 && <div className="px-2.5 py-2 text-xs text-ink-3">Nothing matches “{q.trim()}”.</div>}
          <div className="border-t border-line-2 px-2.5 py-1.5 text-[10px] text-ink-3">Searches map objects and storage compartments. Item search is not available yet.</div>
        </div>
      )}
    </div>
  );
}

export function focusMapSearch() {
  const el = document.querySelector<HTMLInputElement>('input[aria-label="Find on map"]');
  el?.focus();
}
