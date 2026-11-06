import type { ShopDocument } from "../model/types";

export type RemoteState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; doc: ShopDocument }
  | { status: "error"; message: string };

export type SaveResult =
  | { status: "saved"; revision: number }
  | { status: "conflict"; remoteRevision: number | null };

export interface SaveRequest {
  /** Last document this client loaded; used to write only changed locations. */
  base: ShopDocument;
  next: ShopDocument;
  /** Revision the remote must still be at for the save to apply. */
  expectedRevision: number;
}

export interface ShopRepository {
  readonly mode: "demo" | "firebase";
  subscribe(listener: (state: RemoteState) => void): () => void;
  save(request: SaveRequest): Promise<SaveResult>;
  /** Creates the first layout from the seed. Never overwrites an existing layout. */
  initialize(seed: ShopDocument): Promise<SaveResult>;
}

/**
 * Optimistic-concurrency rule shared by every repository: a save applies only
 * when the stored revision equals the revision the editor started from.
 */
export function checkRevision(
  remoteRevision: number | null,
  expectedRevision: number,
): { ok: true; nextRevision: number } | { ok: false; remoteRevision: number | null } {
  if (remoteRevision === null || remoteRevision !== expectedRevision) {
    return { ok: false, remoteRevision };
  }
  return { ok: true, nextRevision: remoteRevision + 1 };
}
