"use client";

import { useEffect } from "react";
import { resolveChain } from "@/lib/model/locations";
import type { ShopDocument, StorageLocation } from "@/lib/model/types";
import { IconX } from "../icons";
import { Button, IconButton, Mono, Tag } from "../ui";
import { ElevationDiagram } from "./ElevationDiagram";
import { ShopMiniMap } from "./ShopMiniMap";

export interface LocateTarget {
  locationId: string;
  crumbs: string[];
  code: string;
  example: boolean;
  /** How many levels of the path are currently highlighted (the reveal builds up one level at a time). */
  depth: number;
}

interface Props {
  doc: ShopDocument;
  target: LocateTarget;
  onClose: () => void;
}

/**
 * Shown once the map has flown to a storage unit: the whole unit drawn large,
 * then each level of the path (cubby, drawer, bin…) lit in turn, ending on the
 * exact compartment. Everything else is dimmed so the answer is obvious at a glance.
 */
export function LocateView({ doc, target, onClose }: Props) {
  let chain: StorageLocation[] = [];
  try {
    chain = resolveChain(doc.locations, target.locationId);
  } catch {
    chain = [];
  }
  const unit = chain[0];
  const object = unit?.mapObjectId
    ? doc.layout.objects[unit.mapObjectId]
    : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (!unit) return null;

  // One diagram per level that has compartments: the unit, then each cubby/drawer on the path.
  const levels: { parent: StorageLocation; highlight: string | null }[] = [];
  for (let i = 0; i < chain.length; i++) {
    const parent = chain[i];
    if (!parent.compartments) break;
    const next = chain[i + 1];
    levels.push({
      parent,
      highlight: next && target.depth >= i + 1 ? next.id : null,
    });
  }

  const last = chain[chain.length - 1];
  const wide = levels.length > 1;

  return (
    <div
      className="fade-in absolute inset-0 z-20 flex items-center justify-center bg-outside/70 p-2 sm:p-6"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-label={`Where to find ${last.label}`}
        className="flex max-h-full w-full max-w-[940px] flex-col border border-ink bg-panel"
      >
        <header className="flex items-center gap-2 border-b border-line py-2 pr-2 pl-3">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-2 text-2xs text-ink-3">
              <span>Find</span>
              {target.example && <Tag tone="warn">Example</Tag>}
            </div>
            <nav aria-label="Location" className="truncate text-sm">
              {target.crumbs.map((c, i) => (
                <span key={i}>
                  {i > 0 && <span className="px-1.5 text-ink-3">/</span>}
                  <span
                    className={
                      i === target.crumbs.length - 1
                        ? "font-semibold text-accent-ink"
                        : "text-ink-2"
                    }
                  >
                    {c}
                  </span>
                </span>
              ))}
            </nav>
          </div>
          <Mono className="hidden shrink-0 text-ink-3 sm:inline">
            {target.code}
          </Mono>
          <IconButton label="Back to map (Esc)" onClick={onClose}>
            <IconX />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="flex flex-col gap-4 md:flex-row">
            {object && (
              <aside
                className="shrink-0 md:w-[210px]"
                aria-label="Where in the shop"
              >
                <div className="mb-1.5 text-2xs font-semibold tracking-wide text-ink-3 uppercase">
                  Walk to
                </div>
                <div className="border border-line bg-panel p-1.5">
                  <ShopMiniMap layout={doc.layout} targetObjectId={object.id} />
                </div>
                <div className="mt-1.5 text-xs text-ink-2">
                  <span className="font-medium text-ink">{object.name}</span>
                  {object.zone ? <span> · {object.zone}</span> : null}
                </div>
              </aside>
            )}
            <div className="min-w-0 flex-1">
              <div
                className={
                  wide
                    ? "grid items-start gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
                    : "mx-auto max-w-md"
                }
              >
                {levels.map(({ parent, highlight }, i) => (
                  <div
                    key={parent.id}
                    className={
                      wide && i > 0
                        ? "md:col-start-2"
                        : wide
                          ? "md:row-span-3"
                          : undefined
                    }
                  >
                    <ElevationDiagram
                      title={
                        parent.kind === "unit"
                          ? (object?.name ?? parent.label)
                          : parent.label
                      }
                      layout={parent.compartments!}
                      compartments={Object.values(doc.locations)
                        .filter((l) => l.parentId === parent.id && !l.archived)
                        .sort((a, b) => a.sortOrder - b.sortOrder)}
                      highlightedId={highlight}
                      dimOthers
                      onSelect={() => {}}
                    />
                  </div>
                ))}
                {levels.length === 0 && (
                  <p className="text-xs text-ink-2">
                    This storage unit hasn’t been set up yet, so there’s no
                    layout to show.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
          <span className="text-2xs text-ink-3">
            Esc or click outside to return to the map
          </span>
          <Button size="sm" onClick={onClose}>
            Back to map
          </Button>
        </footer>
      </section>
    </div>
  );
}
