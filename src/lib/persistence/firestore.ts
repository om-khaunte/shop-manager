import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type FirestoreError,
  type Timestamp,
} from "firebase/firestore";
import {
  changedLocationIds,
  deserializeLayout,
  deserializeLocation,
  serializeLayout,
  serializeLocation,
} from "../model/layout";
import type { Layout, LocationMap, ShopDocument } from "../model/types";
import { checkRevision, type RemoteState, type SaveRequest, type SaveResult, type ShopRepository } from "./repository";

const DEFAULT_LAYOUT_ID = "main";

export class FirestoreRepository implements ShopRepository {
  readonly mode = "firebase" as const;

  constructor(
    private readonly db: Firestore,
    private readonly shopId: string,
    /** Recorded as `updatedBy` on saves. Can change when someone signs in or out, without reloading data. */
    public uid: string,
  ) {}

  private shopRef() {
    return doc(this.db, "shops", this.shopId);
  }

  private layoutRef(layoutId: string) {
    return doc(this.db, "shops", this.shopId, "layouts", layoutId);
  }

  private locationRef(id: string) {
    return doc(this.db, "shops", this.shopId, "locations", id);
  }

  subscribe(listener: (state: RemoteState) => void): () => void {
    let layout: Layout | null | undefined;
    let locations: LocationMap | undefined;
    let layoutUnsub: (() => void) | null = null;
    let currentLayoutId: string | null = null;
    const fail = (e: FirestoreError) =>
      listener({
        status: "error",
        message:
          e.code === "permission-denied"
            ? "Firestore refused access. The security rules for this project haven’t been deployed yet (see README → Firebase setup)."
            : e.message,
      });

    const emit = () => {
      if (layout === undefined || locations === undefined) return;
      if (layout === null) listener({ status: "empty" });
      else listener({ status: "ready", doc: { layout, locations } });
    };

    listener({ status: "loading" });

    const shopUnsub = onSnapshot(
      this.shopRef(),
      (snap) => {
        const layoutId = (snap.data()?.activeLayoutId as string | undefined) || DEFAULT_LAYOUT_ID;
        if (layoutId === currentLayoutId) return;
        currentLayoutId = layoutId;
        layoutUnsub?.();
        layout = undefined;
        layoutUnsub = onSnapshot(
          this.layoutRef(layoutId),
          (ls) => {
            if (!ls.exists()) {
              layout = null;
            } else {
              const data = ls.data();
              const updatedAt = (data.updatedAt as Timestamp | null)?.toMillis?.() ?? null;
              layout = deserializeLayout(ls.id, data, { updatedAt, updatedBy: data.updatedBy ?? null });
            }
            emit();
          },
          fail,
        );
      },
      fail,
    );

    const locUnsub = onSnapshot(
      collection(this.db, "shops", this.shopId, "locations"),
      (qs) => {
        const next: LocationMap = {};
        qs.forEach((d) => {
          next[d.id] = deserializeLocation(d.id, d.data());
        });
        locations = next;
        emit();
      },
      fail,
    );

    return () => {
      shopUnsub();
      locUnsub();
      layoutUnsub?.();
    };
  }

  async save({ base, next, expectedRevision }: SaveRequest): Promise<SaveResult> {
    const layoutRef = this.layoutRef(next.layout.id);
    const changed = changedLocationIds(base, next);
    return runTransaction(this.db, async (tx) => {
      const snap = await tx.get(layoutRef);
      const remote = snap.exists() ? Number(snap.data().revision ?? 0) : null;
      const check = checkRevision(remote, expectedRevision);
      if (!check.ok) return { status: "conflict", remoteRevision: check.remoteRevision } as SaveResult;
      tx.set(layoutRef, {
        ...serializeLayout(next.layout),
        revision: check.nextRevision,
        updatedAt: serverTimestamp(),
        updatedBy: this.uid,
      });
      for (const id of changed) {
        tx.set(this.locationRef(id), { ...serializeLocation(next.locations[id]), updatedAt: serverTimestamp() });
      }
      return { status: "saved", revision: check.nextRevision } as SaveResult;
    });
  }

  async initialize(seed: ShopDocument): Promise<SaveResult> {
    const layoutRef = this.layoutRef(seed.layout.id);
    return runTransaction(this.db, async (tx) => {
      const snap = await tx.get(layoutRef);
      if (snap.exists()) {
        return { status: "conflict", remoteRevision: Number(snap.data().revision ?? 0) } as SaveResult;
      }
      tx.set(layoutRef, {
        ...serializeLayout(seed.layout),
        revision: 1,
        updatedAt: serverTimestamp(),
        updatedBy: this.uid,
      });
      for (const l of Object.values(seed.locations)) {
        tx.set(this.locationRef(l.id), { ...serializeLocation(l), updatedAt: serverTimestamp() });
      }
      tx.set(this.shopRef(), { activeLayoutId: seed.layout.id }, { merge: true });
      return { status: "saved", revision: 1 } as SaveResult;
    });
  }
}
