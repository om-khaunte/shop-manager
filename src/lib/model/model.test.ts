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
  applyContentsToSiblings,
  breadcrumb,
  childrenOf,
  clearCompartments,
  configureCompartments,
  descendantIds,
  ensureUnit,
  moveCompartmentInto,
  moveDrawer,
  moveIntoProblem,
  swapCompartments,
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

  it("sets per-cubby contents and switches kinds without losing IDs or custom labels", () => {
    const { doc, unitId } = withCubbies();
    const cubby = childrenOf(doc.locations, unitId)[0];
    const bins = configureCompartments(doc.locations, cubby.id, { type: "binGrid", rows: 1, cols: 3 });
    const binIds = childrenOf(bins.locations, cubby.id).map((b) => b.id);
    expect(childrenOf(bins.locations, cubby.id).map((b) => b.label)).toEqual(["Bin 01", "Bin 02", "Bin 03"]);
    const named = renameLocation(bins.locations, binIds[1], "M3 screws");

    const boxes = configureCompartments(named, cubby.id, { type: "boxGrid", rows: 1, cols: 3 });
    const after = childrenOf(boxes.locations, cubby.id);
    expect(after.map((b) => b.id)).toEqual(binIds);
    expect(after.map((b) => b.kind)).toEqual(["box", "box", "box"]);
    expect(after.map((b) => b.label)).toEqual(["Box 01", "M3 screws", "Box 03"]);
  });

  it("forces a single big bin to one compartment", () => {
    const { doc, unitId } = withCubbies();
    const cubby = childrenOf(doc.locations, unitId)[0];
    const r = configureCompartments(doc.locations, cubby.id, { type: "singleBin", rows: 4, cols: 4 });
    const inside = childrenOf(r.locations, cubby.id);
    expect(inside).toHaveLength(1);
    expect(inside[0]).toMatchObject({ kind: "bin", label: "Bin", code: "S-03.A1.01" });
    expect(r.locations[cubby.id].compartments).toEqual({ type: "singleBin", rows: 1, cols: 1 });
  });

  it("empties a cubby by archiving its contents, and restores them when contents return", () => {
    const { doc, unitId } = withCubbies();
    const cubby = childrenOf(doc.locations, unitId)[0];
    const boxes = configureCompartments(doc.locations, cubby.id, { type: "boxGrid", rows: 2, cols: 2 });
    const ids = childrenOf(boxes.locations, cubby.id).map((b) => b.id);
    const cleared = clearCompartments(boxes.locations, cubby.id);
    expect(cleared.archived.sort()).toEqual([...ids].sort());
    expect(cleared.locations[cubby.id].compartments).toBeNull();
    for (const id of ids) expect(cleared.locations[id].archived).toBe(true);
    const back = configureCompartments(cleared.locations, cubby.id, { type: "boxGrid", rows: 2, cols: 2 });
    expect(back.restored.sort()).toEqual([...ids].sort());
    expect(back.created).toHaveLength(0);
  });

  it("copies one cubby's contents to its siblings with separate IDs", () => {
    const { doc, unitId } = withCubbies();
    const [first, ...rest] = childrenOf(doc.locations, unitId);
    const set = configureCompartments(doc.locations, first.id, { type: "drawerStack", rows: 3, cols: 5 });
    expect(set.locations[first.id].compartments).toEqual({ type: "drawerStack", rows: 3, cols: 1 });
    const r = applyContentsToSiblings(set.locations, first.id);
    const seen = new Set<string>();
    for (const sib of rest) {
      expect(r.locations[sib.id].compartments).toEqual({ type: "drawerStack", rows: 3, cols: 1 });
      const drawers = childrenOf(r.locations, sib.id);
      expect(drawers.map((d) => d.label)).toEqual(["Drawer 1", "Drawer 2", "Drawer 3"]);
      for (const d of drawers) seen.add(d.id);
    }
    expect(seen.size).toBe(rest.length * 3);
    expect(validateLocations({ ...doc, locations: r.locations })).toEqual([]);
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

describe("moving compartments", () => {
  /** A cubby wall where cubby 0 holds two labelled drawers and cubby 1 holds one. */
  const setup = () => {
    const base = seed();
    const { doc, unit } = ensureUnit(base, base.layout.objects.obj_storage_cubbies);
    let locs = configureCompartments(doc.locations, unit.id, { type: "cubby", rows: 2, cols: 3 }).locations;
    const [c0, c1] = childrenOf(locs, unit.id);
    locs = configureCompartments(locs, c0.id, { type: "drawerStack", rows: 2, cols: 1 }).locations;
    locs = configureCompartments(locs, c1.id, { type: "drawerStack", rows: 1, cols: 1 }).locations;
    const [d0, d1] = childrenOf(locs, c0.id);
    locs = renameLocation(locs, d0.id, "Sandpaper");
    const bins = configureCompartments(locs, d0.id, { type: "binGrid", rows: 1, cols: 2 });
    locs = bins.locations;
    return { doc: { ...doc, locations: locs }, unitId: unit.id, c0, c1, d0, d1, inner: childrenOf(locs, d0.id) };
  };

  it("moves a drawer into another cubby, keeping its ID, label, and everything inside", () => {
    const { doc, c0, c1, d0, d1, inner } = setup();
    const next = moveCompartmentInto(doc.locations, d0.id, c1.id);
    expect(next[d0.id]).toMatchObject({ parentId: c1.id, label: "Sandpaper", archived: false });
    expect(childrenOf(next, c1.id).map((d) => d.id)).toContain(d0.id);
    expect(next[c1.id].compartments).toEqual({ type: "drawerStack", rows: 2, cols: 1 });
    // The bins inside came along with the same IDs.
    expect(childrenOf(next, d0.id).map((b) => b.id)).toEqual(inner.map((b) => b.id));
    // Codes follow the new location.
    expect(next[d0.id].code.startsWith(`${next[c1.id].code}.`)).toBe(true);
    for (const b of childrenOf(next, d0.id)) expect(b.code.startsWith(`${next[d0.id].code}.`)).toBe(true);
    // The old cubby closes the gap and keeps its other drawer.
    expect(childrenOf(next, c0.id).map((d) => d.id)).toEqual([d1.id]);
    expect(next[d1.id].diagramPosition).toEqual({ row: 0, col: 0 });
    expect(next[c0.id].compartments?.rows).toBe(1);
    expect(validateLocations({ ...doc, locations: next })).toEqual([]);
  });

  it("sets up an empty cubby as a drawer stack when a drawer moves in", () => {
    const { doc, unitId, d0 } = setup();
    const empty = childrenOf(doc.locations, unitId)[2];
    const next = moveCompartmentInto(doc.locations, d0.id, empty.id);
    expect(next[empty.id].compartments).toEqual({ type: "drawerStack", rows: 1, cols: 1 });
    expect(next[d0.id].parentId).toBe(empty.id);
  });

  it("empties a cubby when its last drawer leaves", () => {
    const { doc, c1, d0 } = setup();
    const only = childrenOf(doc.locations, c1.id)[0];
    const next = moveCompartmentInto(doc.locations, only.id, d0.parentId!);
    expect(next[c1.id].compartments).toBeNull();
    expect(next[only.id].parentId).toBe(d0.parentId);
  });

  it("refuses moves that make no sense, with a reason", () => {
    const { doc, c0, c1, d0, inner } = setup();
    expect(moveIntoProblem(doc.locations, d0.id, inner[0].id)).toMatch(/inside itself|can't hold/);
    expect(moveIntoProblem(doc.locations, d0.id, c0.id)).toMatch(/already in/);
    expect(moveIntoProblem(doc.locations, inner[0].id, c1.id)).toMatch(/holds drawers/);
    expect(() => moveCompartmentInto(doc.locations, c0.id, d0.id)).toThrow();
  });

  it("swaps two cubbies with their contents", () => {
    const { doc, unitId, c0, c1, d0 } = setup();
    const next = swapCompartments(doc.locations, c0.id, c1.id);
    expect(next[c0.id].diagramPosition).toEqual(doc.locations[c1.id].diagramPosition);
    expect(next[c1.id].diagramPosition).toEqual(doc.locations[c0.id].diagramPosition);
    expect(next[c0.id].code).toBe(doc.locations[c1.id].code);
    expect(next[c1.id].code).toBe(doc.locations[c0.id].code);
    // Contents stay with their cubby, under the cubby's new code.
    expect(next[d0.id].parentId).toBe(c0.id);
    expect(next[d0.id].code.startsWith(`${next[c0.id].code}.`)).toBe(true);
    expect(new Set(childrenOf(next, unitId).map((c) => c.id)).size).toBe(6);
    expect(validateLocations({ ...doc, locations: next })).toEqual([]);
  });
});

describe("resizing a grid never makes two compartments look alike", () => {
  const cubbyWithBins = (rows: number, cols: number, type: "binGrid" | "boxGrid" = "binGrid") => {
    const base = seed();
    const { doc, unit } = ensureUnit(base, base.layout.objects.obj_storage_cubbies);
    let locs = configureCompartments(doc.locations, unit.id, { type: "cubby", rows: 2, cols: 3 }).locations;
    const cubby = childrenOf(locs, unit.id)[0];
    locs = configureCompartments(locs, cubby.id, { type, rows, cols }).locations;
    return { doc: { ...doc, locations: locs }, cubby };
  };
  const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

  it("keeps labels and codes unique when columns are added", () => {
    const { doc, cubby } = cubbyWithBins(2, 3);
    const before = childrenOf(doc.locations, cubby.id);
    const grown = configureCompartments(doc.locations, cubby.id, { type: "binGrid", rows: 2, cols: 4 }).locations;
    const after = childrenOf(grown, cubby.id);
    expect(after).toHaveLength(8);
    expect(dupes(after.map((c) => c.label))).toEqual([]);
    expect(dupes(after.map((c) => c.code))).toEqual([]);
    // Same cell, same compartment.
    for (const b of before) expect(grown[b.id].diagramPosition).toEqual(b.diagramPosition);
  });

  it("keeps labels and codes unique when columns are removed and restored", () => {
    const { doc, cubby } = cubbyWithBins(2, 4);
    const narrow = configureCompartments(doc.locations, cubby.id, { type: "binGrid", rows: 2, cols: 2 }).locations;
    const back = configureCompartments(narrow, cubby.id, { type: "binGrid", rows: 2, cols: 4 }).locations;
    const after = childrenOf(back, cubby.id);
    expect(dupes(after.map((c) => c.label))).toEqual([]);
    expect(dupes(after.map((c) => c.code))).toEqual([]);
  });

  it("never renames a label the user typed", () => {
    const { doc, cubby } = cubbyWithBins(2, 3);
    const target = childrenOf(doc.locations, cubby.id)[4];
    const named = renameLocation(doc.locations, target.id, "Sandpaper 80 grit");
    const grown = configureCompartments(named, cubby.id, { type: "binGrid", rows: 3, cols: 4 }).locations;
    expect(grown[target.id].label).toBe("Sandpaper 80 grit");
  });

  it("does not leave the same cell holding two active compartments", () => {
    const { doc, cubby } = cubbyWithBins(2, 3);
    const grown = configureCompartments(doc.locations, cubby.id, { type: "binGrid", rows: 4, cols: 2 }).locations;
    const cells = childrenOf(grown, cubby.id).map((c) => `${c.diagramPosition!.row}:${c.diagramPosition!.col}`);
    expect(dupes(cells)).toEqual([]);
  });
});

describe("editing one cubby never touches another", () => {
  const setup = () => {
    const base = seed();
    const { doc, unit } = ensureUnit(base, base.layout.objects.obj_storage_cubbies);
    let locs = configureCompartments(doc.locations, unit.id, { type: "cubby", rows: 3, cols: 3 }).locations;
    // Every cubby gets contents, then the unit grid grows (rows and columns).
    for (const c of childrenOf(locs, unit.id)) locs = configureCompartments(locs, c.id, { type: "binGrid", rows: 2, cols: 2 }).locations;
    locs = configureCompartments(locs, unit.id, { type: "cubby", rows: 5, cols: 4 }).locations;
    const byLabel = (l: string) => Object.values(locs).find((x) => x.label === l && x.parentId === unit.id)!;
    return { locs, unit, byLabel };
  };
  const subtree = (locs: LocationMap, id: string) => new Set([id, ...descendantIds(locs, id)]);
  const changed = (a: LocationMap, b: LocationMap) => Object.keys({ ...a, ...b }).filter((id) => JSON.stringify(a[id]) !== JSON.stringify(b[id]));

  it("gives every compartment a distinct id, code, and cell", () => {
    const { locs, unit } = setup();
    const kids = childrenOf(locs, unit.id);
    expect(new Set(kids.map((k) => k.id)).size).toBe(kids.length);
    expect(new Set(kids.map((k) => k.code)).size).toBe(kids.length);
    expect(new Set(kids.map((k) => `${k.diagramPosition!.row}:${k.diagramPosition!.col}`)).size).toBe(kids.length);
    const all = Object.values(locs).filter((l) => !l.archived);
    expect(new Set(all.map((l) => l.code)).size).toBe(all.length);
  });

  it("only changes C2's own contents when C2 is configured, resized, or cleared", () => {
    const { locs, byLabel } = setup();
    const c2 = byLabel("Cubby C2");
    const inside = subtree(locs, c2.id);
    const ops: Record<string, (l: LocationMap) => LocationMap> = {
      boxes: (l) => configureCompartments(l, c2.id, { type: "boxGrid", rows: 3, cols: 3 }).locations,
      bigger: (l) => configureCompartments(l, c2.id, { type: "binGrid", rows: 4, cols: 5 }).locations,
      drawers: (l) => configureCompartments(l, c2.id, { type: "drawerStack", rows: 3, cols: 1 }).locations,
      single: (l) => configureCompartments(l, c2.id, { type: "singleBin", rows: 1, cols: 1 }).locations,
      clear: (l) => clearCompartments(l, c2.id).locations,
      rename: (l) => renameLocation(l, c2.id, "Sandpaper", "S-03.C2"),
    };
    for (const [name, op] of Object.entries(ops)) {
      const out = op(locs);
      const insideAfter = subtree(out, c2.id);
      const outside = changed(locs, out).filter((id) => !inside.has(id) && !insideAfter.has(id));
      expect(outside, `op ${name} changed ${outside.join(",")}`).toEqual([]);
    }
  });

  it("only changes the bin that was edited", () => {
    const { locs, byLabel } = setup();
    const c2 = byLabel("Cubby C2");
    const [b1, b2] = childrenOf(locs, c2.id);
    const out = renameLocation(locs, b2.id, "M3 screws");
    expect(changed(locs, out)).toEqual([b2.id]);
    const emptied = configureCompartments(locs, c2.id, { type: "binGrid", rows: 2, cols: 2 }).locations;
    expect(changed(locs, emptied)).toEqual([]);
    expect(locs[b1.id].label).toBe(emptied[b1.id].label);
  });
});

describe("repairing duplicates saved by older versions", () => {
  it("renumbers repeated default labels and codes, and keeps typed ones", () => {
    const base = seed();
    const { doc, unit } = ensureUnit(base, base.layout.objects.obj_storage_cubbies);
    let locs = configureCompartments(doc.locations, unit.id, { type: "cubby", rows: 1, cols: 2 }).locations;
    const cubby = childrenOf(locs, unit.id)[0];
    locs = configureCompartments(locs, cubby.id, { type: "binGrid", rows: 2, cols: 4 }).locations;
    const bins = childrenOf(locs, cubby.id);
    // Old behaviour: bin at (1,0) kept "Bin 04" / ".04" while (0,3) also has them.
    locs = { ...locs, [bins[4].id]: { ...locs[bins[4].id], label: "Bin 04", code: `${cubby.code}.04` } };
    locs = renameLocation(locs, bins[7].id, "Bin 04"); // typed by the user? still a duplicate default look
    const healed = configureCompartments(locs, cubby.id, { type: "binGrid", rows: 2, cols: 4 }).locations;
    const after = childrenOf(healed, cubby.id);
    expect(new Set(after.map((b) => b.code)).size).toBe(after.length);
    expect(new Set(after.map((b) => b.label)).size).toBe(after.length);
    // A name the user really typed is never touched.
    const typed = renameLocation(healed, after[2].id, "Sandpaper");
    const again = configureCompartments(typed, cubby.id, { type: "binGrid", rows: 2, cols: 4 }).locations;
    expect(again[after[2].id].label).toBe("Sandpaper");
  });
});
