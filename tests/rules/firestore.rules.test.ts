import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
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
    await setDoc(doc(db, "shops", SHOP, "members", "editor1"), { role: "editor" });
    await setDoc(doc(db, "shops", SHOP, "layouts", "main"), { ...serializeLayout({ ...seed.layout, revision: 1 }), updatedAt: new Date(), updatedBy: "admin1" });
    await setDoc(doc(db, "shops", SHOP, "locations", "loc_example_drawer_a"), { ...serializeLocation(seed.locations.loc_example_drawer_a), updatedAt: new Date() });
  });
});

describe("reading", () => {
  it("lets anyone view and search the shop without signing in", async () => {
    for (const db of [as(null), as("stranger"), as("editor1"), as("admin1")]) {
      await assertSucceeds(getDoc(doc(db, "shops", SHOP)));
      await assertSucceeds(getDoc(doc(db, "shops", SHOP, "layouts", "main")));
      await assertSucceeds(getDoc(doc(db, "shops", SHOP, "locations", "loc_example_drawer_a")));
    }
  });

  it("keeps the team roster and access requests private", async () => {
    await assertFails(getDoc(doc(as(null), "shops", SHOP, "members", "admin1")));
    await assertFails(getDoc(doc(as("stranger"), "shops", SHOP, "members", "admin1")));
    await assertFails(getDoc(doc(as("editor1"), "shops", SHOP, "members", "admin1")));
    await assertSucceeds(getDoc(doc(as("admin1"), "shops", SHOP, "members", "editor1")));
    // You can always read your own membership, even when it doesn't exist yet.
    await assertSucceeds(getDoc(doc(as("stranger"), "shops", SHOP, "members", "stranger")));
    await assertSucceeds(getDoc(doc(as("editor1"), "shops", SHOP, "members", "editor1")));
  });

  it("denies unknown collections by default", async () => {
    await assertFails(getDoc(doc(as("admin1"), "other", "x")));
    await assertFails(getDoc(doc(as(null), "shops", SHOP, "secrets", "x")));
    await assertFails(setDoc(doc(as("admin1"), "shops", SHOP, "secrets", "x"), { a: 1 }));
  });
});

describe("layout writes", () => {
  it("allows an admin to save the next revision", async () => {
    await assertSucceeds(setDoc(doc(as("admin1"), "shops", SHOP, "layouts", "main"), layoutData(2, "admin1")));
  });

  it("denies viewers, strangers and signed-out users, including direct writes", async () => {
    for (const uid of [null, "stranger"]) {
      const db = as(uid);
      await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(2, uid ?? "anon")));
      await assertFails(updateDoc(doc(db, "shops", SHOP, "layouts", "main"), { name: "hacked" }));
      await assertFails(deleteDoc(doc(db, "shops", SHOP, "layouts", "main")));
      await assertFails(setDoc(doc(db, "shops", SHOP, "locations", "loc_new"), locationData()));
    }
  });

  it("lets approved editors save, but never delete", async () => {
    const db = as("editor1");
    await assertSucceeds(setDoc(doc(db, "shops", SHOP, "layouts", "main"), layoutData(2, "editor1")));
    await assertFails(deleteDoc(doc(db, "shops", SHOP, "layouts", "main")));
    await assertFails(setDoc(doc(db, "shops", SHOP, "layouts", "other"), { ...layoutData(1, "editor1"), revision: 2 }));
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
  it("allows admins and editors to write, and denies everyone else", async () => {
    await assertSucceeds(setDoc(doc(as("admin1"), "shops", SHOP, "locations", "loc_new"), locationData()));
    await assertSucceeds(setDoc(doc(as("editor1"), "shops", SHOP, "locations", "loc_new2"), locationData()));
    await assertSucceeds(updateDoc(doc(as("editor1"), "shops", SHOP, "locations", "loc_example_drawer_a"), { label: "x", updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "locations", "loc_new"), locationData()));
    await assertFails(setDoc(doc(as(null), "shops", SHOP, "locations", "loc_new"), locationData()));
  });

  it("never allows deletes, so references stay resolvable", async () => {
    await assertFails(deleteDoc(doc(as("admin1"), "shops", SHOP, "locations", "loc_example_drawer_a")));
  });
});

const requestData = (overrides: Record<string, unknown> = {}) => ({ displayName: "New Person", email: "new@example.com", note: "I run the CNC", requestedAt: serverTimestamp(), ...overrides });

