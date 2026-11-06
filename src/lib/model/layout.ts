import { newId } from "./ids";
import {
  SCHEMA_VERSION,
  type DoorStyle,
  type LabelPosition,
  type Layout,
  type MapObject,
  type ObjectKind,
  type Rotation,
  type ShopDocument,
  type StorageLocation,
  type VerificationStatus,
} from "./types";

const CODE_PREFIX: Record<ObjectKind, string> = {
  machine: "M",
  storage: "S",
  workbench: "B",
  wall: "W",
  door: "D",
  feature: "F",
  label: "T",
};

export function nextCode(objects: Record<string, MapObject>, kind: ObjectKind): string {
  const prefix = CODE_PREFIX[kind];
  const used = new Set(Object.values(objects).map((o) => o.code));
  let n = 1;
  for (const o of Object.values(objects)) {
    const m = o.code.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  let code = `${prefix}-${String(n).padStart(2, "0")}`;
  while (used.has(code)) code = `${prefix}-${String(++n).padStart(2, "0")}`;
  return code;
}

const DEFAULT_SIZE: Record<ObjectKind, [number, number]> = {
  machine: [80, 60],
  storage: [100, 40],
  workbench: [160, 80],
  wall: [200, 12],
  door: [60, 12],
  feature: [60, 60],
  label: [160, 28],
};

const DEFAULT_NAME: Record<ObjectKind, string> = {
  machine: "New machine",
  storage: "New storage unit",
  workbench: "New workbench",
  wall: "Wall segment",
  door: "Door",
  feature: "Room feature",
  label: "Label",
};

export function createObject(
  objects: Record<string, MapObject>,
  kind: ObjectKind,
  at: { x: number; y: number },
): MapObject {
  const [w, h] = DEFAULT_SIZE[kind];
  const o: MapObject = {
    id: newId("obj"),
    code: nextCode(objects, kind),
    kind,
    name: DEFAULT_NAME[kind],
    x: at.x,
    y: at.y,
    w,
    h,
    rotation: 0,
    labelPosition: kind === "wall" || kind === "door" ? "hidden" : "center",
    status: "draft",
  };
  if (kind === "door") o.door = { style: "swing-left" };
  if (kind === "wall") o.wall = { style: "solid" };
  return o;
}

export function duplicateObject(objects: Record<string, MapObject>, source: MapObject, offset = 20): MapObject {
  return {
    ...structuredClone(source),
    id: newId("obj"),
    code: nextCode(objects, source.kind),
    name: `${source.name} copy`,
    x: source.x + offset,
    y: source.y + offset,
    locked: false,
    status: "draft",
    photoPath: null,
  };
}

export function withObject(doc: ShopDocument, o: MapObject): ShopDocument {
  return { ...doc, layout: { ...doc.layout, objects: { ...doc.layout.objects, [o.id]: o } } };
}

export function updateObject(doc: ShopDocument, id: string, patch: Partial<MapObject>): ShopDocument {
  const current = doc.layout.objects[id];
  if (!current) return doc;
  const { id: _ignored, ...rest } = patch;
  void _ignored;
  return withObject(doc, { ...current, ...rest });
}

/** Locations (active or archived) that point at a map object. */
export function locationsReferencingObject(doc: ShopDocument, objectId: string): StorageLocation[] {
  return Object.values(doc.locations).filter((l) => l.mapObjectId === objectId);
}

/**
 * Removes a map object. Any storage locations tied to it are archived, never
 * deleted, so future item assignments that reference their IDs stay resolvable.
 */
export function deleteObject(doc: ShopDocument, objectId: string): ShopDocument {
  if (!doc.layout.objects[objectId]) return doc;
  const objects = { ...doc.layout.objects };
  delete objects[objectId];
  const unitIds = new Set(locationsReferencingObject(doc, objectId).map((l) => l.id));
  const locations = { ...doc.locations };
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of Object.values(locations)) {
      if (l.parentId && unitIds.has(l.parentId) && !unitIds.has(l.id)) {
        unitIds.add(l.id);
        changed = true;
      }
    }
  }
  for (const id of unitIds) locations[id] = { ...locations[id], archived: true };
  return { layout: { ...doc.layout, objects }, locations };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface Issue {
  objectId?: string;
  locationId?: string;
  message: string;
}

