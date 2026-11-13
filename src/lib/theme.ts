"use client";

import { useCallback, useSyncExternalStore } from "react";
import { THEME_KEY } from "./themeScript";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const listeners = new Set<() => void>();
const media = () => (typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)"));

export function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? (media()?.matches ? "dark" : "light") : pref;
}

function apply(pref: ThemePreference, animate: boolean) {
  const root = document.documentElement;
  if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-fade");
    window.setTimeout(() => root.classList.remove("theme-fade"), 300);
  }
  root.dataset.theme = resolve(pref);
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage unavailable: the choice lasts for this page view only */
  }
  apply(pref, true);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const m = media();
  const onSystem = () => {
    if (readPreference() === "system") apply("system", true);
    cb();
  };
  m?.addEventListener("change", onSystem);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    m?.removeEventListener("change", onSystem);
    window.removeEventListener("storage", cb);
  };
}

export function useTheme() {
  const preference = useSyncExternalStore<ThemePreference>(subscribe, readPreference, () => "system");
  const resolved = useSyncExternalStore<ResolvedTheme>(subscribe, () => resolve(readPreference()), () => "light");
  const toggle = useCallback(() => setThemePreference(resolved === "dark" ? "light" : "dark"), [resolved]);
  return { preference, resolved, setPreference: setThemePreference, toggle };
}
