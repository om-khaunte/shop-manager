"use client";

import { useMemo, useState } from "react";
import {
  addDrawer,
  breadcrumb,
  childrenOf,
  configureCompartments,
  ensureUnit,
  moveDrawer,
  removeDrawer,
  renameLocation,
  resolveChain,
  unitForObject,
} from "@/lib/model/locations";
import {
  LOCATION_KIND_LABEL,
  STORAGE_TYPE_LABEL,
  type CompartmentLayout,
  type MapObject,
  type ShopDocument,
  type StorageLocation,
  type StorageType,
} from "@/lib/model/types";
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from "../icons";
import { Button, CommitInput, FieldLabel, IconButton, Mono, SectionTitle, Select, Tag } from "../ui";
import { ElevationDiagram } from "./ElevationDiagram";

interface Props {
  object: MapObject;
  doc: ShopDocument;
  editing: boolean;
  selectedLocationId: string | null;
  /** While a reveal is running, how many levels below the unit are highlighted. */
  revealDepth: number | null;
  onSelectLocation: (id: string | null) => void;
  apply: (doc: ShopDocument) => void;
}

const TYPE_OPTIONS = (Object.keys(STORAGE_TYPE_LABEL) as StorageType[]).map((t) => ({ value: t, label: STORAGE_TYPE_LABEL[t] }));

export function StorageSection({ object, doc, editing, selectedLocationId, revealDepth, onSelectLocation, apply }: Props) {
  const unit = unitForObject(doc.locations, object.id);
  const [notice, setNotice] = useState<string | null>(null);

  const chain = useMemo(() => {
    if (!selectedLocationId || !unit) return [];
    try {
      const c = resolveChain(doc.locations, selectedLocationId);
      return c[0]?.id === unit.id ? c : [];
    } catch {
      return [];
    }
  }, [doc.locations, selectedLocationId, unit]);

  const configured = unit && !unit.archived && unit.compartments;

  const applyConfig = (target: StorageLocation, layout: CompartmentLayout) => {
    const result = configureCompartments(doc.locations, target.id, layout);
    apply({ ...doc, locations: result.locations });
    const parts: string[] = [];
    if (result.archived.length) parts.push(`${result.archived.length} compartment${result.archived.length > 1 ? "s" : ""} outside the new grid archived (IDs kept; they return if the grid grows)`);
    if (result.restored.length) parts.push(`${result.restored.length} archived compartment${result.restored.length > 1 ? "s" : ""} restored`);
    setNotice(parts.length ? `${parts.join(". ")}.` : null);
  };

  if (!configured) {
    return (
      <section>
        <SectionTitle>Storage layout</SectionTitle>
        <p className="border border-dashed border-line bg-panel px-3 py-2.5 text-xs text-ink-2">Storage layout not configured</p>
        {editing && (
          <SetupForm
            onConfigure={(type, rows, cols) => {
              const ensured = ensureUnit(doc, object);
              const result = configureCompartments(ensured.doc.locations, ensured.unit.id, { type, rows, cols });
              apply({ ...ensured.doc, locations: result.locations });
              setNotice(result.restored.length ? `${result.restored.length} previously archived compartments restored.` : null);
            }}
          />
        )}
      </section>
    );
  }

  // Diagrams: the unit, then each selected compartment that has its own compartments.
  const levels: { parent: StorageLocation; highlight: string | null }[] = [];
  const depthLimit = revealDepth ?? Infinity;
  levels.push({ parent: unit, highlight: depthLimit >= 1 ? (chain[1]?.id ?? null) : null });
  for (let i = 1; i < chain.length; i++) {
    if (!chain[i].compartments || i + 1 > depthLimit) break;
    levels.push({ parent: chain[i], highlight: depthLimit >= i + 1 ? (chain[i + 1]?.id ?? null) : null });
  }

  const selected = chain.length > 1 && depthLimit >= chain.length - 1 ? chain[chain.length - 1] : null;
  const archivedCount = childrenOf(doc.locations, unit.id, true).filter((c) => c.archived).length;

  return (
    <section className="space-y-2">
      <SectionTitle aside={<span className="text-2xs text-ink-3">{STORAGE_TYPE_LABEL[unit.compartments!.type as StorageType] ?? "Bins"}</span>}>
        Storage layout
      </SectionTitle>

      {levels.map(({ parent, highlight }) => (
        <ElevationDiagram
          key={parent.id}
          title={parent.kind === "unit" ? object.name : parent.label}
          layout={parent.compartments!}
          compartments={childrenOf(doc.locations, parent.id)}
          highlightedId={highlight}
          onSelect={(id) => onSelectLocation(id === selectedLocationId ? parent.kind === "unit" ? null : parent.id : id)}
        />
      ))}

      {selected && <CompartmentDetail doc={doc} location={selected} editing={editing} apply={apply} onSelect={onSelectLocation} onConfigure={applyConfig} />}

      {!selected && !editing && <p className="text-2xs text-ink-3">Select a compartment to see its location code.</p>}

      {editing && <UnitConfig doc={doc} unit={unit} onConfigure={applyConfig} apply={apply} onSelect={onSelectLocation} />}

      {notice && <p className="border border-[#e3cf9f] bg-warn-soft px-2 py-1.5 text-2xs text-[#5f4200]">{notice}</p>}
      {editing && archivedCount > 0 && !notice && (
        <p className="text-2xs text-ink-3">
          {archivedCount} archived compartment{archivedCount > 1 ? "s" : ""} kept for existing references.
        </p>
      )}
    </section>
  );
}

