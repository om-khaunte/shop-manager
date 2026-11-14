"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  type Auth,
} from "firebase/auth";
import { IconX } from "../icons";
import { Button, IconButton } from "../ui";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/20 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={title} className="fade-in my-auto w-full max-w-sm border border-line bg-panel text-xs leading-relaxed text-ink-2 shadow-[0_8px_24px_rgba(34,33,31,0.12)]">
        <div className="flex items-start gap-2 px-4 pt-3.5">
          <h2 className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-2">
            <IconX />
          </IconButton>
        </div>
        <div className="px-4 pt-1 pb-4">{children}</div>
      </section>
    </div>
  );
}

const field = "mt-1 h-8 w-full border border-line bg-white px-2 text-xs";

export function signInError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "auth/operation-not-allowed":
      return "This sign-in method isn’t enabled for the Firebase project. Enable it under Authentication → Sign-in method.";
    case "auth/unauthorized-domain":
      return `${window.location.hostname} isn’t an authorized domain. Add it under Authentication → Settings → Authorized domains.`;
    case "auth/popup-blocked":
      return "The sign-in popup was blocked. Allow popups for this site and try again.";
    case "auth/network-request-failed":
      return "Couldn’t reach the sign-in service. Check your connection and try again.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don’t match. Check them, or use “Forgot password?”.";
    case "auth/invalid-email":
      return "That doesn’t look like a valid email address.";
    case "auth/email-already-in-use":
      return "There’s already an account with that email. Sign in instead, or use “Forgot password?”.";
    case "auth/weak-password":
      return "Choose a longer password (at least 6 characters).";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/account-exists-with-different-credential":
      return "That email is already used with a different sign-in method. Try the other one.";
    default:
      return fallback;
  }
}

/**
 * Google sign-in. A popup is nicest, but some browsers (in-app webviews, strict
 * popup blockers, some mobile browsers) refuse it. In that case fall back to a
 * full-page redirect, which always works; Firebase finishes sign-in when the
 * page comes back and the auth listener picks the user up.
 */
async function signInWithGoogle(auth: Auth) {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

type Mode = "signin" | "create";

/** Optional sign-in. Viewing never needs it; it's only for people who want to edit. */
export function SignInDialog({ auth, onClose, onProfileUpdated }: { auth: Auth; onClose: () => void; onProfileUpdated: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function attempt(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") setError(signInError(code, (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "create") {
      void attempt(async () => {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) {
          await updateProfile(cred.user, { displayName: name.trim() });
          onProfileUpdated();
        }
      });
    } else {
      void attempt(() => signInWithEmailAndPassword(auth, email.trim(), password));
    }
  }

  function reset() {
    if (!email.trim()) {
      setError("Enter your email above first, then choose “Forgot password?”.");
      return;
    }
    void attempt(async () => {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo(`If an account exists for ${email.trim()}, a reset link is on its way.`);
    });
  }

  return (
    <Modal title={mode === "signin" ? "Sign in to edit" : "Create an account"} onClose={onClose}>
      <p>You don’t need an account to view or search the shop. Sign in only if you want to edit or move things; an admin will approve your request.</p>

      <Button variant="primary" className="mt-3 h-8 w-full" disabled={busy} onClick={() => void attempt(() => signInWithGoogle(auth))}>
        Continue with Google
      </Button>

      <div className="my-3 flex items-center gap-2 text-2xs text-ink-3">
        <span className="h-px flex-1 bg-line" />
        or use email
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={submit} className="space-y-2.5">
        {mode === "create" && (
          <label className="block">
            <span className="text-2xs font-medium text-ink-2">Your name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="So admins know who you are" />
          </label>
        )}
        <label className="block">
          <span className="text-2xs font-medium text-ink-2">Email</span>
          <input className={field} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="block">
          <span className="text-2xs font-medium text-ink-2">Password</span>
          <input
            className={field}
            type="password"
            required
            minLength={mode === "create" ? 6 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "create" ? "new-password" : "current-password"}
          />
          {mode === "create" && <span className="mt-0.5 block text-2xs text-ink-3">At least 6 characters.</span>}
        </label>
        <Button type="submit" className="h-8 w-full" disabled={busy || !email || !password}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="mt-2 text-ink">
          {info}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-2xs">
        <button
          type="button"
          className="text-ink-2 underline underline-offset-2 hover:text-ink"
          onClick={() => {
            setMode(mode === "signin" ? "create" : "signin");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "signin" ? "Create an account" : "I already have an account"}
        </button>
        {mode === "signin" && (
          <button type="button" className="text-ink-2 underline underline-offset-2 hover:text-ink disabled:opacity-40" disabled={busy} onClick={reset}>
            Forgot password?
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Ask an admin for edit access. Nothing is granted until an admin approves. */
export function RequestAccessDialog({ who, onSend, onClose }: { who: string; onSend: (note: string) => Promise<void>; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await onSend(note);
      onClose();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === "permission-denied" ? "Couldn’t send the request. If this keeps happening, tell an admin." : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Request edit access" onClose={onClose}>
      <p>
        You’re signed in as <span className="text-ink">{who}</span>. An admin will review your request. Until then you can still view and search everything.
      </p>
      <label className="mt-3 block">
        <span className="text-2xs font-medium text-ink-2">Who are you, and what will you edit? (optional)</span>
        <textarea className="mt-1 h-20 w-full resize-none border border-line bg-white p-2 text-xs" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I’m a mentor and keep the CNC tooling organized" />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-1.5">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void send()} disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
      </div>
    </Modal>
  );
}
