import { newId } from "./ids";
import type {
  CompartmentLayout,
  LocationKind,
  LocationMap,
  MapObject,
  ShopDocument,
  StorageLocation,
  StorageType,
} from "./types";
import { isStorageType } from "./types";
import type { Issue } from "./layout";

// ---------------------------------------------------------------------------
// Hierarchy
// ---------------------------------------------------------------------------

/** Root-first chain of locations ending at `locationId`. Throws on cycles or missing parents. */
export function resolveChain(locations: LocationMap, locationId: string): StorageLocation[] {
  const chain: StorageLocation[] = [];
  const seen = new Set<string>();
  let current: string | null = locationId;
  while (current) {
    if (seen.has(current)) throw new Error(`Location hierarchy has a cycle at ${current}.`);
    seen.add(current);
    const loc: StorageLocation | undefined = locations[current];
    if (!loc) throw new Error(`Location ${current} does not exist.`);
    chain.unshift(loc);
    current = loc.parentId;
  }
  return chain;
}

/** The map object a location belongs to: the nearest ancestor (or self) with mapObjectId. */
export function resolveMapObjectId(locations: LocationMap, locationId: string): string | null {
  const chain = resolveChain(locations, locationId);
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i].mapObjectId) return chain[i].mapObjectId;
  return null;
}

/** True if making `parentId` the parent of `childId` would create a cycle. */
export function wouldCreateCycle(locations: LocationMap, childId: string, parentId: string | null): boolean {
  let current = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === childId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = locations[current]?.parentId ?? null;
  }
  return false;
}

export function setParent(locations: LocationMap, childId: string, parentId: string | null): LocationMap {
  if (wouldCreateCycle(locations, childId, parentId)) {
    throw new Error("That parent would create a cycle in the storage hierarchy.");
  }
  return { ...locations, [childId]: { ...locations[childId], parentId } };
}

export function breadcrumb(doc: ShopDocument, locationId: string): string[] {
  const chain = resolveChain(doc.locations, locationId);
  const objectId = resolveMapObjectId(doc.locations, locationId);
  const object = objectId ? doc.layout.objects[objectId] : undefined;
  const parts: string[] = [];
  if (object?.zone) parts.push(object.zone);
  for (const loc of chain) parts.push(loc.kind === "unit" ? (object?.name ?? loc.label) : loc.label);
  return parts;
}