const KINDS: ObjectKind[] = ["machine", "storage", "workbench", "wall", "door", "feature", "label"];
const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const LABEL_POSITIONS: LabelPosition[] = ["center", "above", "below", "left", "right", "hidden"];
const DOOR_STYLES: DoorStyle[] = ["swing-left", "swing-right", "double", "rollup", "opening"];
const STATUSES: VerificationStatus[] = ["draft", "verified"];

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function validateLayout(layout: Layout): Issue[] {
  const issues: Issue[] = [];
  if (!finite(layout.width) || layout.width <= 0 || !finite(layout.height) || layout.height <= 0) {
    issues.push({ message: "Layout width and height must be positive numbers." });
  }
  const codes = new Map<string, string>();
  for (const [key, o] of Object.entries(layout.objects)) {
    const name = o?.name || key;
    if (!o || o.id !== key) {
      issues.push({ objectId: key, message: `Object key ${key} does not match its id.` });
      continue;
    }
    if (!KINDS.includes(o.kind)) issues.push({ objectId: key, message: `${name}: unknown type.` });
    if (![o.x, o.y, o.w, o.h].every(finite)) {
      issues.push({ objectId: key, message: `${name}: position and size must be numbers.` });
    } else if (o.w <= 0 || o.h <= 0) {
      issues.push({ objectId: key, message: `${name}: width and height must be greater than 0.` });
    }
    if (!ROTATIONS.includes(o.rotation)) {
      issues.push({ objectId: key, message: `${name}: rotation must be 0, 90, 180, or 270.` });
    }
    if (!LABEL_POSITIONS.includes(o.labelPosition)) {
      issues.push({ objectId: key, message: `${name}: invalid label position.` });
    }
    if (!STATUSES.includes(o.status)) issues.push({ objectId: key, message: `${name}: invalid status.` });
    if (o.door && !DOOR_STYLES.includes(o.door.style)) {
      issues.push({ objectId: key, message: `${name}: invalid door style.` });
    }
    if (!o.name?.trim()) issues.push({ objectId: key, message: `${o.code}: name is empty.` });
    const prior = codes.get(o.code);
    if (prior) issues.push({ objectId: key, message: `Code ${o.code} is used more than once.` });
    codes.set(o.code, key);
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const OBJECT_FIELDS: (keyof MapObject)[] = [
  "id",
  "code",
  "kind",
  "name",
  "shortLabel",
  "description",
  "zone",
  "x",
  "y",
  "w",
  "h",
  "rotation",
  "labelPosition",
  "locked",
  "status",
  "grouped",
  "example",
  "photoPath",
  "door",
  "wall",
];

const round = (n: number) => Math.round(n * 100) / 100;

/** Compact, Firestore-safe object record (no undefined values, rounded geometry). */
export function serializeObject(o: MapObject): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of OBJECT_FIELDS) {
    const v = o[f];
    if (v === undefined || v === null || v === "" || v === false) continue;
    out[f] = typeof v === "number" ? round(v) : v;
  }
  return out;
}

export function serializeLayout(layout: Layout): Record<string, unknown> {
  const objects: Record<string, unknown> = {};
  for (const [id, o] of Object.entries(layout.objects)) objects[id] = serializeObject(o);
  return {
    name: layout.name,
    schemaVersion: SCHEMA_VERSION,
    revision: layout.revision,
    coordinateUnits: "arbitrary",
    width: layout.width,
    height: layout.height,
    verificationStatus: layout.verificationStatus,
    objects,
  };
}

