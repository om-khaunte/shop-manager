import {
  deserializeLayout,
  deserializeLocation,
  serializeLayout,
  serializeLocation,
} from "../model/layout";
import type { LocationMap, ShopDocument } from "../model/types";
import { checkRevision, type RemoteState, type SaveRequest, type SaveResult, type ShopRepository } from "./repository";

export const DEMO_STORAGE_KEY = "114shop:demo:v1";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredDemo {
  layoutId: string;
  layout: Record<string, unknown>;
  locations: Record<string, Record<string, unknown>>;
  updatedAt: number;
}

/**
 * Browser-only demo persistence. Lives under its own storage key so it can
 * never mix with Firebase data, and applies the same revision check so the
 * conflict flow can be exercised with two tabs.
 */
export class LocalDemoRepository implements ShopRepository {
  readonly mode = "demo" as const;

  constructor(
    private readonly store: KeyValueStore,
    private readonly seed: () => ShopDocument,
    private readonly key = DEMO_STORAGE_KEY,
  ) {}

  private read(): ShopDocument | null {
    const raw = this.store.getItem(this.key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDemo;
    const layout = deserializeLayout(parsed.layoutId, parsed.layout, {
      updatedAt: parsed.updatedAt,
      updatedBy: "local-demo",
    });
    const locations: LocationMap = {};
    for (const [id, l] of Object.entries(parsed.locations)) locations[id] = deserializeLocation(id, l);
    return { layout, locations };
  }

  private write(doc: ShopDocument, revision: number) {
    const locations: StoredDemo["locations"] = {};
    for (const [id, l] of Object.entries(doc.locations)) locations[id] = serializeLocation(l);
    const stored: StoredDemo = {
      layoutId: doc.layout.id,
      layout: serializeLayout({ ...doc.layout, revision }),
      locations,
      updatedAt: Date.now(),
    };
    this.store.setItem(this.key, JSON.stringify(stored));
  }

  private state(): RemoteState {
    try {
      const doc = this.read();
      return doc ? { status: "ready", doc } : { status: "empty" };
    } catch (e) {
      return { status: "error", message: `Stored demo data could not be read: ${(e as Error).message}` };
    }
  }

  subscribe(listener: (state: RemoteState) => void): () => void {
    if (this.store.getItem(this.key) === null) void this.initialize(this.seed());
    listener(this.state());
    if (typeof window === "undefined") return () => {};
    const onStorage = (e: StorageEvent) => {
      if (e.key === this.key) listener(this.state());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }

  async save({ next, expectedRevision }: SaveRequest): Promise<SaveResult> {
    const current = this.read();
    const check = checkRevision(current ? current.layout.revision : null, expectedRevision);
    if (!check.ok) return { status: "conflict", remoteRevision: check.remoteRevision };
    this.write(next, check.nextRevision);
    return { status: "saved", revision: check.nextRevision };
  }

  async initialize(seed: ShopDocument): Promise<SaveResult> {
    const current = this.read();
    if (current) return { status: "conflict", remoteRevision: current.layout.revision };
    this.write(seed, 1);
    return { status: "saved", revision: 1 };
  }

  /** Explicit, user-confirmed reset of demo data only. */
  reset() {
    this.store.removeItem(this.key);
    this.write(this.seed(), 1);
  }
}