export function childrenOf(locations: LocationMap, parentId: string, includeArchived = false): StorageLocation[] {
  return Object.values(locations)
    .filter((l) => l.parentId === parentId && (includeArchived || !l.archived))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function unitForObject(locations: LocationMap, objectId: string): StorageLocation | undefined {
  return Object.values(locations).find((l) => l.kind === "unit" && l.mapObjectId === objectId && !l.archived)
    ?? Object.values(locations).find((l) => l.kind === "unit" && l.mapObjectId === objectId);
}

export function validateLocations(doc: ShopDocument): Issue[] {
  const issues: Issue[] = [];
  for (const loc of Object.values(doc.locations)) {
    try {
      resolveChain(doc.locations, loc.id);
    } catch (e) {
      issues.push({ locationId: loc.id, message: (e as Error).message });
      continue;
    }
    if (loc.kind === "unit" && !loc.archived && loc.mapObjectId && !doc.layout.objects[loc.mapObjectId]) {
      issues.push({ locationId: loc.id, message: `${loc.code}: its map object no longer exists.` });
    }
    if (loc.kind !== "unit" && loc.parentId === null) {
      issues.push({ locationId: loc.id, message: `${loc.code}: compartments must have a parent.` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Compartment configuration
// ---------------------------------------------------------------------------

export const CHILD_KIND: Record<CompartmentLayout["type"], LocationKind> = {
  cabinet: "drawer",
  shelf: "shelf",
  cubby: "cubby",
  binRack: "bin",
  toolRack: "slot",
  binGrid: "bin",
  singleBin: "bin",
  boxGrid: "box",
  drawerStack: "drawer",
};

/** Layouts drawn as a single column of drawers. */
export const isStackLayout = (type: CompartmentLayout["type"]) => type === "cabinet" || type === "drawerStack";

/** Location kinds that can hold contents of their own. Boxes and tool slots are leaves. */
export const canHoldContents = (kind: LocationKind) => kind !== "box" && kind !== "slot" && kind !== "unit";

const DEFAULT_LABEL = /^(Bin|Box|Drawer|Slot|Shelf|Cubby)( [A-Z]*\d+(\.\d+)?| [A-Z]+)?$/;

const letter = (i: number) => {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};
const pad = (n: number) => String(n).padStart(2, "0");

export function defaultCompartmentLabel(type: CompartmentLayout["type"], row: number, col: number, cols: number): string {
  switch (type) {
    case "cabinet":
      return `Drawer ${letter(row)}`;
    case "shelf":
      return cols === 1 ? `Shelf ${row + 1}` : `Shelf ${row + 1}.${col + 1}`;
    case "cubby":
      return `Cubby ${letter(row)}${col + 1}`;
    case "toolRack":
      return `Slot ${pad(row * cols + col + 1)}`;
    case "singleBin":
      return "Bin";
    case "boxGrid":
      return `Box ${pad(row * cols + col + 1)}`;
    case "drawerStack":
      return `Drawer ${row + 1}`;
    default:
      return `Bin ${pad(row * cols + col + 1)}`;
  }
}

function codeSuffix(type: CompartmentLayout["type"], row: number, col: number, cols: number): string {
  if (type === "cabinet") return letter(row);
  if (type === "cubby") return `${letter(row)}${col + 1}`;
  return pad(row * cols + col + 1);
}

export function ensureUnit(doc: ShopDocument, object: MapObject): { doc: ShopDocument; unit: StorageLocation } {
  const existing = unitForObject(doc.locations, object.id);
  if (existing) {
    if (!existing.archived) return { doc, unit: existing };
    const unit = { ...existing, archived: false };
    return { doc: { ...doc, locations: { ...doc.locations, [unit.id]: unit } }, unit };
  }
  const unit: StorageLocation = {
    id: newId("loc"),
    parentId: null,
    mapObjectId: object.id,
    kind: "unit",
    label: object.name,
    code: object.code,
    sortOrder: 0,
    diagramPosition: null,
    archived: false,
    compartments: null,
    example: object.example || undefined,
  };
  return { doc: { ...doc, locations: { ...doc.locations, [unit.id]: unit } }, unit };
}

export interface ConfigureResult {
  locations: LocationMap;
  created: string[];
  archived: string[];
  restored: string[];
}

/**
 * Sets a location's compartment grid. Existing compartments keep their IDs and
 * labels when their row/column is still inside the grid; compartments that
 * fall outside are archived (never deleted) and come back if the grid grows.
 */
export function configureCompartments(
  locations: LocationMap,
  parentId: string,
  layout: CompartmentLayout,
): ConfigureResult {
  const parent = locations[parentId];
  if (!parent) throw new Error(`Location ${parentId} does not exist.`);
  const single = layout.type === "singleBin";
  const rows = single ? 1 : Math.max(1, Math.min(40, Math.floor(layout.rows)));
  const cols = single || isStackLayout(layout.type) ? 1 : Math.max(1, Math.min(40, Math.floor(layout.cols)));
  const kind = CHILD_KIND[layout.type];
  const next: LocationMap = { ...locations };
  // The grid the existing compartments were numbered under. A label or code that still
  // equals that numbering was never edited, so it is renumbered for the new grid. Anything
  // the user typed is left alone.
  const prior = parent.compartments;
  const priorCols = prior ? (prior.type === "singleBin" || isStackLayout(prior.type) ? 1 : prior.cols) : null;
  const created: string[] = [];
  const archived: string[] = [];
  const restored: string[] = [];

  const existing = childrenOf(locations, parentId, true);
  const byCell = new Map<string, StorageLocation>();
  for (const c of existing) {
    if (!c.diagramPosition) continue;
    const key = `${c.diagramPosition.row}:${c.diagramPosition.col}`;
    const prior = byCell.get(key);
    if (!prior || (prior.archived && !c.archived)) byCell.set(key, c);
  }
  const kept = new Set<string>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sortOrder = r * cols + c;
      const found = byCell.get(`${r}:${c}`);
      if (found) {
        kept.add(found.id);
        if (found.archived) restored.push(found.id);
        // A compartment that changes kind (e.g. bins → boxes) keeps its ID and any
        // custom label; only untouched default labels follow the new kind.
        const wasAutoLabel = prior && priorCols !== null ? found.label === defaultCompartmentLabel(prior.type, r, c, priorCols) : DEFAULT_LABEL.test(found.label);
        const kindChangedDefault = found.kind !== kind && DEFAULT_LABEL.test(found.label);
        const label = wasAutoLabel || kindChangedDefault ? defaultCompartmentLabel(layout.type, r, c, cols) : found.label;
        const wasAutoCode = prior && priorCols !== null && found.code === `${parent.code}.${codeSuffix(prior.type, r, c, priorCols)}`;
        const code = wasAutoCode ? `${parent.code}.${codeSuffix(layout.type, r, c, cols)}` : found.code;
        next[found.id] = { ...found, archived: false, sortOrder, kind, label, code };
      } else {
        const id = newId("loc");
        created.push(id);
        kept.add(id);
        next[id] = {
          id,
          parentId,
          mapObjectId: null,
          kind,
          label: defaultCompartmentLabel(layout.type, r, c, cols),
          code: `${parent.code}.${codeSuffix(layout.type, r, c, cols)}`,
          sortOrder,
          diagramPosition: { row: r, col: c },
          archived: false,
          compartments: null,
          example: parent.example || undefined,
        };
      }
    }
  }
  for (const c of existing) {
    if (!kept.has(c.id) && !c.archived) {
      archived.push(c.id);
      next[c.id] = { ...c, archived: true };
    }
  }
  next[parentId] = { ...parent, compartments: { type: layout.type, rows, cols } };
  healDuplicates(next, parentId, layout.type, cols);
  return { locations: next, created, archived, restored };
}

/**
 * Repairs data saved by older versions, where growing a grid could leave two
 * compartments with the same default label or code (for example two "Bin 04"),
 * so an edit to one looked like it hit the other. Only untouched default-looking
 * values are renumbered for their cell; anything the user typed is kept.
 */
function healDuplicates(map: LocationMap, parentId: string, type: CompartmentLayout["type"], cols: number): void {
  const parent = map[parentId];
  const active = Object.values(map).filter((l) => l.parentId === parentId && !l.archived && l.diagramPosition);
  const repeated = (pick: (l: StorageLocation) => string) => {
    const count = new Map<string, number>();
    for (const l of active) count.set(pick(l), (count.get(pick(l)) ?? 0) + 1);
    return (l: StorageLocation) => (count.get(pick(l)) ?? 0) > 1;
  };
  const labelDup = repeated((l) => l.label);
  const codeDup = repeated((l) => l.code);
  for (const l of active) {
    const { row, col } = l.diagramPosition!;
    let fixed = l;
    if (labelDup(l) && DEFAULT_LABEL.test(l.label)) fixed = { ...fixed, label: defaultCompartmentLabel(type, row, col, cols) };
    if (codeDup(l) && l.code.startsWith(`${parent.code}.`)) fixed = { ...fixed, code: `${parent.code}.${codeSuffix(type, row, col, cols)}` };
    if (fixed !== l) map[l.id] = fixed;
  }
}

/** Empties a compartment: its children are archived (IDs kept) and its layout is cleared. */
export function clearCompartments(locations: LocationMap, parentId: string): { locations: LocationMap; archived: string[] } {
  const next: LocationMap = { ...locations };
  const archived: string[] = [];
  for (const c of childrenOf(locations, parentId)) {
    archived.push(c.id);
    next[c.id] = { ...c, archived: true };
  }
  next[parentId] = { ...locations[parentId], compartments: null };
  return { locations: next, archived };
}

/**
 * Gives every sibling of `sourceId` the same contents layout (or empties them
 * when the source is empty). Each sibling keeps its own compartment IDs.
 */
export function applyContentsToSiblings(locations: LocationMap, sourceId: string): ConfigureResult {
  const source = locations[sourceId];
  const result: ConfigureResult = { locations, created: [], archived: [], restored: [] };
  if (!source?.parentId) return result;
  for (const sibling of childrenOf(locations, source.parentId)) {
    if (sibling.id === sourceId) continue;
    if (source.compartments) {
      const r = configureCompartments(result.locations, sibling.id, source.compartments);
      result.locations = r.locations;
      result.created.push(...r.created);
      result.archived.push(...r.archived);
      result.restored.push(...r.restored);
    } else if (sibling.compartments) {
      const r = clearCompartments(result.locations, sibling.id);
      result.locations = r.locations;
      result.archived.push(...r.archived);
    }
  }
  return result;
}

/** Appends a drawer to a cabinet without touching existing drawers. */
export function addDrawer(locations: LocationMap, unitId: string): LocationMap {
  const unit = locations[unitId];
  const rows = (unit.compartments?.rows ?? 0) + 1;
  return configureCompartments(locations, unitId, { type: "cabinet", rows, cols: 1 }).locations;
}

/**
 * Archives one drawer and closes the gap. Remaining drawers keep their IDs;
 * only their diagram row changes.
 */
export function removeDrawer(locations: LocationMap, unitId: string, drawerId: string): LocationMap {
  const drawers = childrenOf(locations, unitId).filter((d) => d.id !== drawerId);
  const next: LocationMap = { ...locations, [drawerId]: { ...locations[drawerId], archived: true, diagramPosition: null } };
  drawers.forEach((d, i) => {
    next[d.id] = { ...d, sortOrder: i, diagramPosition: { row: i, col: 0 } };
  });
  next[unitId] = { ...next[unitId], compartments: { type: "cabinet", rows: drawers.length, cols: 1 } };
  return next;
}

export function moveDrawer(locations: LocationMap, unitId: string, drawerId: string, delta: -1 | 1): LocationMap {
  const drawers = childrenOf(locations, unitId);
  const i = drawers.findIndex((d) => d.id === drawerId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= drawers.length) return locations;
  [drawers[i], drawers[j]] = [drawers[j], drawers[i]];
  const next = { ...locations };
  drawers.forEach((d, idx) => {
    next[d.id] = { ...d, sortOrder: idx, diagramPosition: { row: idx, col: 0 } };
  });
  return next;
}

export function renameLocation(locations: LocationMap, id: string, label: string, code?: string): LocationMap {
  const l = locations[id];
  if (!l) return locations;
  return { ...locations, [id]: { ...l, label, ...(code !== undefined ? { code } : {}) } };
}

export function storageTypeOf(unit: StorageLocation | undefined): StorageType | null {
  const t = unit?.compartments?.type;
  return t && isStorageType(t) ? t : null;
}

// ---------------------------------------------------------------------------
// Moving compartments
// ---------------------------------------------------------------------------

/** Ids of everything below `id`, archived included. */
export function descendantIds(locations: LocationMap, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const l of Object.values(locations)) {
      if (l.parentId === cur) {
        out.push(l.id);
        stack.push(l.id);
      }
    }
  }
  return out;
}

const KIND_PLURAL: Record<LocationKind, string> = {
  unit: "units",
  drawer: "drawers",
  shelf: "shelves",
  cubby: "cubbies",
  bin: "bins",
  box: "boxes",
  slot: "tool slots",
};

/** The grid a compartment of `kind` gets when it is moved into a container that has no layout yet. */
function layoutForMovedKind(kind: LocationKind, isUnit: boolean): CompartmentLayout | null {
  switch (kind) {
    case "drawer":
      return { type: isUnit ? "cabinet" : "drawerStack", rows: 1, cols: 1 };
    case "bin":
      return { type: isUnit ? "binRack" : "singleBin", rows: 1, cols: 1 };
    case "box":
      return isUnit ? null : { type: "boxGrid", rows: 1, cols: 1 };
    case "shelf":
      return isUnit ? { type: "shelf", rows: 1, cols: 1 } : null;
    case "cubby":
      return isUnit ? { type: "cubby", rows: 1, cols: 1 } : null;
    case "slot":
      return isUnit ? { type: "toolRack", rows: 1, cols: 1 } : null;
    default:
      return null;
  }
}

function firstFreeCell(locations: LocationMap, parentId: string, layout: CompartmentLayout): { row: number; col: number } | null {
  const taken = new Set(
    childrenOf(locations, parentId)
      .filter((c) => c.diagramPosition)
      .map((c) => `${c.diagramPosition!.row}:${c.diagramPosition!.col}`),
  );
  const cols = isStackLayout(layout.type) || layout.type === "singleBin" ? 1 : layout.cols;
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < cols; c++) if (!taken.has(`${r}:${c}`)) return { row: r, col: c };
  }
  return null;
}

