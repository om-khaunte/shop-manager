"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "../ui";

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
}

export function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="fade-in w-full max-w-sm border border-line bg-panel shadow-[0_8px_24px_rgba(34,33,31,0.12)]">
        <div className="px-4 pt-3.5 pb-3">
          <h2 id="confirm-title" className="text-sm font-semibold">
            {options.title}
          </h2>
          <div className="mt-1.5 text-xs leading-relaxed text-ink-2">{options.body}</div>
        </div>
        <div className="flex justify-end gap-1.5 border-t border-line px-3 py-2.5">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant={options.tone === "danger" ? "danger" : "primary"}
            onClick={() => {
              options.onConfirm();
              onClose();
            }}
          >
            {options.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