function SetupForm({ onConfigure }: { onConfigure: (type: StorageType, rows: number, cols: number) => void }) {
  const [type, setType] = useState<StorageType>("cabinet");
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(3);
  return (
    <div className="mt-2 space-y-2 border border-line bg-white p-2.5">
      <div>
        <FieldLabel htmlFor="storage-type">Storage type</FieldLabel>
        <Select id="storage-type" value={type} options={TYPE_OPTIONS} onChange={setType} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stepper label={type === "cabinet" ? "Drawers" : "Rows"} value={rows} onChange={setRows} />
        {type !== "cabinet" && <Stepper label="Columns" value={cols} onChange={setCols} />}
      </div>
      <p className="text-2xs leading-snug text-ink-3">Enter the real count from the unit itself. Counts are not inferred from photos.</p>
      <Button variant="primary" className="w-full" onClick={() => onConfigure(type, rows, type === "cabinet" ? 1 : cols)}>
        Configure storage
      </Button>
    </div>
  );
}

function UnitConfig({
  doc,
  unit,
  onConfigure,
  apply,
  onSelect,
}: {
  doc: ShopDocument;
  unit: StorageLocation;
  onConfigure: (target: StorageLocation, layout: CompartmentLayout) => void;
  apply: (doc: ShopDocument) => void;
  onSelect: (id: string | null) => void;
}) {
  const layout = unit.compartments!;
  const type = layout.type as StorageType;
  const drawers = childrenOf(doc.locations, unit.id);
  return (
    <div className="space-y-2 border border-line bg-white p-2.5">
      <div>
        <FieldLabel htmlFor="unit-type">Storage type</FieldLabel>
        <Select id="unit-type" value={type} options={TYPE_OPTIONS} onChange={(t) => onConfigure(unit, { type: t, rows: layout.rows, cols: t === "cabinet" ? 1 : Math.max(layout.cols, 1) })} />
      </div>
      {type === "cabinet" ? (
        <div>
          <FieldLabel>Drawers (top to bottom)</FieldLabel>
          <ul className="divide-y divide-line-2 border border-line-2">
            {drawers.map((d, i) => (
              <li key={d.id} className="flex items-center gap-1 py-0.5 pr-0.5 pl-1">
                <div className="min-w-0 flex-1">
                  <CommitInput value={d.label} ariaLabel={`Drawer ${i + 1} label`} onCommit={(v) => v.trim() && apply({ ...doc, locations: renameLocation(doc.locations, d.id, v.trim()) })} />
                </div>
                <IconButton label="Move up" disabled={i === 0} onClick={() => apply({ ...doc, locations: moveDrawer(doc.locations, unit.id, d.id, -1) })}>
                  <IconChevronUp />
                </IconButton>
                <IconButton label="Move down" disabled={i === drawers.length - 1} onClick={() => apply({ ...doc, locations: moveDrawer(doc.locations, unit.id, d.id, 1) })}>
                  <IconChevronDown />
                </IconButton>
                <IconButton
                  label="Archive drawer"
                  onClick={() => {
                    if (!confirm(`Archive ${d.label}? Its ID is kept so existing references still resolve.`)) return;
                    apply({ ...doc, locations: removeDrawer(doc.locations, unit.id, d.id) });
                    onSelect(null);
                  }}
                >
                  <IconTrash />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button size="sm" className="mt-1.5" onClick={() => apply({ ...doc, locations: addDrawer(doc.locations, unit.id) })}>
            <IconPlus width={12} height={12} /> Add drawer
          </Button>
        </div>
      ) : (
        <GridForm layout={layout} onApply={(rows, cols) => onConfigure(unit, { type, rows, cols })} />
      )}
    </div>
  );
}

function GridForm({ layout, onApply, label = "Apply grid" }: { layout: CompartmentLayout; onApply: (rows: number, cols: number) => void; label?: string }) {
  const [rows, setRows] = useState(layout.rows);
  const [cols, setCols] = useState(layout.cols);
  const changed = rows !== layout.rows || cols !== layout.cols;
  return (
    <div className="flex items-end gap-2">
      <Stepper label="Rows" value={rows} onChange={setRows} />
      <Stepper label="Columns" value={cols} onChange={setCols} />
      <Button size="md" variant={changed ? "primary" : "default"} disabled={!changed} onClick={() => onApply(rows, cols)}>
        {label}
      </Button>
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="min-w-0 flex-1">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex h-7 border border-line bg-white">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} className="w-7 text-ink-2 hover:bg-line-2" onClick={() => onChange(Math.max(1, value - 1))}>
          −
        </button>
        <span className="flex flex-1 items-center justify-center border-x border-line font-mono text-[11px]">{value}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} className="w-7 text-ink-2 hover:bg-line-2" onClick={() => onChange(Math.min(40, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

function CompartmentDetail({
  doc,
  location,
  editing,
  apply,
  onSelect,
  onConfigure,
}: {
  doc: ShopDocument;
  location: StorageLocation;
  editing: boolean;
  apply: (doc: ShopDocument) => void;
  onSelect: (id: string | null) => void;
  onConfigure: (target: StorageLocation, layout: CompartmentLayout) => void;
}) {
  const crumbs = breadcrumb(doc, location.id);
  return (
    <div className="space-y-2 border border-accent/40 bg-white p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xs text-ink-3">{LOCATION_KIND_LABEL[location.kind]}</div>
          <div className="text-sm font-semibold">{location.label}</div>
        </div>
        {location.example && <Tag tone="warn">Example</Tag>}
      </div>
      <p className="text-2xs leading-snug text-ink-2">{crumbs.join(" / ")}</p>
      <dl className="grid grid-cols-[52px_1fr] gap-x-2 gap-y-0.5 text-2xs">
        <dt className="text-ink-3">Code</dt>
        <dd><Mono>{location.code}</Mono></dd>
        <dt className="text-ink-3">ID</dt>
        <dd className="truncate"><Mono className="text-ink-2">{location.id}</Mono></dd>
      </dl>
      {editing && (
        <div className="space-y-2 border-t border-line-2 pt-2">
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <div>
              <FieldLabel>Label</FieldLabel>
              <CommitInput value={location.label} onCommit={(v) => v.trim() && apply({ ...doc, locations: renameLocation(doc.locations, location.id, v.trim()) })} />
            </div>
            <div>
              <FieldLabel>Code</FieldLabel>
              <CommitInput mono value={location.code} onCommit={(v) => v.trim() && apply({ ...doc, locations: renameLocation(doc.locations, location.id, location.label, v.trim()) })} />
            </div>
          </div>
          {location.kind !== "bin" && location.kind !== "slot" && (
            <div>
              <FieldLabel>Bins inside this {LOCATION_KIND_LABEL[location.kind].toLowerCase()}</FieldLabel>
              {location.compartments ? (
                <GridForm layout={location.compartments} onApply={(rows, cols) => onConfigure(location, { type: "binGrid", rows, cols })} />
              ) : (
                <Button size="sm" onClick={() => onConfigure(location, { type: "binGrid", rows: 1, cols: 4 })}>
                  <IconPlus width={12} height={12} /> Add bin grid
                </Button>
              )}
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>
            Clear compartment selection
          </Button>
        </div>
      )}
    </div>
  );
}