/** Why `sourceId` cannot be moved into `targetId`, or null when it can. */
export function moveIntoProblem(locations: LocationMap, sourceId: string, targetId: string): string | null {
  const source = locations[sourceId];
  const target = locations[targetId];
  if (!source || !target) return "That compartment no longer exists.";
  if (source.kind === "unit") return "Whole storage units are moved on the map, not here.";
  if (target.archived) return "That destination is archived.";
  if (sourceId === targetId || descendantIds(locations, sourceId).includes(targetId)) return "A compartment can't go inside itself.";
  if (source.parentId === targetId) return `${source.label} is already in ${target.label}.`;
  if (target.kind === "box" || target.kind === "slot") return `${target.label} can't hold other compartments.`;
  const isUnit = target.kind === "unit";
  if (!target.compartments) {
    return layoutForMovedKind(source.kind, isUnit) ? null : `${target.label} can't hold ${KIND_PLURAL[source.kind]}.`;
  }
  const childKind = CHILD_KIND[target.compartments.type];
  if (childKind !== source.kind) return `${target.label} holds ${KIND_PLURAL[childKind]}, not ${KIND_PLURAL[source.kind]}.`;
  if (target.compartments.type === "singleBin" && firstFreeCell(locations, targetId, target.compartments) === null) {
    return `${target.label} already has its bin.`;
  }
  return null;
}

