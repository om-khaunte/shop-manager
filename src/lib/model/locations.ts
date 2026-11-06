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
};

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
  const rows = Math.max(1, Math.min(40, Math.floor(layout.rows)));
  const cols = layout.type === "cabinet" ? 1 : Math.max(1, Math.min(40, Math.floor(layout.cols)));
  const kind = CHILD_KIND[layout.type];
  const next: LocationMap = { ...locations };
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
        next[found.id] = { ...found, archived: false, sortOrder, kind };
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
  return { locations: next, created, archived, restored };
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
  return t && t !== "binGrid" ? t : null;
}
