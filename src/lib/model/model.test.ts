import { describe, expect, it } from "vitest";
import { createHistory, commitFrom, pushHistory, redo, replacePresent, undo } from "./history";
import {
  createObject,
  deleteObject,
  deserializeLayout,
  deserializeLocation,
  documentsEqual,
  duplicateObject,
  serializeLayout,
  serializeLocation,
  updateObject,
  validateLayout,
} from "./layout";
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
  resolveMapObjectId,
  setParent,
  validateLocations,
  wouldCreateCycle,
} from "./locations";
import { createSeedDocument, EXAMPLE_REVEAL_LOCATION_ID } from "./seed";
import type { LocationMap, ShopDocument } from "./types";

const seed = () => createSeedDocument();

describe("undo/redo", () => {
  it("steps backward and forward through edits", () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe(3);
  });

  it("drops the redo stack after a new edit", () => {
    let h = pushHistory(pushHistory(createHistory("a"), "b"), "c");
    h = undo(h);
    h = pushHistory(h, "d");
    expect(h.future).toEqual([]);
    expect(redo(h).present).toBe("d");
  });

  it("records a whole drag as one step", () => {
    let h = createHistory(0);
    const base = h.present;
    for (const v of [1, 2, 3, 4]) h = replacePresent(h, v);
    h = commitFrom(h, base);
    expect(h.present).toBe(4);
    expect(h.past).toEqual([0]);
    expect(undo(h).present).toBe(0);
  });

  it("ignores a drag that ends where it started", () => {
    const h = createHistory(0);
    expect(commitFrom(h, h.present).past).toEqual([]);
  });
});

describe("serialization", () => {
  it("round-trips the layout and preserves every object ID", () => {
    const doc = seed();
    const raw = JSON.parse(JSON.stringify(serializeLayout(doc.layout)));
    const back = deserializeLayout(doc.layout.id, raw);
    expect(Object.keys(back.objects).sort()).toEqual(Object.keys(doc.layout.objects).sort());
    for (const [id, o] of Object.entries(back.objects)) expect(o.id).toBe(id);
    expect(documentsEqual({ ...doc, layout: back }, doc)).toBe(true);
  });

  it("round-trips locations with their IDs and parents", () => {
    const doc = seed();
    for (const l of Object.values(doc.locations)) {
      const back = deserializeLocation(l.id, JSON.parse(JSON.stringify(serializeLocation(l))));
      expect(back).toEqual({ ...l, updatedAt: undefined, example: l.example || undefined });
    }
  });

  it("writes no undefined values (Firestore rejects them)", () => {
    const raw = serializeLayout(seed().layout);
    const hasUndefined = (v: unknown): boolean =>
      v === undefined || (typeof v === "object" && v !== null && Object.values(v).some(hasUndefined));
    expect(hasUndefined(raw)).toBe(false);
  });

  it("keeps IDs stable through moves, renames, and duplicates", () => {
    let doc = seed();
    doc = updateObject(doc, "obj_haas", { x: 10, y: 20, name: "Haas (moved)", rotation: 90 });
    expect(doc.layout.objects.obj_haas.id).toBe("obj_haas");
    const copy = duplicateObject(doc.layout.objects, doc.layout.objects.obj_haas);
    expect(copy.id).not.toBe("obj_haas");
    expect(copy.code).not.toBe(doc.layout.objects.obj_haas.code);
    const created = createObject(doc.layout.objects, "machine", { x: 0, y: 0 });
    expect(created.id).toMatch(/^obj_[0-9a-z]{10}$/);
  });

  it("flags invalid geometry", () => {
    const doc = updateObject(seed(), "obj_haas", { w: 0, x: Number.NaN });
    const issues = validateLayout(doc.layout);
    expect(issues.some((i) => i.objectId === "obj_haas")).toBe(true);
    expect(validateLayout(seed().layout)).toEqual([]);
  });

  it("treats revision-only differences as unchanged", () => {
    const doc = seed();
    expect(documentsEqual(doc, { ...doc, layout: { ...doc.layout, revision: 9 } })).toBe(true);
  });
});