/** Why `a` and `b` cannot swap places, or null when they can. */
export function swapProblem(locations: LocationMap, aId: string, bId: string): string | null {
  const a = locations[aId];
  const b = locations[bId];
  if (!a || !b) return "That compartment no longer exists.";
  if (a.kind === "unit" || b.kind === "unit") return "Whole storage units are moved on the map, not here.";
  if (aId === bId) return "Pick a different compartment.";
  if (b.archived) return "That compartment is archived.";
  if (a.kind !== b.kind) return `${a.label} is a ${a.kind} and ${b.label} is a ${b.kind}; only matching kinds can swap.`;
  if (descendantIds(locations, aId).includes(bId) || descendantIds(locations, bId).includes(aId)) return "One of them is inside the other.";
  if (!a.parentId || !b.parentId) return "Both compartments need a parent.";
  return null;
}

/** Re-roots the codes of `rootId` and everything below it: `from` becomes `to`. */
function recode(locations: LocationMap, rootId: string, from: string, to: string): LocationMap {
  if (from === to) return locations;
  const next = { ...locations };
  for (const id of [rootId, ...descendantIds(locations, rootId)]) {
    const l = next[id];
    if (l.code === from) next[id] = { ...l, code: to };
    else if (l.code.startsWith(`${from}.`)) next[id] = { ...l, code: to + l.code.slice(from.length) };
  }
  return next;
}

