"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot, type Firestore } from "firebase/firestore";
import { firebaseClients } from "@/lib/firebase/client";
import { AUTH_MODE, missingFirebaseConfig, SHOP_ID } from "@/lib/firebase/config";
import type { Role } from "@/lib/model/types";
import { FirestoreRepository } from "@/lib/persistence/firestore";
import { requestAccess, subscribeOwnRequest, subscribeOwnRole, subscribeRequests, withdrawRequest } from "@/lib/persistence/members";
import { TeamDialog } from "../team/TeamDialog";
import { ShopApp } from "../ShopApp";
import type { AccessUi } from "../shell/TopBar";
import { BrandMark, Mono } from "../ui";
import { RequestAccessDialog, SignInDialog } from "./AccountDialogs";
import { useMounted } from "./useMounted";

export function FirebaseApp() {
  const mounted = useMounted();
  if (!mounted) return null;
  const missing = missingFirebaseConfig();
  if (missing.length) return <ConfigMissing missing={missing} />;
  return AUTH_MODE === "open" ? <OpenAccessApp /> : <AccountsApp />;
}

const EDITOR_ID_KEY = "114shop:editor-id";

/** Stable per-browser ID recorded as `updatedBy` on saves while there is no sign-in. */
function browserEditorId(): string {
  let id = localStorage.getItem(EDITOR_ID_KEY);
  if (!id) {
    id = `anon-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(EDITOR_ID_KEY, id);
  }
  return id;
}

function OpenAccessApp() {
  const { db } = firebaseClients();
  const [editorId] = useState(browserEditorId);
  const shopName = useShopName(db, true);
  const repository = useMemo(() => new FirestoreRepository(db, SHOP_ID, editorId), [db, editorId]);
  return <ShopApp repository={repository} role="admin" shopName={shopName} user={{ label: editorId }} openAccess />;
}

function useShopName(db: Firestore, enabled: boolean): string {
  const [name, setName] = useState<string>(SHOP_ID);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "shops", SHOP_ID),
      (snap) => setName((snap.data()?.name as string) || SHOP_ID),
      () => {},
    );
  }, [db, enabled]);
  return name;
}

/**
 * Anyone can open the app to view and search, signed in or not. Signing in is optional and only
 * matters for editing: a signed-in person asks for access, an admin approves, and the app
 * switches to edit mode for them live. Security rules enforce this; the UI just reflects it.
 */
function AccountsApp() {
  const { auth, db } = firebaseClients();
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = still checking
  const [, setProfileTick] = useState(0);
  useEffect(() => onAuthStateChanged(auth, setUser), [auth]);
  const uid = user?.uid ?? null;

  // Your own access: your role (if approved) and whether a request is open.
  const [own, setOwn] = useState<{ uid: string | null; role: Role | null; pending: boolean; roleReady: boolean; requestReady: boolean }>({ uid: null, role: null, pending: false, roleReady: false, requestReady: false });
  useEffect(() => {
    setOwn({ uid, role: null, pending: false, roleReady: !uid, requestReady: !uid });
    if (!uid) return;
    const fail = (e: { code?: string; message: string }) => console.warn("Couldn’t read your access:", e.code ?? e.message);
    const offRole = subscribeOwnRole(db, SHOP_ID, uid, (role) => setOwn((o) => (o.uid === uid ? { ...o, role, roleReady: true } : o)), (e) => { fail(e); setOwn((o) => ({ ...o, roleReady: true })); });
    const offRequest = subscribeOwnRequest(db, SHOP_ID, uid, (pending) => setOwn((o) => (o.uid === uid ? { ...o, pending, requestReady: true } : o)), (e) => { fail(e); setOwn((o) => ({ ...o, requestReady: true })); });
    return () => {
      offRole();
      offRequest();
    };
  }, [db, uid]);
  const ready = !!user && own.uid === uid && own.roleReady && own.requestReady;
  const role = ready ? own.role : null;

  // Admins: how many people are waiting.
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (role !== "admin") {
      setWaiting(0);
      return;
    }
    return subscribeRequests(db, SHOP_ID, (r) => setWaiting(r.length), () => {});
  }, [db, role]);

  const [dialog, setDialog] = useState<"signin" | "request" | null>(null);
  // Someone who clicked "Sign in to edit" goes straight to the request form once signed in.
  const [wantsEdit, setWantsEdit] = useState(false);
  useEffect(() => {
    if (!wantsEdit || !ready) return;
    setWantsEdit(false);
    setDialog(!own.role && !own.pending ? "request" : null);
  }, [wantsEdit, ready, own.role, own.pending]);
  useEffect(() => {
    if (user && dialog === "signin") setDialog(null);
  }, [user, dialog]);

  const shopName = useShopName(db, true);
  // One connection for everyone: signing in or out must not reload the map or reset the camera.
  const repository = useMemo(() => new FirestoreRepository(db, SHOP_ID, "viewer"), [db]);
  repository.uid = uid ?? "viewer";

  let access: AccessUi | undefined;
  if (user === null) access = { kind: "signedOut", onSignIn: () => { setWantsEdit(true); setDialog("signin"); } };
  else if (ready && !own.role) access = own.pending ? { kind: "pending", onWithdraw: () => void withdrawRequest(db, SHOP_ID, user!.uid) } : { kind: "canRequest", onRequest: () => setDialog("request") };

  const label = user ? user.displayName || user.email || user.uid : "";
  return (
    <>
      <ShopApp
        repository={repository}
        role={role}
        shopName={shopName}
        user={user ? { label, onSignOut: () => signOut(auth) } : null}
        access={access}
        pendingRequests={waiting}
        renderTeam={(close) => <TeamDialog db={db} shopId={SHOP_ID} currentUid={user!.uid} onClose={close} />}
      />
      {dialog === "signin" && !user && <SignInDialog auth={auth} onClose={() => { setWantsEdit(false); setDialog(null); }} onProfileUpdated={() => setProfileTick((t) => t + 1)} />}
      {dialog === "request" && user && (
        <RequestAccessDialog who={label} onClose={() => setDialog(null)} onSend={(note) => requestAccess(db, SHOP_ID, { uid: user.uid, displayName: user.displayName, email: user.email }, note)} />
      )}
    </>
  );
}

function ConfigMissing({ missing }: { missing: string[] }) {
  return (
    <Screen title="Firebase is not configured">
      <p>This deployment is missing public Firebase settings, so shop data can’t be loaded. Add these environment variables (see <Mono>.env.example</Mono>):</p>
      <ul className="mt-2 space-y-0.5 border border-line bg-white px-2 py-1.5">
        {missing.map((m) => (
          <li key={m}><Mono>{m}</Mono></li>
        ))}
      </ul>
      <p className="mt-3">To review the map without Firebase, open the local demo. Demo edits stay in this browser and never touch shop data.</p>
      <Link href="/demo" className="mt-3 inline-flex h-7 items-center border border-ink bg-ink px-2.5 text-xs font-medium text-white hover:opacity-90">
        Open local demo
      </Link>
    </Screen>
  );
}

function Screen({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-11 items-center border-b border-line bg-panel px-3">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
          <BrandMark />
          <span>114</span>
          <span className="font-normal text-ink-3">/</span>
          <span>Shop</span>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[14vh]">
        <div className="w-full max-w-sm border border-line bg-panel p-4 text-xs leading-relaxed text-ink-2">
          {title && <h1 className="mb-1.5 text-sm font-semibold text-ink">{title}</h1>}
          {children}
        </div>
      </main>
    </div>
  );
}
