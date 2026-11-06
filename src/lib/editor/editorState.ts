import { documentsEqual } from "../model/layout";
import {
  commitFrom,
  createHistory,
  pushHistory,
  redo,
  replacePresent,
  undo,
  type History,
} from "../model/history";
import type { ShopDocument } from "../model/types";
import type { RemoteState } from "../persistence/repository";

export interface Conflict {
  remoteRevision: number | null;
  remote: ShopDocument | null;
}

export interface EditorState {
  remote: RemoteState;
  /** Last document known to match the server. */
  base: ShopDocument | null;
  /** Local draft history; present only while editing. */
  history: History<ShopDocument> | null;
  transformBase: ShopDocument | null;
  save: { status: "idle" | "saving" | "error"; message?: string };
  conflict: Conflict | null;
}

export type EditorAction =
  | { type: "remote"; state: RemoteState }
  | { type: "startEdit" }
  | { type: "stopEdit" }
  | { type: "apply"; doc: ShopDocument }
  | { type: "transformStart" }
  | { type: "transformPreview"; doc: ShopDocument }
  | { type: "transformEnd" }
  | { type: "transformCancel" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "discard" }
  | { type: "saveStart" }
  | { type: "saveSuccess"; revision: number }
  | { type: "saveError"; message: string }
  | { type: "saveConflict"; remoteRevision: number | null }
  | { type: "acceptRemote" };

export const initialEditorState: EditorState = {
  remote: { status: "loading" },
  base: null,
  history: null,
  transformBase: null,
  save: { status: "idle" },
  conflict: null,
};

export function presentDoc(s: EditorState): ShopDocument | null {
  return s.history?.present ?? s.base;
}

export function isEditing(s: EditorState): boolean {
  return s.history !== null;
}

export function isDirty(s: EditorState): boolean {
  if (!s.history) return false;
  if (!s.base) return true;
  return !documentsEqual(s.history.present, s.base);
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case "remote": {
      if (a.state.status !== "ready") return { ...s, remote: a.state };
      const incoming = a.state.doc;
      if (!s.history || !s.base) return { ...s, remote: a.state, base: incoming };
      const present = s.history.present;
      if (documentsEqual(incoming, present)) {
        return { ...s, remote: a.state, base: incoming, conflict: null };
      }
      if (incoming.layout.revision === s.base.layout.revision) {
        return { ...s, remote: a.state, base: incoming };
      }
      if (!isDirty(s)) {
        return { ...s, remote: a.state, base: incoming, history: createHistory(incoming), conflict: null };
      }
      return { ...s, remote: a.state, conflict: { remoteRevision: incoming.layout.revision, remote: incoming } };
    }
    case "startEdit":
      if (!s.base || s.history) return s;
      return { ...s, history: createHistory(s.base), save: { status: "idle" } };
    case "stopEdit":
      return { ...s, history: null, transformBase: null, conflict: null, save: { status: "idle" } };
    case "apply":
      if (!s.history) return s;
      return { ...s, history: pushHistory(s.history, a.doc) };
    case "transformStart":
      if (!s.history) return s;
      return { ...s, transformBase: s.history.present };
    case "transformPreview":
      if (!s.history) return s;
      return { ...s, history: replacePresent(s.history, a.doc) };
    case "transformEnd":
      if (!s.history || !s.transformBase) return s;
      return { ...s, history: commitFrom(s.history, s.transformBase), transformBase: null };
    case "transformCancel":
      if (!s.history || !s.transformBase) return s;
      return { ...s, history: replacePresent(s.history, s.transformBase), transformBase: null };
    case "undo":
      return s.history ? { ...s, history: undo(s.history) } : s;
    case "redo":
      return s.history ? { ...s, history: redo(s.history) } : s;
    case "discard":
      if (!s.base) return s;
      return { ...s, history: s.history ? createHistory(s.base) : null, conflict: null, save: { status: "idle" } };
    case "saveStart":
      return { ...s, save: { status: "saving" } };
    case "saveSuccess": {
      const present = presentDoc(s);
      if (!present) return s;
      const saved = { ...present, layout: { ...present.layout, revision: a.revision } };
      return {
        ...s,
        base: saved,
        history: s.history ? createHistory(saved) : null,
        save: { status: "idle" },
        conflict: null,
      };
    }
    case "saveError":
      return { ...s, save: { status: "error", message: a.message } };
    case "saveConflict": {
      const remote = s.remote.status === "ready" ? s.remote.doc : null;
      return { ...s, save: { status: "idle" }, conflict: { remoteRevision: a.remoteRevision, remote } };
    }
    case "acceptRemote": {
      const remote = s.conflict?.remote ?? (s.remote.status === "ready" ? s.remote.doc : null);
      if (!remote) return s;
      return { ...s, base: remote, history: s.history ? createHistory(remote) : null, conflict: null };
    }
  }
}