describe("requesting and granting edit access", () => {
  it("lets a signed-in person file a request for themselves, and nothing more", async () => {
    await assertSucceeds(setDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger"), requestData()));
    // Filing a request grants nothing.
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "layouts", "main"), layoutData(2, "stranger")));
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "locations", "loc_new"), locationData()));
  });

  it("only accepts well-formed requests made as yourself while signed in", async () => {
    await assertFails(setDoc(doc(as(null), "shops", SHOP, "requests", "stranger"), requestData()));
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "requests", "someone-else"), requestData()));
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger"), requestData({ requestedAt: new Date(0) })));
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger"), requestData({ role: "admin" })));
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger"), requestData({ note: "x".repeat(501) })));
  });

  it("does not let existing members file requests", async () => {
    await assertFails(setDoc(doc(as("editor1"), "shops", SHOP, "requests", "editor1"), requestData()));
  });

  it("keeps requests private to the requester and admins", async () => {
    await assertSucceeds(setDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger"), requestData()));
    await assertSucceeds(getDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger")));
    await assertSucceeds(getDoc(doc(as("admin1"), "shops", SHOP, "requests", "stranger")));
    await assertFails(getDoc(doc(as("editor1"), "shops", SHOP, "requests", "stranger")));
    await assertFails(getDoc(doc(as("other"), "shops", SHOP, "requests", "stranger")));
    await assertFails(getDoc(doc(as(null), "shops", SHOP, "requests", "stranger")));
  });

  it("does not let a request be edited, only withdrawn or cleared by an admin", async () => {
    await assertSucceeds(setDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger"), requestData()));
    await assertFails(updateDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger"), { note: "edited" }));
    await assertFails(deleteDoc(doc(as("other"), "shops", SHOP, "requests", "stranger")));
    await assertFails(deleteDoc(doc(as("editor1"), "shops", SHOP, "requests", "stranger")));
    await assertSucceeds(deleteDoc(doc(as("admin1"), "shops", SHOP, "requests", "stranger")));
    await assertSucceeds(setDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger"), requestData()));
    await assertSucceeds(deleteDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger")));
  });

  it("lets an admin approve a request atomically, after which the person can edit", async () => {
    await assertSucceeds(setDoc(doc(as("stranger"), "shops", SHOP, "requests", "stranger"), requestData()));
    const db = as("admin1");
    const batch = writeBatch(db);
    batch.set(doc(db, "shops", SHOP, "members", "stranger"), { role: "editor", displayName: "New Person", email: "new@example.com", addedBy: "admin1", addedAt: serverTimestamp() });
    batch.delete(doc(db, "shops", SHOP, "requests", "stranger"));
    await assertSucceeds(batch.commit());
    await assertSucceeds(setDoc(doc(as("stranger"), "shops", SHOP, "layouts", "main"), layoutData(2, "stranger")));
    // An editor still cannot manage the team.
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "members", "friend"), { role: "editor" }));
  });

  it("stops anyone but an admin from granting access", async () => {
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "members", "stranger"), { role: "editor" }));
    await assertFails(setDoc(doc(as("stranger"), "shops", SHOP, "members", "stranger"), { role: "admin" }));
    await assertFails(setDoc(doc(as("editor1"), "shops", SHOP, "members", "newbie"), { role: "editor" }));
    await assertFails(updateDoc(doc(as("editor1"), "shops", SHOP, "members", "editor1"), { role: "admin" }));
  });
});

describe("membership and roles", () => {
  it("prevents admins from changing or removing their own membership", async () => {
    await assertFails(updateDoc(doc(as("admin1"), "shops", SHOP, "members", "admin1"), { role: "editor" }));
    await assertFails(deleteDoc(doc(as("admin1"), "shops", SHOP, "members", "admin1")));
  });

  it("lets admins promote, demote and remove other people, using only known roles", async () => {
    await assertSucceeds(updateDoc(doc(as("admin1"), "shops", SHOP, "members", "editor1"), { role: "admin" }));
    await assertSucceeds(updateDoc(doc(as("admin1"), "shops", SHOP, "members", "editor1"), { role: "editor" }));
    await assertFails(setDoc(doc(as("admin1"), "shops", SHOP, "members", "newbie"), { role: "owner" }));
    await assertFails(setDoc(doc(as("admin1"), "shops", SHOP, "members", "newbie"), { role: "view" }));
    await assertSucceeds(deleteDoc(doc(as("admin1"), "shops", SHOP, "members", "editor1")));
    // Once removed, they can no longer edit.
    await assertFails(setDoc(doc(as("editor1"), "shops", SHOP, "layouts", "main"), layoutData(2, "editor1")));
  });

  it("does not let clients create shops, and limits who can rename one", async () => {
    await assertFails(setDoc(doc(as("admin1"), "shops", "new-shop"), { name: "x" }));
    await assertFails(updateDoc(doc(as("stranger"), "shops", SHOP), { activeLayoutId: "x" }));
    await assertFails(updateDoc(doc(as(null), "shops", SHOP), { activeLayoutId: "x" }));
    await assertSucceeds(updateDoc(doc(as("editor1"), "shops", SHOP), { activeLayoutId: "main" }));
    await assertSucceeds(updateDoc(doc(as("admin1"), "shops", SHOP), { name: "Room 114" }));
  });
});
