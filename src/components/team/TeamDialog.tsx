"use client";

import { useEffect, useMemo, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { Role } from "@/lib/model/types";
import {
  approveRequest,
  denyRequest,
  memberName,
  removeMember,
  setMemberRole,
  sortMembers,
  sortRequests,
  subscribeMembers,
  subscribeRequests,
  type AccessRequest,
  type Member,
} from "@/lib/persistence/members";
import { IconX } from "../icons";
import { Button, IconButton, Tag, cx } from "../ui";

interface Props {
  db: Firestore;
  shopId: string;
  currentUid: string;
  onClose: () => void;
}

type Pending = { uid: string; kind: "promote" | "demote" | "remove" };

const QUESTION: Record<Pending["kind"], (name: string) => string> = {
  promote: (n) => `Make ${n} an admin? They’ll be able to approve requests and manage the team, as well as edit.`,
  demote: (n) => `Make ${n} an editor? They’ll keep edit access but can no longer manage the team.`,
  remove: (n) => `Remove ${n}’s edit access? They can still view and search, and can ask again later.`,
};

function ago(ms: number | null): string {
  if (!ms) return "just now";
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

/** Admin-only: answer edit-access requests, and manage who can edit. */
export function TeamDialog({ db, shopId, currentUid, onClose }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeMembers(db, shopId, setMembers, setLoadError), [db, shopId]);
  useEffect(() => subscribeRequests(db, shopId, (r) => setRequests(sortRequests(r)), setLoadError), [db, shopId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        if (pending) setPending(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, pending]);

  const sorted = useMemo(() => sortMembers(members ?? []), [members]);
  const adminCount = sorted.filter((m) => m.role === "admin").length;

  async function attempt(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setPending(null);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === "permission-denied" ? "Only admins can do that, and you can’t change your own role." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const run = (p: Pending) =>
    attempt(() => (p.kind === "remove" ? removeMember(db, shopId, p.uid) : setMemberRole(db, shopId, p.uid, p.kind === "promote" ? "admin" : "editor")));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/20 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="team-title" className="fade-in flex max-h-[min(680px,90dvh)] w-full max-w-lg flex-col border border-line bg-panel shadow-[0_8px_24px_rgba(34,33,31,0.12)]">
        <header className="flex items-start gap-2 border-b border-line py-3 pr-2 pl-4">
          <div className="min-w-0 flex-1">
            <h2 id="team-title" className="text-sm font-semibold">
              Edit access
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
              Anyone can view and search without signing in. People who want to edit ask for access, and you approve them here. Editors can edit and move things; admins can also manage this list.
            </p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <IconX />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadError ? (
            <p className="px-4 py-3 text-xs text-danger">{loadError}</p>
          ) : (
            <>
              <h3 className="flex items-center gap-2 border-b border-line-2 bg-line-2/40 px-4 py-1.5 text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">
                Requests
                {requests.length > 0 && <Tag tone="accent">{requests.length}</Tag>}
              </h3>
              {requests.length === 0 ? (
                <p className="border-b border-line-2 px-4 py-3 text-xs text-ink-3">No one is waiting for access.</p>
              ) : (
                <ul>
                  {requests.map((r) => {
                    const name = memberName(r);
                    return (
                      <li key={r.uid} className="border-b border-line-2 px-4 py-2.5">
                        <div className="flex items-start gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-line bg-white text-2xs font-semibold">{name[0]?.toUpperCase() ?? "?"}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="truncate text-xs font-medium">{name}</span>
                              <span className="shrink-0 text-2xs text-ink-3">{ago(r.requestedAt)}</span>
                            </div>
                            {r.displayName && r.email && <div className="truncate text-2xs text-ink-3">{r.email}</div>}
                            {r.note && <p className="mt-1 text-xs leading-relaxed text-ink-2">“{r.note}”</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void attempt(() => denyRequest(db, shopId, r.uid))}>
                              Deny
                            </Button>
                            <Button size="sm" variant="primary" disabled={busy} onClick={() => void attempt(() => approveRequest(db, shopId, r, "editor", currentUid))}>
                              Approve
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <h3 className="border-b border-line-2 bg-line-2/40 px-4 py-1.5 text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">People who can edit</h3>
              {!members ? (
                <p className="px-4 py-3 text-xs text-ink-3">Loading…</p>
              ) : (
                <ul>
                  {sorted.map((m) => {
                    const name = memberName(m);
                    const you = m.uid === currentUid;
                    const asking = pending?.uid === m.uid ? pending : null;
                    return (
                      <li key={m.uid} className="border-b border-line-2 px-4 py-2.5 last:border-b-0">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-line bg-white text-2xs font-semibold">{name[0]?.toUpperCase() ?? "?"}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-medium">{name}</span>
                              {you && <Tag>You</Tag>}
                            </div>
                            {m.displayName && m.email && <div className="truncate text-2xs text-ink-3">{m.email}</div>}
                          </div>
                          {you ? (
                            <Tag tone="ink">{m.role === "admin" ? "Admin" : "Editor"}</Tag>
                          ) : (
                            <RoleSwitch role={m.role} disabled={busy} onChange={(r) => setPending({ uid: m.uid, kind: r === "admin" ? "promote" : "demote" })} />
                          )}
                          {!you && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending({ uid: m.uid, kind: "remove" })}>
                              Remove
                            </Button>
                          )}
                        </div>
                        {asking && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 border border-line bg-white px-2.5 py-2 text-xs text-ink-2">
                            <span className="min-w-0 flex-1">{QUESTION[asking.kind](name)}</span>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>
                              Cancel
                            </Button>
                            <Button size="sm" variant={asking.kind === "remove" ? "danger" : "primary"} disabled={busy} onClick={() => void run(asking)}>
                              {asking.kind === "promote" ? "Make admin" : asking.kind === "demote" ? "Make editor" : "Remove"}
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
          <span className="text-2xs text-ink-3">
            {members ? `${members.length} ${members.length === 1 ? "person" : "people"} · ${adminCount} ${adminCount === 1 ? "admin" : "admins"}` : ""}
          </span>
          {error && (
            <span role="alert" className="min-w-0 truncate text-2xs text-danger">
              {error}
            </span>
          )}
          <Button onClick={onClose}>Done</Button>
        </footer>
      </section>
    </div>
  );
}

function RoleSwitch({ role, disabled, onChange }: { role: Role; disabled: boolean; onChange: (r: Role) => void }) {
  return (
    <div role="radiogroup" aria-label="Role" className="flex shrink-0 border border-line">
      {(["editor", "admin"] as const).map((r, i) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={role === r}
          disabled={disabled}
          onClick={() => role !== r && onChange(r)}
          className={cx("h-6 px-2 text-2xs capitalize disabled:opacity-50", i > 0 && "border-l border-line", role === r ? "bg-ink text-white" : "text-ink-2 hover:bg-line-2")}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
