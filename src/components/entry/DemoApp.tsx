"use client";

import { useMemo, useState } from "react";
import { createSeedDocument } from "@/lib/model/seed";
import { LocalDemoRepository } from "@/lib/persistence/local";
import { ShopApp } from "../ShopApp";
import { ConfirmDialog } from "../shell/ConfirmDialog";
import { useMounted } from "./useMounted";

/** Explicit local demo: browser-only data under its own storage key; the user acts as admin. */
export function DemoApp() {
  const mounted = useMounted();
  const repository = useMemo(() => (mounted ? new LocalDemoRepository(window.localStorage, createSeedDocument) : null), [mounted]);
  const [confirmReset, setConfirmReset] = useState(false);
  if (!repository) return null;
  return (
    <>
      <ShopApp
        repository={repository}
        role="admin"
        shopName="Main shop · local demo"
        user={{ label: "Local demo user" }}
        onResetDemo={() => setConfirmReset(true)}
      />
      {confirmReset && (
        <ConfirmDialog
          options={{
            title: "Reset demo data?",
            body: "Replaces this browser’s demo layout with the original draft seed. Firebase data is not affected.",
            confirmLabel: "Reset demo",
            tone: "danger",
            onConfirm: () => {
              repository.reset();
              window.location.reload();
            },
          }}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </>
  );
}
