export const SCHEMA_VERSION = 1;

export type Rotation = 0 | 90 | 180 | 270;

export type ObjectKind =
  | "machine"
  | "storage"
  | "workbench"
  | "wall"
  | "door"
  | "feature"
  | "label";

export type LayerId = "room" | "machines" | "storage" | "workbenches" | "labels";

export type LabelPosition = "center" | "above" | "below" | "left" | "right" | "hidden";

export type VerificationStatus = "draft" | "verified";

/** swing doors draw a hinge arc; roll-up and opening draw a dashed threshold. */
export type DoorStyle = "swing-left" | "swing-right" | "double" | "rollup" | "opening";

export type WallStyle = "solid" | "glass";

/**
 * A footprint on the floor plan. Geometry is in layout (world) units.
 * `x`/`y` is the footprint center; `w` runs along the object's local x axis
 * and `h` along its local y axis before rotation. For storage, the local
 * +y edge (bottom before rotation) is the access/front face.
 */
export interface MapObject {
  id: string;
  code: string;
  kind: ObjectKind;
  name: string;
  shortLabel?: string;
  description?: string;
  zone?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: Rotation;
  labelPosition: LabelPosition;
  locked?: boolean;
  status: VerificationStatus;
  /** Footprint stands for an uncertain number of similar units. */
  grouped?: boolean;
  /** Explicitly labeled example content, never real shop data. */
  example?: boolean;
  photoPath?: string | null;
  door?: { style: DoorStyle };
  wall?: { style: WallStyle };
}

export interface Layout {
  id: string;
  name: string;
  schemaVersion: number;
  revision: number;
  coordinateUnits: "arbitrary";
  width: number;
  height: number;
  verificationStatus: VerificationStatus;
  objects: Record<string, MapObject>;
  updatedAt?: number | null;
  updatedBy?: string | null;
}

export type LocationKind = "unit" | "drawer" | "shelf" | "cubby" | "bin" | "box" | "slot";

export type StorageType = "cabinet" | "shelf" | "cubby" | "binRack" | "toolRack";

/** What sits inside a compartment (a cubby, shelf, drawer, or bin). */
export type ContentsType = "singleBin" | "binGrid" | "boxGrid" | "drawerStack";

export interface DiagramPosition {
  row: number;
  col: number;
}

/** How a location's direct children are arranged in its front-elevation diagram. */
export interface CompartmentLayout {
  type: StorageType | ContentsType;
  rows: number;
  cols: number;
}

export interface StorageLocation {
  id: string;
  parentId: string | null;
  mapObjectId: string | null;
  kind: LocationKind;
  label: string;
  code: string;
  sortOrder: number;
  diagramPosition: DiagramPosition | null;
  archived: boolean;
  compartments?: CompartmentLayout | null;
  example?: boolean;
  updatedAt?: number | null;
}

export type LocationMap = Record<string, StorageLocation>;

/** Everything an admin edits in one session and saves atomically. */
export interface ShopDocument {
  layout: Layout;
  locations: LocationMap;
}

/** Future inventory record. Not used by milestone-one screens. */
export interface InventoryItem {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  homeLocationId: string | null;
  photoPath: string | null;
  notes: string;
  archived: boolean;
  updatedAt?: number | null;
}

export type Role = "admin" | "member";

export interface Selection {
  objectId: string | null;
  locationId: string | null;
}

export const LAYERS: { id: LayerId; label: string }[] = [
  { id: "room", label: "Room" },
  { id: "machines", label: "Machines" },
  { id: "storage", label: "Storage" },
  { id: "workbenches", label: "Workbenches" },
  { id: "labels", label: "Labels" },
];

export function layerOf(kind: ObjectKind): LayerId {
  switch (kind) {
    case "machine":
      return "machines";
    case "storage":
      return "storage";
    case "workbench":
      return "workbenches";
    case "label":
      return "labels";
    default:
      return "room";
  }
}

export const KIND_LABEL: Record<ObjectKind, string> = {
  machine: "Machine",
  storage: "Storage unit",
  workbench: "Workbench",
  wall: "Wall segment",
  door: "Door",
  feature: "Room feature",
  label: "Text label",
};

export const STORAGE_TYPE_LABEL: Record<StorageType, string> = {
  cabinet: "Drawer cabinet",
  shelf: "Shelving",
  cubby: "Cubby grid",
  binRack: "Bin rack",
  toolRack: "Tool rack",
};

export const LOCATION_KIND_LABEL: Record<LocationKind, string> = {
  unit: "Storage unit",
  drawer: "Drawer",
  shelf: "Shelf",
  cubby: "Cubby",
  bin: "Bin",
  box: "Box",
  slot: "Tool slot",
};

export const CONTENTS_LABEL: Record<ContentsType, string> = {
  singleBin: "One big bin",
  binGrid: "Bins",
  boxGrid: "Small boxes",
  drawerStack: "Drawers",
};

export const isStorageType = (t: string): t is StorageType => t in STORAGE_TYPE_LABEL;
