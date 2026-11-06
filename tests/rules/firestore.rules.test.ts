import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { serializeLayout, serializeLocation } from "../../src/lib/model/layout";
import { createSeedDocument } from "../../src/lib/model/seed";

const SHOP = "shop-114";
let env: RulesTestEnvironment;

const seed = createSeedDocument();
const layoutData = (revision: number, uid: string) => ({
  ...serializeLayout({ ...seed.layout, revision }),
  updatedAt: serverTimestamp(),
  updatedBy: uid,
});
const locationData = () => ({ ...serializeLocation(seed.locations.loc_example_drawer_a), updatedAt: serverTimestamp() });

const as = (uid: string | null): Firestore =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-114-shop",
    firestore: { rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "shops", SHOP), { name: "Room 114", activeLayoutId: "main" });
    await setDoc(doc(db, "shops", SHOP, "members", "admin1"), { role: "admin" });
    await setDoc(doc(db, "shops", SHOP, "members", "admin2"), { role: "admin" });
    await setDoc(doc(db, "shops", SHOP, "members", "member1"), { role: "member" });
    await setDoc(doc(db, "shops", SHOP, "layouts", "main"), { ...serializeLayout({ ...seed.layout, revision: 1 }), updatedAt: new Date(), updatedBy: "admin1" });
    await setDoc(doc(db, "shops", SHOP, "locations", "loc_example_drawer_a"), { ...serializeLocation(seed.locations.loc_example_drawer_a), updatedAt: new Date() });
  });
});

describe("reading", () => {
  it("lets members read the shop, layout, and locations", async () => {
    const db = as("member1");
    await assertSucceeds(getDoc(doc(db, "shops", SHOP)));
    await assertSucceeds(getDoc(doc(db, "shops", SHOP, "layouts", "main")));
    await assertSucceeds(getDoc(doc(db, "shops", SHOP, "locations", "loc_example_drawer_a")));
  });

  it("denies signed-out users and non-members", async () => {
    await assertFails(getDoc(doc(as(null), "shops", SHOP, "layouts", "main")));
    await assertFails(getDoc(doc(as("stranger"), "shops", SHOP, "layouts", "main")));
    await assertFails(getDoc(doc(as("stranger"), "shops", SHOP)));
  });

  it("lets a non-member read only their own (missing) membership doc", async () => {
    await assertSucceeds(getDoc(doc(as("stranger"), "shops", SHOP, "members", "stranger")));
    await assertFails(getDoc(doc(as("stranger"), "shops", SHOP, "members", "admin1")));
  });

  it("denies unknown collections by default", async () => {
    await assertFails(getDoc(doc(as("admin1"), "other", "x")));
    await assertFails(setDoc(doc(as("admin1"), "shops", SHOP, "secrets", "x"), { a: 1 }));
  });
});

describe("layout writes", () => {
  it("allows an admin to save the next revision", async () => {
    await assertSucceeds(setDoc(doc(as("admin1"), "shops", SHOP, "layouts", "main"), layoutData(2, "admin1")));
  });

  it("denies members, including direct writes", async () => {
    const db = as("member1");
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(2, "member1")));
    await assertFails(updateDoc(doc(db, "shops", SHOP, "layouts", "main"), { name: "hacked" }));
    await assertFails(deleteDoc(doc(db, "shops", SHOP, "layouts", "main")));
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "other"), layoutData(1, "member1")));
  });

  it("rejects stale or skipped revisions", async () => {
    const db = as("admin1");
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(1, "admin1")));
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(5, "admin1")));
  });

  it("lets only one of two concurrent saves from the same revision win", async () => {
    await assertSucceeds(setDoc(doc(as("admin1"), "shops", SHOP, "layouts", "main"), layoutData(2, "admin1")));
    await assertFails(setDoc(doc(as("admin2"), "shops", SHOP, "layouts", "main"), layoutData(2, "admin2")));
  });

  it("supports the client's transactional save", async () => {
    const db = as("admin1");
    const ref = doc(db, "shops", SHOP, "layouts", "main");
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        tx.set(ref, layoutData(Number(snap.data()!.revision) + 1, "admin1"));
      }),
    );
  });

  it("requires server timestamps and the writer's uid", async () => {
    const db = as("admin1");
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), { ...layoutData(2, "admin1"), updatedAt: new Date(0) }));
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(2, "admin2")));
  });

  it("rejects malformed layouts", async () => {
    const db = as("admin1");
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), { ...layoutData(2, "admin1"), coordinateUnits: "feet" }));
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), { ...layoutData(2, "admin1"), width: -1 }));
  });
});

describe("storage locations", () => {
  it("allows admins to write and denies members", async () => {
    await assertSucceeds(setDoc(doc(as("admin1"), "shops", SHOP, "locations", "loc_new"), locationData()));
    await assertFails(setDoc(doc(as("member1"), "shops", SHOP, "locations", "loc_new"), locationData()));
    await assertFails(updateDoc(doc(as("member1"), "shops", SHOP, "locations", "loc_example_drawer_a"), { label: "x" }));
  });

  it("never allows deletes, so references stay resolvable", async () => {
    await assertFails(deleteDoc(doc(as("admin1"), "shops", SHOP, "locations", "loc_example_drawer_a")));
  });
});

describe("membership and roles", () => {
  it("prevents users from granting themselves admin", async () => {
    await assertFails(setDoc(doc(as("member1"), "shops", SHOP, "members", "member1"), { role: "admin" }));
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "members", "stranger"), { role: "admin" }));
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "members", "stranger"), { role: "member" }));
  });

  it("prevents admins from changing their own role", async () => {
    await assertFails(updateDoc(doc(as("admin1"), "shops", SHOP, "members", "admin1"), { role: "member" }));
    await assertFails(deleteDoc(doc(as("admin1"), "shops", SHOP, "members", "admin1")));
  });

  it("lets admins manage other members, and members manage no one", async () => {
    await assertFails(setDoc(doc(as("member1"), "shops", SHOP, "members", "newbie"), { role: "member" }));
    await assertSucceeds(setDoc(doc(as("admin1"), "shops", SHOP, "members", "newbie"), { role: "member" }));
    await assertFails(setDoc(doc(as("admin1"), "shops", SHOP, "members", "newbie2"), { role: "owner" }));
    await assertSucceeds(updateDoc(doc(as("admin1"), "shops", SHOP, "members", "member1"), { role: "admin" }));
  });

  it("does not let clients create shops", async () => {
    await assertFails(setDoc(doc(as("admin1"), "shops", "new-shop"), { name: "x" }));
    await assertFails(updateDoc(doc(as("member1"), "shops", SHOP), { activeLayoutId: "x" }));
    await assertSucceeds(updateDoc(doc(as("admin1"), "shops", SHOP), { activeLayoutId: "main" }));
  });
});
