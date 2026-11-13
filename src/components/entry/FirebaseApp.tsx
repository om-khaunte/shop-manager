"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, onSnapshot, type Firestore } from "firebase/firestore";
import { firebaseClients } from "@/lib/firebase/client";
import { AUTH_MODE, missingFirebaseConfig, SHOP_ID } from "@/lib/firebase/config";
import type { Role } from "@/lib/model/types";
import { FirestoreRepository } from "@/lib/persistence/firestore";
import { ShopApp } from "../ShopApp";
import { Button, Mono } from "../ui";
import { useMounted } from "./useMounted";

type Membership = { status: "loading" } | { status: "none" } | { status: "member"; role: Role } | { status: "error"; message: string };

export function FirebaseApp() {
  const mounted = useMounted();
  if (!mounted) return null;
  const missing = missingFirebaseConfig();
  if (missing.length) return <ConfigMissing missing={missing} />;
  return AUTH_MODE === "open" ? <OpenAccessApp /> : <AuthGate />;
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

function AuthGate() {
  const { auth } = firebaseClients();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), [auth]);

  if (user === undefined) return <Screen><p className="text-xs text-ink-3">Checking sign-in…</p></Screen>;
  if (user === null) return <SignIn />;
  return <MembershipGate user={user} />;
}

function MembershipGate({ user }: { user: User }) {
  const { auth, db } = firebaseClients();
  const [membership, setMembership] = useState<Membership>({ status: "loading" });

  useEffect(
    () =>
      onSnapshot(
        doc(db, "shops", SHOP_ID, "members", user.uid),
        (snap) => {
          const role = snap.data()?.role;
          setMembership(snap.exists() && (role === "admin" || role === "member") ? { status: "member", role } : { status: "none" });
        },
        (e) =>
          setMembership({
            status: "error",
            message:
              e.code === "permission-denied"
                ? "Firestore denied access. Make sure the security rules from firestore.rules are deployed (npm run deploy:rules)."
                : e.code === "unavailable"
                  ? "Couldn’t reach Firestore. Check your connection, and that a Firestore database exists for this project."
                  : e.message,
          }),
      ),
    [db, user.uid],
  );

  const shopName = useShopName(db, membership.status === "member");

  const repository = useMemo(() => new FirestoreRepository(db, SHOP_ID, user.uid), [db, user.uid]);
  const label = user.displayName || user.email || user.uid;

  if (membership.status === "loading") return <Screen><p className="text-xs text-ink-3">Checking shop access…</p></Screen>;
  if (membership.status === "error") {
    return (
      <Screen title="Couldn’t check shop access">
        <p>{membership.message}</p>
        <Button className="mt-3" onClick={() => signOut(auth)}>Sign out</Button>
      </Screen>
    );
  }
  if (membership.status === "none") {
    return (
      <Screen title="Not a member of this shop">
        <p>
          You’re signed in as <span className="text-ink">{label}</span>, but you haven’t been added to <Mono>{SHOP_ID}</Mono>. Send this user ID to a shop admin:
        </p>
        <div className="mt-2 border border-line bg-white px-2 py-1.5 select-all">
          <Mono>{user.uid}</Mono>
        </div>
        <Button className="mt-3" onClick={() => signOut(auth)}>Sign out</Button>
      </Screen>
    );
  }
  return <ShopApp repository={repository} role={membership.role} shopName={shopName} user={{ label, onSignOut: () => signOut(auth) }} />;
}

function SignIn() {
  const { auth } = firebaseClients();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Screen title="Sign in">
      <p>Sign in with your team Google account to view the shop map.</p>
      <Button
        variant="primary"
        className="mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signInWithPopup(auth, new GoogleAuthProvider());
          } catch (e) {
            const code = (e as { code?: string }).code;
            if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") setError(signInError(code, (e as Error).message));
          } finally {
            setBusy(false);
          }
        }}
      >
        Continue with Google
      </Button>
      {error && <p className="mt-2 text-accent">{error}</p>}
    </Screen>
  );
}

function signInError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "auth/operation-not-allowed":
      return "Google sign-in isn’t enabled for this Firebase project. Enable it under Authentication → Sign-in method.";
    case "auth/unauthorized-domain":
      return `${window.location.hostname} isn’t an authorized domain. Add it under Authentication → Settings → Authorized domains.`;
    case "auth/popup-blocked":
      return "The sign-in popup was blocked. Allow popups for this site and try again.";
    case "auth/network-request-failed":
      return "Couldn’t reach Google sign-in. Check your connection and try again.";
    default:
      return fallback;
  }
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
        <div className="flex items-baseline gap-1 text-[13px] font-semibold tracking-tight">
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