describe("location hierarchy", () => {
  it("resolves the parent chain, map object, and breadcrumb", () => {
    const doc = seed();
    const chain = resolveChain(doc.locations, EXAMPLE_REVEAL_LOCATION_ID);
    expect(chain.map((l) => l.kind)).toEqual(["unit", "drawer", "bin"]);
    expect(resolveMapObjectId(doc.locations, EXAMPLE_REVEAL_LOCATION_ID)).toBe("obj_example_cabinet");
    expect(breadcrumb(doc, EXAMPLE_REVEAL_LOCATION_ID)).toEqual(["Example area", "Example drawer cabinet", "Drawer D", "Bin 03"]);
  });

  it("detects and prevents cycles", () => {
    const doc = seed();
    expect(wouldCreateCycle(doc.locations, "loc_example_unit", "loc_example_d_bin01")).toBe(true);
    expect(() => setParent(doc.locations, "loc_example_drawer_d", "loc_example_d_bin03")).toThrow(/cycle/);
    const corrupted: LocationMap = {
      ...doc.locations,
      loc_example_unit: { ...doc.locations.loc_example_unit, parentId: "loc_example_drawer_a" },
    };
    expect(() => resolveChain(corrupted, "loc_example_drawer_a")).toThrow(/cycle/);
    expect(validateLocations({ ...doc, locations: corrupted }).length).toBeGreaterThan(0);
  });

  it("reports missing parents", () => {
    const doc = seed();
    const broken = { ...doc.locations, loc_x: { ...doc.locations.loc_example_d_bin01, id: "loc_x", parentId: "loc_missing" } };
    expect(() => resolveChain(broken, "loc_x")).toThrow(/does not exist/);
  });

  it("keeps compartment IDs when the cabinet moves on the map", () => {
    const doc = seed();
    const before = Object.keys(doc.locations).sort();
    const moved = updateObject(doc, "obj_example_cabinet", { x: 0, y: 0, rotation: 180 });
    expect(Object.keys(moved.locations).sort()).toEqual(before);
    expect(resolveMapObjectId(moved.locations, EXAMPLE_REVEAL_LOCATION_ID)).toBe("obj_example_cabinet");
  });

  it("renaming a drawer keeps descendants resolvable", () => {
    const doc = seed();
    const locations = renameLocation(doc.locations, "loc_example_drawer_d", "Fasteners");
    expect(resolveChain(locations, EXAMPLE_REVEAL_LOCATION_ID)[1].id).toBe("loc_example_drawer_d");
    expect(breadcrumb({ ...doc, locations }, EXAMPLE_REVEAL_LOCATION_ID)[2]).toBe("Fasteners");
  });

  it("deleting a map object archives its locations instead of removing them", () => {
    const doc = deleteObject(seed(), "obj_example_cabinet");
    expect(doc.layout.objects.obj_example_cabinet).toBeUndefined();
    expect(doc.locations[EXAMPLE_REVEAL_LOCATION_ID].archived).toBe(true);
    expect(doc.locations.loc_example_unit.archived).toBe(true);
  });
});

describe("compartment configuration", () => {
  const withCubbies = (): { doc: ShopDocument; unitId: string } => {
    const base = seed();
    const { doc, unit } = ensureUnit(base, base.layout.objects.obj_storage_cubbies);
    const r = configureCompartments(doc.locations, unit.id, { type: "cubby", rows: 2, cols: 3 });
    return { doc: { ...doc, locations: r.locations }, unitId: unit.id };
  };

  it("creates a grid with stable IDs and codes", () => {
    const { doc, unitId } = withCubbies();
    const cells = childrenOf(doc.locations, unitId);
    expect(cells).toHaveLength(6);
    expect(new Set(cells.map((c) => c.id)).size).toBe(6);
    expect(cells[0].code).toBe("S-03.A1");
    expect(cells[5].label).toBe("Cubby B3");
  });

  it("preserves existing IDs when the grid grows", () => {
    const { doc, unitId } = withCubbies();
    const before = new Map(childrenOf(doc.locations, unitId).map((c) => [`${c.diagramPosition!.row}:${c.diagramPosition!.col}`, c.id]));
    const r = configureCompartments(doc.locations, unitId, { type: "cubby", rows: 3, cols: 4 });
    const after = childrenOf(r.locations, unitId);
    expect(after).toHaveLength(12);
    for (const c of after) {
      const prior = before.get(`${c.diagramPosition!.row}:${c.diagramPosition!.col}`);
      if (prior) expect(c.id).toBe(prior);
    }
    expect(r.created).toHaveLength(6);
  });

  it("archives, never deletes, compartments that fall outside a smaller grid", () => {
    const { doc, unitId } = withCubbies();
    const all = childrenOf(doc.locations, unitId).map((c) => c.id);
    const shrunk = configureCompartments(doc.locations, unitId, { type: "cubby", rows: 1, cols: 2 });
    expect(shrunk.archived).toHaveLength(4);
    for (const id of all) expect(shrunk.locations[id]).toBeDefined();
    const regrown = configureCompartments(shrunk.locations, unitId, { type: "cubby", rows: 2, cols: 3 });
    expect(regrown.restored.sort()).toEqual(shrunk.archived.sort());
    expect(regrown.created).toHaveLength(0);
  });

  it("keeps edited labels through reconfiguration", () => {
    const { doc, unitId } = withCubbies();
    const first = childrenOf(doc.locations, unitId)[0];
    const renamed = renameLocation(doc.locations, first.id, "Zip ties");
    const r = configureCompartments(renamed, unitId, { type: "cubby", rows: 4, cols: 4 });
    expect(r.locations[first.id].label).toBe("Zip ties");
  });

  it("adds, reorders, and archives drawers without changing other IDs", () => {
    const doc = seed();
    const unit = "loc_example_unit";
    const ids = childrenOf(doc.locations, unit).map((d) => d.id);
    let locations = addDrawer(doc.locations, unit);
    expect(childrenOf(locations, unit)).toHaveLength(5);
    locations = moveDrawer(locations, unit, ids[3], -1);
    expect(childrenOf(locations, unit)[2].id).toBe(ids[3]);
    locations = removeDrawer(locations, unit, ids[0]);
    expect(locations[ids[0]].archived).toBe(true);
    expect(childrenOf(locations, unit).map((d) => d.diagramPosition!.row)).toEqual([0, 1, 2, 3]);
    expect(resolveChain(locations, EXAMPLE_REVEAL_LOCATION_ID)[1].id).toBe("loc_example_drawer_d");
  });
});
