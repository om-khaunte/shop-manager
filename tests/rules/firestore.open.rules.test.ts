import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { serializeLayout, serializeLocation } from "../../src/lib/model/layout";
import { createSeedDocument } from "../../src/lib/model/seed";

const SHOP = "shop-114";
let env: RulesTestEnvironment;

const seed = createSeedDocument();
const layoutData = (revision: number, overrides: Record<string, unknown> = {}) => ({
  ...serializeLayout({ ...seed.layout, revision }),
  updatedAt: serverTimestamp(),
  updatedBy: "anon-1234abcd",
  ...overrides,
});
const locationData = (overrides: Record<string, unknown> = {}) => ({
  ...serializeLocation(seed.locations.loc_example_drawer_a),
  updatedAt: serverTimestamp(),
  ...overrides,
});

const anyone = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-114-shop",
    firestore: { rules: readFileSync(resolve(__dirname, "../../firestore.open.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const seedLayout = (revision: number) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "shops", SHOP, "layouts", "main"), {
      ...serializeLayout({ ...seed.layout, revision }),
      updatedAt: new Date(),
      updatedBy: "anon-first",
    });
  });

describe("open access rules", () => {
  it("lets anyone create the first layout, locations, and shop pointer without signing in", async () => {
    const db = anyone();
    await assertSucceeds(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(1)));
    await assertSucceeds(setDoc(doc(db, "shops", SHOP, "locations", "loc_example_drawer_a"), locationData()));
    await assertSucceeds(setDoc(doc(db, "shops", SHOP), { activeLayoutId: "main" }, { merge: true }));
    await assertSucceeds(getDoc(doc(db, "shops", SHOP, "layouts", "main")));
  });

  it("requires each save to advance the revision by exactly one", async () => {
    await seedLayout(3);
    const db = anyone();
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(3)));
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(5)));
    await assertSucceeds(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(4)));
  });

  it("rejects malformed layouts and locations", async () => {
    const db = anyone();
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(1, { coordinateUnits: "feet" })));
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(1, { extra: true })));
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(1, { updatedAt: new Date(0) })));
    await assertFails(setDoc(doc(db, "shops", SHOP, "locations", "x"), locationData({ kind: "spaceship" })));
    await assertFails(setDoc(doc(db, "shops", SHOP), { activeLayoutId: "main", owner: "me" }));
  });

  it("never allows deletes", async () => {
    await seedLayout(1);
    const db = anyone();
    await assertFails(deleteDoc(doc(db, "shops", SHOP, "layouts", "main")));
    await assertFails(deleteDoc(doc(db, "shops", SHOP)));
  });

  it("is limited to shop-114 and keeps membership and items locked", async () => {
    const db = anyone();
    await assertFails(getDoc(doc(db, "shops", "other-shop")));
    await assertFails(setDoc(doc(db, "shops", "other-shop", "layouts", "main"), layoutData(1)));
    await assertFails(setDoc(doc(db, "shops", SHOP, "members", "anon-1234abcd"), { role: "admin" }));
    await assertFails(getDoc(doc(db, "shops", SHOP, "members", "anon-1234abcd")));
    await assertFails(setDoc(doc(db, "shops", SHOP, "items", "i1"), { name: "drill" }));
    await assertFails(getDoc(doc(db, "other", "x")));
  });
});