export function deserializeObject(id: string, raw: Record<string, unknown>): MapObject {
  return {
    id,
    code: String(raw.code ?? id),
    kind: raw.kind as ObjectKind,
    name: String(raw.name ?? ""),
    shortLabel: (raw.shortLabel as string) || undefined,
    description: (raw.description as string) || undefined,
    zone: (raw.zone as string) || undefined,
    x: Number(raw.x),
    y: Number(raw.y),
    w: Number(raw.w),
    h: Number(raw.h),
    rotation: (Number(raw.rotation ?? 0) as Rotation),
    labelPosition: ((raw.labelPosition as LabelPosition) ?? "center"),
    locked: Boolean(raw.locked) || undefined,
    status: ((raw.status as VerificationStatus) ?? "draft"),
    grouped: Boolean(raw.grouped) || undefined,
    example: Boolean(raw.example) || undefined,
    photoPath: (raw.photoPath as string) || undefined,
    door: raw.door as MapObject["door"],
    wall: raw.wall as MapObject["wall"],
  };
}

export function deserializeLayout(
  id: string,
  raw: Record<string, unknown>,
  meta: { updatedAt?: number | null; updatedBy?: string | null } = {},
): Layout {
  const rawObjects = (raw.objects ?? {}) as Record<string, Record<string, unknown>>;
  const objects: Record<string, MapObject> = {};
  for (const [key, o] of Object.entries(rawObjects)) objects[key] = deserializeObject(key, o);
  return {
    id,
    name: String(raw.name ?? "Shop layout"),
    schemaVersion: Number(raw.schemaVersion ?? SCHEMA_VERSION),
    revision: Number(raw.revision ?? 0),
    coordinateUnits: "arbitrary",
    width: Number(raw.width),
    height: Number(raw.height),
    verificationStatus: (raw.verificationStatus as VerificationStatus) ?? "draft",
    objects,
    updatedAt: meta.updatedAt ?? null,
    updatedBy: meta.updatedBy ?? null,
  };
}

export function serializeLocation(l: StorageLocation): Record<string, unknown> {
  const out: Record<string, unknown> = {
    parentId: l.parentId,
    mapObjectId: l.mapObjectId,
    kind: l.kind,
    label: l.label,
    code: l.code,
    sortOrder: l.sortOrder,
    diagramPosition: l.diagramPosition,
    archived: l.archived,
    compartments: l.compartments ?? null,
  };
  if (l.example) out.example = true;
  return out;
}

export function deserializeLocation(id: string, raw: Record<string, unknown>): StorageLocation {
  return {
    id,
    parentId: (raw.parentId as string | null) ?? null,
    mapObjectId: (raw.mapObjectId as string | null) ?? null,
    kind: raw.kind as StorageLocation["kind"],
    label: String(raw.label ?? ""),
    code: String(raw.code ?? ""),
    sortOrder: Number(raw.sortOrder ?? 0),
    diagramPosition: (raw.diagramPosition as StorageLocation["diagramPosition"]) ?? null,
    archived: Boolean(raw.archived),
    compartments: (raw.compartments as StorageLocation["compartments"]) ?? null,
    example: Boolean(raw.example) || undefined,
  };
}

/** Content comparison used to detect unsaved changes. Ignores revision metadata. */
export function documentsEqual(a: ShopDocument, b: ShopDocument): boolean {
  if (a === b) return true;
  const content = (d: ShopDocument) => {
    const l = serializeLayout(d.layout);
    const objects = l.objects as Record<string, unknown>;
    return JSON.stringify({
      ...l,
      revision: 0,
      objects: Object.keys(objects)
        .sort()
        .map((k) => [k, objects[k]]),
    });
  };
  return content(a) === content(b) && JSON.stringify(sortedLocations(a)) === JSON.stringify(sortedLocations(b));
}

function sortedLocations(d: ShopDocument) {
  return Object.keys(d.locations)
    .sort()
    .map((k) => [k, serializeLocation(d.locations[k])]);
}

/** IDs of locations that differ between `base` and `next` (new or changed). */
export function changedLocationIds(base: ShopDocument, next: ShopDocument): string[] {
  return Object.keys(next.locations).filter((id) => {
    const a = base.locations[id];
    const b = next.locations[id];
    return !a || JSON.stringify(serializeLocation(a)) !== JSON.stringify(serializeLocation(b));
  });
}
