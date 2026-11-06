import { describe, expect, it } from "vitest";
import { editorReducer, initialEditorState, isDirty, presentDoc, type EditorState } from "../editor/editorState";
import { updateObject } from "../model/layout";
import { createSeedDocument } from "../model/seed";
import type { ShopDocument } from "../model/types";
import { LocalDemoRepository, type KeyValueStore } from "./local";
import { checkRevision, type RemoteState } from "./repository";

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const loaded = (repo: LocalDemoRepository): ShopDocument => {
  let state = { status: "loading" } as RemoteState;
  repo.subscribe((s) => (state = s))();
  if (state.status !== "ready") throw new Error(`expected ready, got ${state.status}`);
  return state.doc;
};

describe("revision check", () => {
  it("accepts only the expected revision", () => {
    expect(checkRevision(3, 3)).toEqual({ ok: true, nextRevision: 4 });
    expect(checkRevision(4, 3)).toEqual({ ok: false, remoteRevision: 4 });
    expect(checkRevision(null, 0)).toEqual({ ok: false, remoteRevision: null });
  });
});

describe("local demo repository", () => {
  it("seeds once and never overwrites a saved layout", async () => {
    const store = new MemoryStore();
    const repo = new LocalDemoRepository(store, createSeedDocument);
    const first = loaded(repo);
    expect(first.layout.revision).toBe(1);
    const edited = updateObject(first, "obj_haas", { x: 42 });
    expect(await repo.save({ base: first, next: edited, expectedRevision: 1 })).toEqual({ status: "saved", revision: 2 });
    expect((await repo.initialize(createSeedDocument())).status).toBe("conflict");
    const again = loaded(new LocalDemoRepository(store, createSeedDocument));
    expect(again.layout.objects.obj_haas.x).toBe(42);
    expect(again.layout.revision).toBe(2);
  });

  it("rejects a save based on a stale revision", async () => {
    const store = new MemoryStore();
    const a = new LocalDemoRepository(store, createSeedDocument);
    const b = new LocalDemoRepository(store, createSeedDocument);
    const docA = loaded(a);
    const docB = loaded(b);
    await a.save({ base: docA, next: updateObject(docA, "obj_haas", { x: 1 }), expectedRevision: 1 });
    const result = await b.save({ base: docB, next: updateObject(docB, "obj_haas", { x: 2 }), expectedRevision: 1 });
    expect(result).toEqual({ status: "conflict", remoteRevision: 2 });
    expect(loaded(a).layout.objects.obj_haas.x).toBe(1);
  });

  it("reloads geometry and IDs exactly as saved", async () => {
    const store = new MemoryStore();
    const repo = new LocalDemoRepository(store, createSeedDocument);
    const doc = loaded(repo);
    const next = updateObject(doc, "obj_camaster", { x: 611.5, y: 1490, w: 310, h: 175, rotation: 90 });
    await repo.save({ base: doc, next, expectedRevision: 1 });
    const back = loaded(repo).layout.objects.obj_camaster;
    expect(back).toMatchObject({ id: "obj_camaster", x: 611.5, y: 1490, w: 310, h: 175, rotation: 90 });
  });
});

describe("editor conflict handling", () => {
  const ready = (doc: ShopDocument): RemoteState => ({ status: "ready", doc });
  const start = (doc: ShopDocument): EditorState => {
    let s = editorReducer(initialEditorState, { type: "remote", state: ready(doc) });
    s = editorReducer(s, { type: "startEdit" });
    return s;
  };
  const withRevision = (doc: ShopDocument, revision: number) => ({ ...doc, layout: { ...doc.layout, revision } });

  it("raises a conflict instead of replacing local edits", () => {
    const base = withRevision(createSeedDocument(), 1);
    let s = start(base);
    s = editorReducer(s, { type: "apply", doc: updateObject(presentDoc(s)!, "obj_haas", { x: 5 }) });
    const theirs = withRevision(updateObject(base, "obj_jointer", { x: 99 }), 2);
    s = editorReducer(s, { type: "remote", state: ready(theirs) });
    expect(s.conflict?.remoteRevision).toBe(2);
    expect(presentDoc(s)!.layout.objects.obj_haas.x).toBe(5);
    expect(s.base!.layout.revision).toBe(1);
  });

  it("adopts remote changes silently when there are no local edits", () => {
    const base = withRevision(createSeedDocument(), 1);
    let s = start(base);
    const theirs = withRevision(updateObject(base, "obj_jointer", { x: 99 }), 2);
    s = editorReducer(s, { type: "remote", state: ready(theirs) });
    expect(s.conflict).toBeNull();
    expect(presentDoc(s)!.layout.objects.obj_jointer.x).toBe(99);
  });

  it("does not treat its own save echo as a conflict", () => {
    const base = withRevision(createSeedDocument(), 1);
    let s = start(base);
    const edited = updateObject(presentDoc(s)!, "obj_haas", { x: 5 });
    s = editorReducer(s, { type: "apply", doc: edited });
    s = editorReducer(s, { type: "saveStart" });
    s = editorReducer(s, { type: "remote", state: ready(withRevision(edited, 2)) });
    expect(s.conflict).toBeNull();
    s = editorReducer(s, { type: "saveSuccess", revision: 2 });
    expect(isDirty(s)).toBe(false);
    expect(s.base!.layout.revision).toBe(2);
  });

  it("keeps edits after a failed save and discards back to the saved layout", () => {
    const base = withRevision(createSeedDocument(), 1);
    let s = start(base);
    s = editorReducer(s, { type: "apply", doc: updateObject(presentDoc(s)!, "obj_haas", { x: 5 }) });
    s = editorReducer(s, { type: "saveError", message: "offline" });
    expect(isDirty(s)).toBe(true);
    expect(presentDoc(s)!.layout.objects.obj_haas.x).toBe(5);
    s = editorReducer(s, { type: "discard" });
    expect(isDirty(s)).toBe(false);
    expect(presentDoc(s)!.layout.objects.obj_haas.x).toBe(base.layout.objects.obj_haas.x);
  });

  it("can load the other admin's version", () => {
    const base = withRevision(createSeedDocument(), 1);
    let s = start(base);
    s = editorReducer(s, { type: "apply", doc: updateObject(presentDoc(s)!, "obj_haas", { x: 5 }) });
    const theirs = withRevision(updateObject(base, "obj_jointer", { x: 99 }), 2);
    s = editorReducer(s, { type: "remote", state: ready(theirs) });
    s = editorReducer(s, { type: "acceptRemote" });
    expect(s.conflict).toBeNull();
    expect(presentDoc(s)!.layout.revision).toBe(2);
    expect(presentDoc(s)!.layout.objects.obj_jointer.x).toBe(99);
  });
});