function setExample(locations: LocationMap, rootId: string, example: boolean): LocationMap {
  const next = { ...locations };
  for (const id of [rootId, ...descendantIds(locations, rootId)]) {
    const { example: _drop, ...rest } = next[id];
    void _drop;
    next[id] = example ? { ...rest, example: true } : rest;
  }
  return next;
}

/** After something leaves a stack of drawers, close the gap so rows stay contiguous. */
function repackStack(locations: LocationMap, parentId: string): LocationMap {
  const parent = locations[parentId];
  if (!parent?.compartments || !isStackLayout(parent.compartments.type)) return locations;
  const rest = childrenOf(locations, parentId);
  const next = { ...locations };
  rest.forEach((c, i) => {
    next[c.id] = { ...c, sortOrder: i, diagramPosition: { row: i, col: 0 } };
  });
  if (rest.length > 0) next[parentId] = { ...parent, compartments: { ...parent.compartments, rows: rest.length } };
  else if (parent.kind !== "unit") next[parentId] = { ...parent, compartments: null };
  return next;
}

const keepOrRenumber = (loc: StorageLocation, type: CompartmentLayout["type"], row: number, col: number, cols: number) =>
  DEFAULT_LABEL.test(loc.label) ? defaultCompartmentLabel(type, row, col, cols) : loc.label;

