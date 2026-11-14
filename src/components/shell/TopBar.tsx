"use client";

import { useEffect, useRef, useState } from "react";
import type { ShopDocument } from "@/lib/model/types";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { IconFit, IconMoon, IconRedo, IconSun, IconUndo } from "../icons";
import { Button, cx, IconButton, Mono, Tag } from "../ui";
import { MapSearch } from "./MapSearch";

export type SaveIndicator =
  | { kind: "saved"; revision: number; updatedAt: number | null }
  | { kind: "clean" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "error" }
  | { kind: "loading" };

interface Props {
  mode: "demo" | "firebase";
  openAccess?: boolean;
  shopName: string;
  layoutName: string | null;
  draft: boolean;
  save: SaveIndicator;
  doc: ShopDocument | null;
  onPickSearch: (id: string) => void;
  onPickLocation: (id: string) => void;
  onFit: () => void;
  canEdit: boolean;
  editing: boolean;
  dirty: boolean;
  onEdit: () => void;
  onDone: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveDisabled: boolean;
  user: { label: string; role: string; onSignOut?: () => void; onResetDemo?: () => void };
}

function SaveState({ save }: { save: SaveIndicator }) {
  if (save.kind === "loading") return <span className="text-2xs text-ink-3">Loading…</span>;
  if (save.kind === "saving") return <span className="text-2xs text-ink-2">Saving…</span>;
  if (save.kind === "error") return <span className="text-2xs font-medium text-accent">Save failed</span>;
  if (save.kind === "unsaved")
    return (
      <span className="flex items-center gap-1.5 text-2xs font-medium text-ink">
        <span className="h-1.5 w-1.5 bg-accent" aria-hidden />
        Unsaved changes
      </span>
    );
  if (save.kind === "clean") return <span className="text-2xs text-ink-3">No changes</span>;
  const time = save.updatedAt ? new Date(save.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <span className="text-2xs text-ink-3">
      Saved{time ? ` ${time}` : ""} · <Mono>rev {save.revision}</Mono>
    </span>
  );
}

export function TopBar(p: Props) {
  return (
    <header className="relative z-20 flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-2.5 md:gap-3 md:px-3">
      <div className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold tracking-tight">
        <span
          role="img"
          aria-label="Team 114 Eagle Robotics"
          className="brand-mark block h-[26px] w-[32px] bg-ink"
          style={{ maskImage: "url(/eagle-mask.png)", WebkitMaskImage: "url(/eagle-mask.png)", maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
        />
        <span>114</span>
        <span className="font-normal text-ink-3">/</span>
        <span>Shop</span>
      </div>

      <div className="hidden min-w-0 items-center gap-2 border-l border-line pl-3 lg:flex">
        <span className="truncate text-xs text-ink-2">{p.shopName}</span>
        {p.layoutName && p.draft && <Tag tone="warn">Draft — not measured</Tag>}
      </div>

      <div className="min-w-0 flex-1 md:flex md:justify-center">
        <MapSearch doc={p.doc} onPickObject={p.onPickSearch} onPickLocation={p.onPickLocation} />
      </div>

      <div className="hidden items-center md:flex">
        <SaveState save={p.save} />
      </div>

      {p.mode === "demo" && (
        <span title="Edits are stored in this browser only, separate from shop data." className="shrink-0">
          <Tag tone="accent">
            <span className="max-sm:hidden">Local&nbsp;</span>demo
          </Tag>
        </span>
      )}
      {p.openAccess && (
        <span title="No sign-in yet: anyone with the link can view and edit this map." className="shrink-0 max-sm:hidden">
          <Tag>Open access</Tag>
        </span>
      )}

      {p.editing ? (
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Undo (⌘Z)" disabled={!p.canUndo} onClick={p.onUndo}>
            <IconUndo />
          </IconButton>
          <IconButton label="Redo (⇧⌘Z)" disabled={!p.canRedo} onClick={p.onRedo}>
            <IconRedo />
          </IconButton>
          <span className="mx-1 h-4 w-px bg-line max-sm:hidden" />
          <Button variant="ghost" disabled={!p.dirty} onClick={p.onDiscard} className="max-sm:hidden">
            Discard
          </Button>
          <Button variant="primary" disabled={!p.dirty || p.saveDisabled} onClick={p.onSave}>
            Save
          </Button>
          <Button onClick={p.onDone}>Done</Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button onClick={p.onFit} className="max-md:hidden">
            <IconFit /> Fit map
          </Button>
          {p.canEdit && (
            <Button onClick={p.onEdit} disabled={p.layoutName === null}>
              Edit layout
            </Button>
          )}
        </div>
      )}

      <ThemeButton />
      <UserMenu user={p.user} />
    </header>
  );
}

function ThemeButton() {
  const { resolved, toggle } = useTheme();
  const dark = resolved === "dark";
  return (
    <IconButton label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle} className="border border-line bg-white hover:border-ink-3">
      {dark ? <IconSun /> : <IconMoon />}
    </IconButton>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function UserMenu({ user }: { user: Props["user"] }) {
  const [open, setOpen] = useState(false);
  const { preference, setPreference } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const initial = user.label.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx("flex h-7 w-7 items-center justify-center border border-line text-2xs font-semibold", open ? "bg-ink text-white" : "bg-white hover:border-ink-3")}
      >
        {initial}
      </button>
      {open && (
        <div className="pop-in absolute top-8 right-0 z-30 w-56 border border-line bg-panel py-1 shadow-[0_4px_12px_rgba(34,33,31,0.08)]">
          <div className="px-3 py-1.5">
            <div className="truncate text-xs font-medium">{user.label}</div>
            <div className="text-2xs text-ink-3 capitalize">{user.role}</div>
          </div>
          <div className="border-y border-line-2 px-3 py-2">
            <div className="mb-1 text-2xs text-ink-3">Theme</div>
            <div role="radiogroup" aria-label="Theme" className="flex border border-line">
              {THEME_OPTIONS.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={preference === o.value}
                  onClick={() => setPreference(o.value)}
                  className={cx("h-6 flex-1 text-2xs", i > 0 && "border-l border-line", preference === o.value ? "bg-ink text-white" : "text-ink-2 hover:bg-line-2")}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {user.onResetDemo && (
            <button type="button" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-line-2" onClick={() => { setOpen(false); user.onResetDemo?.(); }}>
              Reset demo data…
            </button>
          )}
          {user.onSignOut && (
            <button type="button" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-line-2" onClick={user.onSignOut}>
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}