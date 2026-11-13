"use client";

import { useMemo, useState } from "react";
import {
  addDrawer,
  applyContentsToSiblings,
  breadcrumb,
  canHoldContents,
  childrenOf,
  clearCompartments,
  configureCompartments,
  ensureUnit,
  moveDrawer,
  removeDrawer,
  renameLocation,
  resolveChain,
  unitForObject,
} from "@/lib/model/locations";
import {
  isStorageType,
  LOCATION_KIND_LABEL,
  STORAGE_TYPE_LABEL,
  type CompartmentLayout,
  type ContentsType,
  type MapObject,
  type ShopDocument,
  type StorageLocation,
  type StorageType,
} from "@/lib/model/types";
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from "../icons";
import { Button, cx, CommitInput, FieldLabel, IconButton, Mono, SectionTitle, Select, Tag } from "../ui";
import { describeContents, ElevationDiagram } from "./ElevationDiagram";

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

  const report = (archived: number, restored: number, archivedWhy = "outside the new grid archived (IDs kept; they return if the grid grows)") => {
    const parts: string[] = [];
    if (archived) parts.push(`${archived} compartment${archived > 1 ? "s" : ""} ${archivedWhy}`);
    if (restored) parts.push(`${restored} archived compartment${restored > 1 ? "s" : ""} restored`);
    setNotice(parts.length ? `${parts.join(". ")}.` : null);
  };

  const applyConfig = (target: StorageLocation, layout: CompartmentLayout) => {
    const result = configureCompartments(doc.locations, target.id, layout);
    apply({ ...doc, locations: result.locations });
    report(result.archived.length, result.restored.length);
  };

  const setContents = (target: StorageLocation, layout: CompartmentLayout | null) => {
    if (layout) return applyConfig(target, layout);
    const result = clearCompartments(doc.locations, target.id);
    apply({ ...doc, locations: result.locations });
    report(result.archived.length, 0, "archived (IDs kept; choosing contents again brings them back)");
  };

  const copyToSiblings = (source: StorageLocation) => {
    const same = (a: CompartmentLayout | null | undefined, b: CompartmentLayout | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const differing = source.parentId
      ? childrenOf(doc.locations, source.parentId).filter((s) => s.id !== source.id && s.compartments && !same(s.compartments, source.compartments)).length
      : 0;
    if (
      differing > 0 &&
      !confirm(`${differing} other compartment${differing > 1 ? "s are" : " is"} already set up differently. Replace ${differing > 1 ? "them" : "it"}? Their current contents are archived (IDs kept), and you can undo before saving.`)
    ) {
      return;
    }
    const result = applyContentsToSiblings(doc.locations, source.id);
    apply({ ...doc, locations: result.locations });
    report(result.archived.length, result.restored.length, "archived (IDs kept)");
  };

  if (!configured) {
    return (
      <section>
        <SectionTitle>Storage layout</SectionTitle>
        <p className="border border-dashed border-line bg-panel px-3 py-2.5 text-xs text-ink-2">Storage layout not configured</p>
        {editing && (
          <SetupForm
            key={object.id}
            objectName={object.name}
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
      <SectionTitle aside={<span className="text-2xs text-ink-3">{isStorageType(unit.compartments!.type) ? STORAGE_TYPE_LABEL[unit.compartments!.type] : "Bins"}</span>}>
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

      {selected && (
        <CompartmentDetail
          doc={doc}
          location={selected}
          editing={editing}
          apply={apply}
          onSelect={onSelectLocation}
          onContents={setContents}
          onCopyToSiblings={copyToSiblings}
        />
      )}

      {!selected && (
        <p className="text-2xs text-ink-3">
          {editing ? "Select a compartment to name it and choose what’s inside." : "Select a compartment to see its location code."}
        </p>
      )}

      {editing && <UnitConfig doc={doc} unit={unit} onConfigure={applyConfig} apply={apply} onSelect={onSelectLocation} />}

      {notice && <p className="border border-warn/40 bg-warn-soft px-2 py-1.5 text-2xs text-warn">{notice}</p>}
      {editing && archivedCount > 0 && !notice && (
        <p className="text-2xs text-ink-3">
          {archivedCount} archived compartment{archivedCount > 1 ? "s" : ""} kept for existing references.
        </p>
      )}
    </section>
  );
}

function guessStorageType(name: string): StorageType {
  if (/cubb/i.test(name)) return "cubby";
  if (/shel/i.test(name)) return "shelf";
  if (/tool ?rack|pegboard|hook/i.test(name)) return "toolRack";
  if (/bin/i.test(name)) return "binRack";
  return "cabinet";
}

function SetupForm({ objectName, onConfigure }: { objectName: string; onConfigure: (type: StorageType, rows: number, cols: number) => void }) {
  const [type, setType] = useState<StorageType>(() => guessStorageType(objectName));
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

type ContentsChoice = ContentsType | "none";

const CONTENTS_CHOICES: { value: ContentsChoice; label: string }[] = [
  { value: "none", label: "Empty" },
  { value: "singleBin", label: "Big bin" },
  { value: "binGrid", label: "Bins" },
  { value: "boxGrid", label: "Boxes" },
  { value: "drawerStack", label: "Drawers" },
];

const DEFAULT_CONTENTS: Record<ContentsType, { rows: number; cols: number }> = {
  singleBin: { rows: 1, cols: 1 },
  binGrid: { rows: 1, cols: 3 },
  boxGrid: { rows: 2, cols: 4 },
  drawerStack: { rows: 3, cols: 1 },
};

const isGridContents = (t: string) => t === "binGrid" || t === "boxGrid";

function ContentsEditor({
  location,
  kindName,
  siblings,
  onContents,
  onCopyToSiblings,
}: {
  location: StorageLocation;
  kindName: string;
  siblings: number;
  onContents: (layout: CompartmentLayout | null) => void;
  onCopyToSiblings: () => void;
}) {
  const current = location.compartments;
  const choice: ContentsChoice = current && !isStorageType(current.type) ? current.type : current ? "binGrid" : "none";

  const choose = (next: ContentsChoice) => {
    if (next === choice) return;
    if (next === "none") return onContents(null);
    const keepGrid = current && isGridContents(current.type) && isGridContents(next);
    onContents({ type: next, ...(keepGrid ? { rows: current.rows, cols: current.cols } : DEFAULT_CONTENTS[next]) });
  };

  return (
    <div className="space-y-2">
      <div>
        <FieldLabel>What’s inside this {kindName}</FieldLabel>
        <div role="radiogroup" aria-label={`What’s inside this ${kindName}`} className="grid grid-cols-5 gap-1">
          {CONTENTS_CHOICES.map((o) => {
            const on = o.value === choice;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(o.value)}
                className={cx(
                  "flex flex-col items-center gap-1 border px-0.5 pt-1.5 pb-1 text-[10px] leading-none transition-colors",
                  on ? "border-ink bg-ink text-white" : "border-line bg-panel text-ink-2 hover:border-ink-3 hover:text-ink",
                )}
              >
                <ContentsGlyph type={o.value} />
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {current && isGridContents(current.type) && (
        <GridForm key={`${current.type}:${current.rows}x${current.cols}`} layout={current} onApply={(rows, cols) => onContents({ type: current.type, rows, cols })} />
      )}
      {current?.type === "drawerStack" && (
        <StackForm key={current.rows} rows={current.rows} onApply={(rows) => onContents({ type: "drawerStack", rows, cols: 1 })} />
      )}

      {siblings > 0 && (
        <Button size="sm" className="w-full" onClick={onCopyToSiblings}>
          Use the same contents in the other {siblings} {siblings === 1 ? kindName : pluralize(kindName)}
        </Button>
      )}
    </div>
  );
}

const pluralize = (s: string) => (/(x|s|ch|sh)$/.test(s) ? `${s}es` : s.endsWith("y") && !/[aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : `${s}s`);

function StackForm({ rows, onApply }: { rows: number; onApply: (rows: number) => void }) {
  const [value, setValue] = useState(rows);
  return (
    <div className="flex items-end gap-2">
      <Stepper label="Drawers" value={value} onChange={setValue} />
      <Button size="md" variant={value !== rows ? "primary" : "default"} disabled={value === rows} onClick={() => onApply(value)}>
        Apply
      </Button>
    </div>
  );
}

/** 20×14 pictogram of each contents option, drawn in currentColor. */
function ContentsGlyph({ type }: { type: ContentsChoice }) {
  return (
    <svg width={20} height={14} viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth={1} aria-hidden>
      <rect x={0.5} y={0.5} width={19} height={13} strokeOpacity={0.45} />
      {type === "singleBin" && (
        <>
          <rect x={3.5} y={3.5} width={13} height={8} />
          <line x1={3.5} x2={16.5} y1={5.5} y2={5.5} />
          <rect x={8} y={7.5} width={4} height={2} />
        </>
      )}
      {type === "binGrid" && [3.5, 8.5, 13.5].map((x) => <rect key={x} x={x - 0.5} y={4.5} width={4} height={7} />)}
      {type === "boxGrid" &&
        [3, 6.75, 10.5, 14.25].flatMap((x) => [3, 7.5].map((y) => <rect key={`${x}:${y}`} x={x} y={y} width={2.75} height={3.5} strokeWidth={0.75} />))}
      {type === "drawerStack" &&
        [2.5, 6, 9.5].map((y) => (
          <g key={y}>
            <rect x={3.5} y={y} width={13} height={3} />
            <line x1={8.5} x2={11.5} y1={y + 2} y2={y + 2} />
          </g>
        ))}
    </svg>
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
  onContents,
  onCopyToSiblings,
}: {
  doc: ShopDocument;
  location: StorageLocation;
  editing: boolean;
  apply: (doc: ShopDocument) => void;
  onSelect: (id: string | null) => void;
  onContents: (target: StorageLocation, layout: CompartmentLayout | null) => void;
  onCopyToSiblings: (source: StorageLocation) => void;
}) {
  const crumbs = breadcrumb(doc, location.id);
  const holdsContents = canHoldContents(location.kind);
  const siblings = location.parentId ? childrenOf(doc.locations, location.parentId).length - 1 : 0;
  const kindName = LOCATION_KIND_LABEL[location.kind].toLowerCase();
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
        {holdsContents && (
          <>
            <dt className="text-ink-3">Holds</dt>
            <dd className="text-ink-2">{location.compartments ? describeContents(location.compartments) : "Nothing set up"}</dd>
          </>
        )}
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
          {holdsContents && (
            <ContentsEditor
              key={location.id}
              location={location}
              kindName={kindName}
              siblings={siblings}
              onContents={(layout) => onContents(location, layout)}
              onCopyToSiblings={() => onCopyToSiblings(location)}
            />
          )}
          <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>
            Clear compartment selection
          </Button>
        </div>
      )}
    </div>
  );
}
