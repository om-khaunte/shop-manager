import { describe, expect, it } from "vitest";
import { configureCompartments, childrenOf, ensureUnit, renameLocation } from "./model/locations";
import { createSeedDocument } from "./model/seed";
import { searchShop } from "./search";
import type { ShopDocument } from "./model/types";

function withSandpaper(): { doc: ShopDocument; drawerId: string } {
  const base = createSeedDocument();
  const { doc, unit } = ensureUnit(base, base.layout.objects.obj_storage_cubbies);
  let locs = configureCompartments(doc.locations, unit.id, { type: "cubby", rows: 2, cols: 2 }).locations;
  const cubby = childrenOf(locs, unit.id)[1];
  locs = configureCompartments(locs, cubby.id, { type: "drawerStack", rows: 3, cols: 1 }).locations;
  const drawer = childrenOf(locs, cubby.id)[1];
  locs = renameLocation(locs, drawer.id, "Sandpaper");
  return { doc: { ...doc, locations: locs }, drawerId: drawer.id };
}

describe("search", () => {
  it("finds the exact drawer inside a cubby and reports its path", () => {
    const { doc, drawerId } = withSandpaper();
    const [first] = searchShop(doc, "sandpaper");
    expect(first).toMatchObject({ type: "location", id: drawerId });
    expect(first.type === "location" && first.path).toEqual(["Left wall", "Wall cubbies", "Cubby A2", "Sandpaper"]);
  });

  it("matches words across the path", () => {
    const { doc, drawerId } = withSandpaper();
    expect(searchShop(doc, "cubby sandpaper")[0].id).toBe(drawerId);
    expect(searchShop(doc, "sandpaper zzz")).toEqual([]);
  });

  it("still finds map objects and ignores archived compartments", () => {
    const { doc, drawerId } = withSandpaper();
    expect(searchShop(doc, "haas")[0]).toMatchObject({ type: "object", id: "obj_haas" });
    const archived = { ...doc, locations: { ...doc.locations, [drawerId]: { ...doc.locations[drawerId], archived: true } } };
    expect(searchShop(archived, "sandpaper").some((r) => r.id === drawerId)).toBe(false);
  });
});
