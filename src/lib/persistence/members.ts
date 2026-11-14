import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import type { Role } from "../model/types";

export interface Member {
  uid: string;
  role: Role;
  displayName: string | null;
  email: string | null;
}

/** A signed-in person asking an admin for edit access. */
export interface AccessRequest {
  uid: string;
  displayName: string | null;
  email: string | null;
  note: string | null;
  /** Milliseconds since epoch; null while the server timestamp is still resolving. */
  requestedAt: number | null;
}

type Person = Pick<Member, "uid" | "displayName" | "email">;

/** Name to show for a person: display name, else email, else a shortened user ID. */
export function memberName(m: Person): string {
  return m.displayName?.trim() || m.email?.trim() || `${m.uid.slice(0, 8)}…`;
}

/** Admins first, then editors, each alphabetical by name. */
export function sortMembers(list: Member[]): Member[] {
  return [...list].sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1) || memberName(a).localeCompare(memberName(b), undefined, { sensitivity: "base" }));
}

/** Oldest request first, so people are answered in the order they asked. */
export function sortRequests(list: AccessRequest[]): AccessRequest[] {
  return [...list].sort((a, b) => (a.requestedAt ?? Infinity) - (b.requestedAt ?? Infinity));
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

// --- Your own access --------------------------------------------------------------

/** Your role, or null if you haven't been given edit access. */
export function subscribeOwnRole(db: Firestore, shopId: string, uid: string, onChange: (role: Role | null) => void, onError: (e: { code?: string; message: string }) => void): () => void {
  return onSnapshot(
    doc(db, "shops", shopId, "members", uid),
    (snap) => {
      const role = snap.data()?.role;
      onChange(snap.exists() && (role === "admin" || role === "editor") ? role : null);
    },
    onError,
  );
}

/** Whether you have an open request. */
export function subscribeOwnRequest(db: Firestore, shopId: string, uid: string, onChange: (pending: boolean) => void, onError: (e: { code?: string; message: string }) => void): () => void {
  return onSnapshot(doc(db, "shops", shopId, "requests", uid), (snap) => onChange(snap.exists()), onError);
}

/** Ask an admin for edit access. This grants nothing by itself. */
export function requestAccess(db: Firestore, shopId: string, user: Person, note: string): Promise<void> {
  return setDoc(doc(db, "shops", shopId, "requests", user.uid), {
    displayName: user.displayName,
    email: user.email,
    note: note.trim() || null,
    requestedAt: serverTimestamp(),
  });
}

export function withdrawRequest(db: Firestore, shopId: string, uid: string): Promise<void> {
  return deleteDoc(doc(db, "shops", shopId, "requests", uid));
}

// --- Admin: requests and team -------------------------------------------------------

export function subscribeRequests(db: Firestore, shopId: string, onChange: (requests: AccessRequest[]) => void, onError: (message: string) => void): () => void {
  return onSnapshot(
    collection(db, "shops", shopId, "requests"),
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: "estimate" });
          const at = data.requestedAt;
          return { uid: d.id, displayName: str(data.displayName), email: str(data.email), note: str(data.note), requestedAt: at && typeof at.toMillis === "function" ? at.toMillis() : null };
        }),
      ),
    (e) => onError(e.code === "permission-denied" ? "Only admins can see access requests." : e.message),
  );
}

/** Grants access and clears the request in one atomic step. */
export function approveRequest(db: Firestore, shopId: string, request: AccessRequest, role: Role, adminUid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "shops", shopId, "members", request.uid), {
    role,
    displayName: request.displayName,
    email: request.email,
    addedBy: adminUid,
    addedAt: serverTimestamp(),
  });
  batch.delete(doc(db, "shops", shopId, "requests", request.uid));
  return batch.commit();
}

export function denyRequest(db: Firestore, shopId: string, uid: string): Promise<void> {
  return deleteDoc(doc(db, "shops", shopId, "requests", uid));
}

export function subscribeMembers(db: Firestore, shopId: string, onChange: (members: Member[]) => void, onError: (message: string) => void): () => void {
  return onSnapshot(
    collection(db, "shops", shopId, "members"),
    (snap) =>
      onChange(
        snap.docs.flatMap((d) => {
          const data = d.data();
          if (data.role !== "admin" && data.role !== "editor") return [];
          return [{ uid: d.id, role: data.role as Role, displayName: str(data.displayName), email: str(data.email) }];
        }),
      ),
    (e) => onError(e.code === "permission-denied" ? "Only admins can see the team." : e.message),
  );
}

export function setMemberRole(db: Firestore, shopId: string, uid: string, role: Role): Promise<void> {
  return updateDoc(doc(db, "shops", shopId, "members", uid), { role });
}

export function removeMember(db: Firestore, shopId: string, uid: string): Promise<void> {
  return deleteDoc(doc(db, "shops", shopId, "members", uid));
}
