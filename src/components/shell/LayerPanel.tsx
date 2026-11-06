"use client";

import { useState } from "react";
import { LAYERS, layerOf, type LayerId, type MapObject } from "@/lib/model/types";
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconEye, IconEyeOff, IconGrid, IconLock } from "../icons";
import { Button, cx, IconButton, Mono, SectionTitle } from "../ui";

interface Props {
  objects: MapObject[];
  hiddenLayers: LayerId[];
  onToggleLayer: (id: LayerId) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  selectedId: string | null;
  onPick: (id: string) => void;
  onCollapse?: () => void;
  onRevealExample: (() => void) | null;
  editing: boolean;
}

export function LayerPanel({
  objects,
  hiddenLayers,
  onToggleLayer,
  showGrid,
  onToggleGrid,
  selectedId,
  onPick,
  onCollapse,
  onRevealExample,
  editing,
}: Props) {
  const [open, setOpen] = useState<LayerId | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-line pr-1 pl-3">
        <span className="text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">Layers</span>
        {onCollapse && (
          <IconButton label="Collapse layer panel" onClick={onCollapse}>
            <IconChevronLeft />
          </IconButton>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {LAYERS.map((layer) => {
          const items = objects.filter((o) => layerOf(o.kind) === layer.id).sort((a, b) => a.name.localeCompare(b.name));
          const hidden = hiddenLayers.includes(layer.id);
          const expanded = open === layer.id;
          return (
            <div key={layer.id}>
              <div className="group flex h-7 items-center pr-1 pl-1">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : layer.id)}
                  className="flex h-full min-w-0 flex-1 items-center gap-1 px-1 text-left text-xs hover:bg-line-2"
                >
                  {expanded ? <IconChevronDown width={11} height={11} className="text-ink-3" /> : <IconChevronRight width={11} height={11} className="text-ink-3" />}
                  <span className={cx("flex-1 truncate font-medium", hidden && "text-ink-3")}>{layer.label}</span>
                  <Mono className="text-ink-3">{items.length}</Mono>
                </button>
                <IconButton label={hidden ? `Show ${layer.label}` : `Hide ${layer.label}`} onClick={() => onToggleLayer(layer.id)} className="h-6 w-6">
                  {hidden ? <IconEyeOff width={13} height={13} /> : <IconEye width={13} height={13} />}
                </IconButton>
              </div>
              {expanded && (
                <ul className="pb-1">
                  {items.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        disabled={hidden}
                        onClick={() => onPick(o.id)}
                        className={cx(
                          "flex h-6 w-full items-center gap-2 pr-2 pl-7 text-left text-xs disabled:opacity-40",
                          o.id === selectedId ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-line-2 hover:text-ink",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{o.name}</span>
                        {editing && o.locked && <IconLock width={11} height={11} className="text-ink-3" />}
                        <Mono className="text-ink-3">{o.code}</Mono>
                      </button>
                    </li>
                  ))}
                  {items.length === 0 && <li className="pl-7 text-2xs text-ink-3">Empty</li>}
                </ul>
              )}
            </div>
          );
        })}

        <div className="mt-1 flex h-7 items-center border-t border-line-2 pr-1 pl-2">
          <IconGrid width={12} height={12} className="text-ink-3" />
          <span className="ml-1.5 flex-1 text-xs font-medium">Grid</span>
          <IconButton label={showGrid ? "Hide grid" : "Show grid"} onClick={onToggleGrid} className="h-6 w-6">
            {showGrid ? <IconEye width={13} height={13} /> : <IconEyeOff width={13} height={13} />}
          </IconButton>
        </div>
      </div>

      {onRevealExample && (
        <div className="shrink-0 border-t border-line px-3 py-2.5">
          <SectionTitle>Find & return preview</SectionTitle>
          <p className="mb-2 text-2xs leading-snug text-ink-3">Runs revealLocation on a sample bin in the example cabinet. Not a real item.</p>
          <Button size="sm" className="w-full" onClick={onRevealExample}>
            Reveal example bin
          </Button>
        </div>
      )}
    </div>
  );
}