/**
 * Moves a compartment, with everything inside it, into another container.
 * The compartment keeps its ID, label, contents, and every ID below it, so
 * anything that refers to those IDs (such as inventory) follows it. Only its
 * location codes are rewritten to match the new place. The spot it leaves is
 * vacated (and, for drawer stacks, closed up).
 */
export function moveCompartmentInto(locations: LocationMap, sourceId: string, targetId: string): LocationMap {
  const problem = moveIntoProblem(locations, sourceId, targetId);
  if (problem) throw new Error(problem);
  const source = locations[sourceId];
  const oldParentId = source.parentId!;
  let next: LocationMap = { ...locations };
  const target = next[targetId];
  const isUnit = target.kind === "unit";

  let layout = target.compartments ?? layoutForMovedKind(source.kind, isUnit)!;
  let cell = target.compartments ? firstFreeCell(next, targetId, layout) : { row: 0, col: 0 };
  if (!cell) {
    // Full: add a row (a drawer stack just gets one more drawer).
    layout = { ...layout, rows: layout.rows + 1 };
    cell = { row: layout.rows - 1, col: 0 };
  }
  const cols = isStackLayout(layout.type) || layout.type === "singleBin" ? 1 : layout.cols;
  const oldCode = source.code;
  const newCode = `${target.code}.${codeSuffix(layout.type, cell.row, cell.col, cols)}`;

  next[targetId] = { ...target, compartments: { type: layout.type, rows: layout.rows, cols } };
  next[sourceId] = {
    ...source,
    parentId: targetId,
    diagramPosition: { row: cell.row, col: cell.col },
    sortOrder: cell.row * cols + cell.col,
    label: keepOrRenumber(source, layout.type, cell.row, cell.col, cols),
    archived: false,
  };
  next = recode(next, sourceId, oldCode, newCode);
  next = setExample(next, sourceId, !!target.example);
  return repackStack(next, oldParentId);
}

/**
 * Swaps two compartments of the same kind. Each keeps its own contents and
 * IDs and takes the other's place (parent, grid cell, and location code).
 */
export function swapCompartments(locations: LocationMap, aId: string, bId: string): LocationMap {
  const problem = swapProblem(locations, aId, bId);
  if (problem) throw new Error(problem);
  const a = locations[aId];
  const b = locations[bId];
  let next: LocationMap = { ...locations };
  const aParent = next[a.parentId!];
  const bParent = next[b.parentId!];
  const colsOf = (p: StorageLocation) => (p.compartments && !isStackLayout(p.compartments.type) && p.compartments.type !== "singleBin" ? p.compartments.cols : 1);
  const labelFor = (loc: StorageLocation, into: StorageLocation, pos: StorageLocation["diagramPosition"]) =>
    into.compartments && pos ? keepOrRenumber(loc, into.compartments.type, pos.row, pos.col, colsOf(into)) : loc.label;

  next[aId] = { ...a, parentId: b.parentId, diagramPosition: b.diagramPosition, sortOrder: b.sortOrder, label: labelFor(a, bParent, b.diagramPosition), archived: false };
  next[bId] = { ...b, parentId: a.parentId, diagramPosition: a.diagramPosition, sortOrder: a.sortOrder, label: labelFor(b, aParent, a.diagramPosition), archived: false };
  next = recode(next, aId, a.code, b.code);
  // b's old code may be a prefix of a's new subtree codes; recode b from its original code.
  next = recode(next, bId, b.code, a.code);
  next = setExample(next, aId, !!bParent.example);
  next = setExample(next, bId, !!aParent.example);
  return next;
}
