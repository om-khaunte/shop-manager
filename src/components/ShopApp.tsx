"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { fitBounds, zoomAt, type Viewport } from "@/lib/geometry/camera";
import { expandRect, objectBounds, rotateBy, snap, unionBounds, type Rect } from "@/lib/geometry/shapes";
import {
  editorReducer,
  initialEditorState,
  isDirty,
  isEditing,
  presentDoc,
} from "@/lib/editor/editorState";
import { usePrefersReducedMotion, useIsDesktop, useStoredState } from "@/lib/hooks";
import {
  createObject,
  deleteObject,
  duplicateObject,
  locationsReferencingObject,
  updateObject,
  validateLayout,
  withObject,
} from "@/lib/model/layout";
import { breadcrumb, resolveChain, resolveMapObjectId, validateLocations } from "@/lib/model/locations";
import { createSeedDocument, EXAMPLE_REVEAL_LOCATION_ID } from "@/lib/model/seed";
import { layerOf, type LayerId, type ObjectKind, type Role, type Selection, type ShopDocument } from "@/lib/model/types";
import type { RemoteState, ShopRepository } from "@/lib/persistence/repository";
import { MapCanvas, type InteractionMode, type TransformHandlers } from "./map/MapCanvas";
import { useCamera } from "./map/useCamera";
import { ConfirmDialog, type ConfirmOptions } from "./shell/ConfirmDialog";
import { EditBar } from "./shell/EditBar";
import { Inspector } from "./shell/Inspector";
import { LayerPanel } from "./shell/LayerPanel";
import { focusMapSearch } from "./shell/MapSearch";
import { TopBar, type SaveIndicator } from "./shell/TopBar";
import { IconFit, IconGrid, IconLayers, IconMinus, IconPlus, IconX } from "./icons";
import { Banner, Button, IconButton, Mono, Tag } from "./ui";

interface ShopActions {
  /** Pans to a storage location's unit, opens its elevation, and highlights the compartment. */
  revealLocation: (locationId: string) => Promise<void>;
  selectObject: (objectId: string | null, opts?: { center?: boolean }) => void;
}

const ShopActionsContext = createContext<ShopActions | null>(null);

export function useShopActions(): ShopActions {
  const ctx = useContext(ShopActionsContext);
  if (!ctx) throw new Error("useShopActions must be used inside ShopApp");
  return ctx;
}

interface Props {
  repository: ShopRepository;
  role: Role;
  shopName: string;
  user: { label: string; onSignOut?: () => void };
  onResetDemo?: () => void;
  openAccess?: boolean;
}

interface RevealState {
  locationId: string;
  objectId: string;
  crumbs: string[];
  code: string;
  example: boolean;
  depth: number;
  maxDepth: number;
  done: boolean;
}

interface ViewPrefs {
  hiddenLayers: LayerId[];
  showGrid: boolean;
  snap: boolean;
  snapStep: number;
  layersCollapsed: boolean;
}

const DEFAULT_PREFS: ViewPrefs = { hiddenLayers: [], showGrid: true, snap: true, snapStep: 10, layersCollapsed: false };

const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function ShopApp({ repository, role, shopName, user, onResetDemo, openAccess }: Props) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [retryKey, setRetryKey] = useState(0);
  const [selection, setSelection] = useState<Selection>({ objectId: null, locationId: null });
  const [prefs, setPrefs] = useStoredState<ViewPrefs>("114shop:view", DEFAULT_PREFS);
  const [mode, setMode] = useState<InteractionMode>("select");
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileLayers, setMobileLayers] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const isDesktop = useIsDesktop();
  const cameraCtl = useCamera(reducedMotion);
  const revealToken = useRef(0);

  const canEdit = role === "admin";
  const doc = presentDoc(state);
  const editing = isEditing(state);
  const dirty = isDirty(state);
  const docRef = useRef(doc);
  docRef.current = doc;

  // Remote subscription ---------------------------------------------------------
  useEffect(() => repository.subscribe((s) => dispatch({ type: "remote", state: s })), [repository, retryKey]);

  // Warn before leaving with unsaved edits ------------------------------------
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const objects = useMemo(() => (doc ? Object.values(doc.layout.objects) : []), [doc]);
  const selectedObject = selection.objectId && doc ? doc.layout.objects[selection.objectId] : undefined;

  // Drop selection if its object disappears (undo, remote update, delete).
  useEffect(() => {
    if (selection.objectId && doc && !doc.layout.objects[selection.objectId]) {
      setSelection({ objectId: null, locationId: null });
    }
    if (selection.locationId && doc && (!doc.locations[selection.locationId] || doc.locations[selection.locationId].archived)) {
      setSelection((s) => ({ ...s, locationId: null }));
    }
  }, [doc, selection]);

  // Camera ----------------------------------------------------------------------
  const sheetInset = useCallback(
    (v: Viewport) => (!isDesktop && selection.objectId ? Math.round(v.height * 0.5) : 0),
    [isDesktop, selection.objectId],
  );

  const contentBounds = useCallback((): Rect | null => {
    const d = docRef.current;
    if (!d) return null;
    const visible = Object.values(d.layout.objects).filter((o) => !prefs.hiddenLayers.includes(layerOf(o.kind)));
    const all = unionBounds([{ minX: 0, minY: 0, maxX: d.layout.width, maxY: d.layout.height }, ...visible.map(objectBounds)]);
    return all ? expandRect(all, 16) : null;
  }, [prefs.hiddenLayers]);

  const fitAll = useCallback(
    (animate = true) => {
      const b = contentBounds();
      const v = cameraCtl.viewportRef.current;
      if (!b || !v.width) return;
      const target = fitBounds(b, v, isDesktop ? 28 : 14);
      if (animate) void cameraCtl.animateTo(target, 380);
      else cameraCtl.setCamera(target);
    },
    [cameraCtl, contentBounds, isDesktop],
  );

  const centerOn = useCallback(
    (objectId: string, inset?: number) => {
      const o = docRef.current?.layout.objects[objectId];
      const v = cameraCtl.viewportRef.current;
      if (!o || !v.width) return Promise.resolve();
      const b = objectBounds(o);
      const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
      const bottom = inset ?? sheetInset(v);
      const target = fitBounds(expandRect(b, Math.max(110, size)), { width: v.width, height: v.height - bottom }, 24, 2.4);
      return cameraCtl.animateTo(target, 420);
    },
    [cameraCtl, sheetInset],
  );

  const viewportReady = cameraCtl.viewport.width > 0;
  const hasDoc = !!doc;
  useEffect(() => {
    if (hasDoc && viewportReady && !cameraCtl.cameraRef.current) fitAll(false);
  }, [hasDoc, viewportReady, fitAll, cameraCtl.cameraRef]);

  const zoomBy = (factor: number) => {
    const cam = cameraCtl.cameraRef.current;
    const v = cameraCtl.viewportRef.current;
    if (!cam) return;
    void cameraCtl.animateTo(zoomAt(cam, { x: v.width / 2, y: (v.height - sheetInset(v)) / 2 }, factor), 160);
  };

  // Selection & reveal ------------------------------------------------------------
  const selectObject = useCallback(
    (objectId: string | null, opts?: { center?: boolean }) => {
      revealToken.current++;
      setReveal((r) => (r && r.objectId === objectId ? r : null));
      setSelection({ objectId, locationId: null });
      if (objectId && opts?.center) {
        const v = cameraCtl.viewportRef.current;
        void centerOn(objectId, !isDesktop ? Math.round(v.height * 0.5) : 0);
      }
    },
    [cameraCtl.viewportRef, centerOn, isDesktop],
  );

  const revealLocation = useCallback(
    async (locationId: string) => {
      const d = docRef.current;
      if (!d) return;
      let chain;
      let objectId: string | null;
      try {
        chain = resolveChain(d.locations, locationId);
        objectId = resolveMapObjectId(d.locations, locationId);
      } catch (e) {
        setNotice(`Can't reveal ${locationId}: ${(e as Error).message}`);
        return;
      }
      const target = chain[chain.length - 1];
      if (!objectId || !d.layout.objects[objectId]) {
        setNotice(`Location ${target.code} isn't attached to an object on the map.`);
        return;
      }
      const object = d.layout.objects[objectId];
      const layer = layerOf(object.kind);
      if (prefs.hiddenLayers.includes(layer)) setPrefs((p) => ({ ...p, hiddenLayers: p.hiddenLayers.filter((l) => l !== layer) }));

      const token = ++revealToken.current;
      const maxDepth = chain.length - 1;
      setReveal({
        locationId,
        objectId,
        crumbs: breadcrumb(d, locationId),
        code: target.code,
        example: !!target.example,
        depth: 0,
        maxDepth,
        done: false,
      });
      setSelection({ objectId, locationId });
      const v = cameraCtl.viewportRef.current;
      await centerOn(objectId, !isDesktop ? Math.round(v.height * 0.5) : 0);
      for (let depth = 1; depth <= maxDepth; depth++) {
        if (token !== revealToken.current) return;
        if (!reducedMotion) await new Promise((r) => setTimeout(r, 260));
        if (token !== revealToken.current) return;
        setReveal((r) => (r ? { ...r, depth } : r));
      }
      if (token === revealToken.current) setReveal((r) => (r ? { ...r, done: true } : r));
    },
    [cameraCtl.viewportRef, centerOn, isDesktop, prefs.hiddenLayers, reducedMotion, setPrefs],
  );

  const actions = useMemo(() => ({ revealLocation, selectObject }), [revealLocation, selectObject]);

  // Editing -----------------------------------------------------------------------
  const apply = useCallback((next: ShopDocument) => dispatch({ type: "apply", doc: next }), []);

  const transform: TransformHandlers = useMemo(
    () => ({
      start: () => dispatch({ type: "transformStart" }),
      preview: (id, patch) => {
        const d = docRef.current;
        if (d) dispatch({ type: "transformPreview", doc: updateObject(d, id, patch) });
      },
      end: () => dispatch({ type: "transformEnd" }),
      cancel: () => dispatch({ type: "transformCancel" }),
    }),
    [],
  );

  const issues = useMemo(() => (doc ? [...validateLayout(doc.layout), ...validateLocations(doc)] : []), [doc]);

  const save = useCallback(
    async (expectedRevision?: number) => {
      if (!doc || !state.base || state.save.status === "saving") return;
      if (issues.length) return;
      dispatch({ type: "saveStart" });
      try {
        const result = await repository.save({
          base: state.base,
          next: doc,
          expectedRevision: expectedRevision ?? state.base.layout.revision,
        });
        if (result.status === "saved") dispatch({ type: "saveSuccess", revision: result.revision });
        else dispatch({ type: "saveConflict", remoteRevision: result.remoteRevision });
      } catch (e) {
        dispatch({ type: "saveError", message: (e as Error).message || "Unknown error" });
      }
    },
    [doc, issues.length, repository, state.base, state.save.status],
  );

  const addObject = (kind: ObjectKind) => {
    const d = docRef.current;
    const cam = cameraCtl.cameraRef.current;
    const v = cameraCtl.viewportRef.current;
    if (!d || !cam) return;
    const center = { x: (v.width / 2 - cam.tx) / cam.k, y: ((v.height - sheetInset(v)) / 2 - cam.ty) / cam.k };
    const step = prefs.snap ? prefs.snapStep : 0;
    const o = createObject(d.layout.objects, kind, { x: snap(center.x, step), y: snap(center.y, step) });
    const layer = layerOf(kind);
    if (prefs.hiddenLayers.includes(layer)) setPrefs((p) => ({ ...p, hiddenLayers: p.hiddenLayers.filter((l) => l !== layer) }));
    apply(withObject(d, o));
    setSelection({ objectId: o.id, locationId: null });
  };

  const duplicateSelected = () => {
    const d = docRef.current;
    if (!d || !selectedObject) return;
    const copy = duplicateObject(d.layout.objects, selectedObject, prefs.snap ? Math.max(prefs.snapStep, 10) : 20);
    apply(withObject(d, copy));
    setSelection({ objectId: copy.id, locationId: null });
  };

  const deleteSelected = () => {
    const d = docRef.current;
    if (!d || !selectedObject) return;
    const refs = locationsReferencingObject(d, selectedObject.id).filter((l) => !l.archived);
    const doDelete = () => {
      apply(deleteObject(d, selectedObject.id));
      setSelection({ objectId: null, locationId: null });
    };
    if (refs.length === 0) return doDelete();
    const descendants = Object.values(d.locations).filter((l) => {
      try {
        return !l.archived && resolveChain(d.locations, l.id)[0]?.mapObjectId === selectedObject.id;
      } catch {
        return false;
      }
    }).length;
    setConfirm({
      title: `Delete ${selectedObject.name}?`,
      body: (
        <>
          {descendants} storage location{descendants === 1 ? "" : "s"} reference this unit. Deleting it archives them instead of removing them, so their IDs stay valid for any future item assignments. You can undo before saving.
        </>
      ),
      confirmLabel: "Delete and archive locations",
      tone: "danger",
      onConfirm: doDelete,
    });
  };

  const stopEditing = () => {
    if (!dirty) return dispatch({ type: "stopEdit" });
    setConfirm({
      title: "Leave edit mode?",
      body: "You have unsaved layout changes. Leaving discards them.",
      confirmLabel: "Discard changes",
      tone: "danger",
      onConfirm: () => dispatch({ type: "stopEdit" }),
    });
  };

  const discard = () =>
    setConfirm({
      title: "Discard changes?",
      body: "Restores the last saved layout. This can't be undone.",
      confirmLabel: "Discard",
      tone: "danger",
      onConfirm: () => dispatch({ type: "discard" }),
    });

  // Keyboard ------------------------------------------------------------------------
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (confirm || isTypingTarget(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (e.key === "Escape") {
      if (reveal) {
        revealToken.current++;
        setReveal(null);
        return;
      }
      if (selection.locationId) return setSelection((s) => ({ ...s, locationId: null }));
      if (selection.objectId) return setSelection({ objectId: null, locationId: null });
      if (mobileLayers) return setMobileLayers(false);
      return;
    }
    if (e.key === "/" && !mod) {
      e.preventDefault();
      return focusMapSearch();
    }
    if (!mod && (e.key === "+" || e.key === "=")) return zoomBy(1.4);
    if (!mod && (e.key === "-" || e.key === "_")) return zoomBy(1 / 1.4);
    if (!mod && key === "0") return fitAll();
    if (!mod && key === "g") return setPrefs((p) => ({ ...p, showGrid: !p.showGrid }));
    if (!mod && key === "f" && selection.objectId) return void centerOn(selection.objectId);

    if (!editing) {
      if (mod && key === "e" && canEdit) {
        e.preventDefault();
        dispatch({ type: "startEdit" });
      }
      return;
    }
    if (mod && key === "z") {
      e.preventDefault();
      return dispatch({ type: e.shiftKey ? "redo" : "undo" });
    }
    if (mod && key === "y") {
      e.preventDefault();
      return dispatch({ type: "redo" });
    }
    if (mod && key === "s") {
      e.preventDefault();
      if (dirty) void save();
      return;
    }
    if (!selectedObject || !doc) return;
    if (mod && key === "d") {
      e.preventDefault();
      return duplicateSelected();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      return deleteSelected();
    }
    if (!mod && key === "l") return apply(updateObject(doc, selectedObject.id, { locked: !selectedObject.locked }));
    if (selectedObject.locked) return;
    if (!mod && key === "r") return apply(updateObject(doc, selectedObject.id, { rotation: rotateBy(selectedObject.rotation, e.shiftKey ? -1 : 1) }));
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = arrows[e.key];
    if (dir && !mod) {
      e.preventDefault();
      const step = (prefs.snap ? prefs.snapStep : 1) * (e.shiftKey ? 5 : 1);
      apply(updateObject(doc, selectedObject.id, { x: selectedObject.x + dir[0] * step, y: selectedObject.y + dir[1] * step }));
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Derived UI state -----------------------------------------------------------------
  const saveIndicator: SaveIndicator = !doc
    ? { kind: "loading" }
    : state.save.status === "saving"
      ? { kind: "saving" }
      : state.save.status === "error"
        ? { kind: "error" }
        : editing
          ? dirty
            ? { kind: "unsaved" }
            : { kind: "clean" }
          : { kind: "saved", revision: state.base?.layout.revision ?? 0, updatedAt: state.base?.layout.updatedAt ?? null };

  const exampleAvailable = !!doc?.locations[EXAMPLE_REVEAL_LOCATION_ID] && !doc.locations[EXAMPLE_REVEAL_LOCATION_ID].archived;
  const revealDepth = reveal && !reveal.done && reveal.objectId === selection.objectId ? reveal.depth : null;
  const showInspector = !!selectedObject && !!doc;

  const layerPanel = doc && (
    <LayerPanel
      objects={objects}
      hiddenLayers={prefs.hiddenLayers}
      onToggleLayer={(id) =>
        setPrefs((p) => ({
          ...p,
          hiddenLayers: p.hiddenLayers.includes(id) ? p.hiddenLayers.filter((l) => l !== id) : [...p.hiddenLayers, id],
        }))
      }
      showGrid={prefs.showGrid}
      onToggleGrid={() => setPrefs((p) => ({ ...p, showGrid: !p.showGrid }))}
      selectedId={selection.objectId}
      onPick={(id) => {
        setMobileLayers(false);
        selectObject(id, { center: true });
      }}
      onCollapse={isDesktop ? () => setPrefs((p) => ({ ...p, layersCollapsed: true })) : () => setMobileLayers(false)}
      onRevealExample={exampleAvailable ? () => {
        setMobileLayers(false);
        void revealLocation(EXAMPLE_REVEAL_LOCATION_ID);
      } : null}
      editing={editing}
    />
  );

  return (
    <ShopActionsContext.Provider value={actions}>
      <div className="flex h-dvh flex-col overflow-hidden">
        <TopBar
          mode={repository.mode}
          openAccess={openAccess}
          shopName={shopName}
          layoutName={doc?.layout.name ?? null}
          draft={doc?.layout.verificationStatus !== "verified"}
          save={saveIndicator}
          doc={doc}
          onPickSearch={(id) => selectObject(id, { center: true })}
          onPickLocation={(id) => void revealLocation(id)}
          onFit={() => fitAll()}
          canEdit={canEdit}
          editing={editing}
          dirty={dirty}
          onEdit={() => dispatch({ type: "startEdit" })}
          onDone={stopEditing}
          onUndo={() => dispatch({ type: "undo" })}
          onRedo={() => dispatch({ type: "redo" })}
          canUndo={!!state.history?.past.length}
          canRedo={!!state.history?.future.length}
          onSave={() => void save()}
          onDiscard={discard}
          saveDisabled={issues.length > 0 || state.save.status === "saving" || !!state.conflict}
          user={{ label: user.label, role: repository.mode === "demo" ? "Admin · local demo" : openAccess ? "Open access · anyone with the link can edit" : role, onSignOut: user.onSignOut, onResetDemo }}
        />
        {editing && (
          <EditBar
            onAdd={addObject}
            snap={prefs.snap}
            onToggleSnap={() => setPrefs((p) => ({ ...p, snap: !p.snap }))}
            snapStep={prefs.snapStep}
            onSnapStep={(n) => setPrefs((p) => ({ ...p, snapStep: n }))}
            showGrid={prefs.showGrid}
            onToggleGrid={() => setPrefs((p) => ({ ...p, showGrid: !p.showGrid }))}
            mode={mode}
            onMode={setMode}
          />
        )}

        <div className="relative flex min-h-0 flex-1">
          {/* Layer panel: desktop column */}
          {doc && isDesktop && !prefs.layersCollapsed && (
            <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">{layerPanel}</aside>
          )}

          <main className="relative min-w-0 flex-1 overflow-hidden">
            {doc ? (
              <MapCanvas
                layout={doc.layout}
                cameraCtl={cameraCtl}
                selectedId={selection.objectId}
                revealId={reveal?.objectId ?? null}
                editing={editing}
                mode={isDesktop ? "select" : mode}
                hiddenLayers={prefs.hiddenLayers}
                showGrid={prefs.showGrid}
                snapStep={prefs.snap ? prefs.snapStep : 0}
                onSelect={(id) => selectObject(id)}
                transform={transform}
              />
            ) : (
              <EmptyState
                remote={state.remote}
                canEdit={canEdit}
                onRetry={() => setRetryKey((k) => k + 1)}
                onInitialize={async () => {
                  try {
                    const r = await repository.initialize(createSeedDocument());
                    if (r.status === "conflict") setNotice("A layout already exists; it was loaded instead of the draft seed.");
                  } catch (e) {
                    setNotice(`Couldn't create the layout: ${(e as Error).message}`);
                  }
                }}
              />
            )}

            {/* Map overlays */}
            {doc && (isDesktop ? prefs.layersCollapsed : true) && (
              <div className="absolute top-2 left-2 z-10">
                <Button
                  onClick={() => (isDesktop ? setPrefs((p) => ({ ...p, layersCollapsed: false })) : setMobileLayers(true))}
                  className="shadow-[0_1px_2px_rgba(34,33,31,0.06)]"
                >
                  <IconLayers /> Layers
                </Button>
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex flex-col items-center gap-1.5 px-2">
              {reveal && <RevealBar reveal={reveal} onClose={() => { revealToken.current++; setReveal(null); }} />}
              {state.conflict && (
                <Banner
                  tone="warn"
                  actions={
                    <>
                      <Button size="sm" onClick={() => dispatch({ type: "acceptRemote" })}>
                        Load their version
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setConfirm({
                            title: "Overwrite the other save?",
                            body: `Your layout will replace revision ${state.conflict?.remoteRevision ?? "?"} saved by someone else. Their changes will be lost.`,
                            confirmLabel: "Overwrite",
                            tone: "danger",
                            onConfirm: () => void save(state.conflict?.remoteRevision ?? undefined),
                          })
                        }
                      >
                        Overwrite…
                      </Button>
                    </>
                  }
                >
                  Another admin saved this layout (revision <Mono>{state.conflict.remoteRevision ?? "?"}</Mono>) while you were editing. Your edits are still here and have not been saved.
                </Banner>
              )}
              {state.save.status === "error" && (
                <Banner tone="error" actions={<Button size="sm" onClick={() => void save()}>Retry</Button>}>
                  Save failed: {state.save.message}. Your edits are still here.
                </Banner>
              )}
              {state.remote.status === "error" && doc && (
                <Banner tone="error" actions={<Button size="sm" onClick={() => setRetryKey((k) => k + 1)}>Reconnect</Button>}>
                  Lost connection to the saved layout: {state.remote.message}
                </Banner>
              )}
              {editing && issues.length > 0 && (
                <Banner
                  tone="error"
                  actions={
                    issues[0].objectId && doc?.layout.objects[issues[0].objectId] ? (
                      <Button size="sm" onClick={() => selectObject(issues[0].objectId!, { center: true })}>
                        Show
                      </Button>
                    ) : undefined
                  }
                >
                  Can’t save: {issues[0].message}
                  {issues.length > 1 && ` (+${issues.length - 1} more)`}
                </Banner>
              )}
              {notice && (
                <Banner tone="info" onClose={() => setNotice(null)}>
                  {notice}
                </Banner>
              )}
            </div>

            {doc && (isDesktop || !showInspector) && (
              <>
                <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 border border-line bg-panel/95 px-2 py-1 text-[10px] text-ink-2">
                  <span aria-hidden>↑</span>
                  <span>Classroom partition</span>
                  <span className="hidden text-ink-3 sm:inline">· orientation only, not north</span>
                  <span className="text-ink-3">·</span>
                  <span className="text-ink-3">{doc.layout.verificationStatus === "verified" ? "Verified layout" : "Draft — not measured"}</span>
                </div>
                <div className="absolute right-2 bottom-2 z-10 flex flex-col border border-line bg-panel shadow-[0_1px_2px_rgba(34,33,31,0.06)]">
                  <IconButton label="Zoom in (+)" onClick={() => zoomBy(1.4)}>
                    <IconPlus />
                  </IconButton>
                  <IconButton label="Zoom out (−)" onClick={() => zoomBy(1 / 1.4)} className="border-t border-line-2">
                    <IconMinus />
                  </IconButton>
                  <IconButton label="Fit map (0)" onClick={() => fitAll()} className="border-t border-line-2">
                    <IconFit />
                  </IconButton>
                  <IconButton
                    label={prefs.showGrid ? "Hide floor grid (G)" : "Show floor grid (G)"}
                    active={prefs.showGrid}
                    onClick={() => setPrefs((p) => ({ ...p, showGrid: !p.showGrid }))}
                    className="border-t border-line-2"
                  >
                    <IconGrid />
                  </IconButton>
                  <div className="border-t border-line-2 py-0.5 text-center font-mono text-[9px] text-ink-3">
                    {cameraCtl.camera ? `${Math.round(cameraCtl.camera.k * 100)}%` : "–"}
                  </div>
                </div>
              </>
            )}

            {/* Layer panel: mobile overlay */}
            {doc && !isDesktop && mobileLayers && (
              <>
                <div className="absolute inset-0 z-20 bg-ink/10" onClick={() => setMobileLayers(false)} />
                <aside className="sheet-in absolute top-0 bottom-0 left-0 z-30 flex w-64 max-w-[80%] flex-col border-r border-line bg-panel">{layerPanel}</aside>
              </>
            )}

            {/* Inspector: mobile bottom sheet */}
            {showInspector && !isDesktop && (
              <aside className="sheet-in absolute inset-x-0 bottom-0 z-30 flex h-[50%] flex-col border-t border-line bg-panel shadow-[0_-4px_16px_rgba(34,33,31,0.08)]">
                <div className="mx-auto mt-1.5 h-1 w-8 shrink-0 bg-line" aria-hidden />
                {renderInspector()}
              </aside>
            )}
          </main>

          {/* Inspector: desktop column */}
          {showInspector && isDesktop && (
            <aside className="panel-in flex w-[320px] shrink-0 flex-col border-l border-line bg-panel">
              {renderInspector()}
            </aside>
          )}
        </div>
      </div>
      {confirm && <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />}
    </ShopActionsContext.Provider>
  );

  function renderInspector() {
    if (!selectedObject || !doc) return null;
    return (
      <Inspector
        key={selectedObject.id}
        object={selectedObject}
        doc={doc}
        editing={editing}
        selectedLocationId={selection.locationId}
        revealDepth={revealDepth}
        onClose={() => selectObject(null)}
        onCenter={() => void centerOn(selectedObject.id)}
        onSelectLocation={(locationId) => {
          revealToken.current++;
          setReveal(null);
          setSelection((s) => ({ ...s, locationId }));
        }}
        apply={apply}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
      />
    );
  }
}

function RevealBar({ reveal, onClose }: { reveal: RevealState; onClose: () => void }) {
  return (
    <div role="status" className="fade-in pointer-events-auto flex max-w-full items-center gap-2 border border-ink bg-panel py-1 pr-1 pl-2.5 text-xs shadow-[0_2px_6px_rgba(34,33,31,0.08)]">
      {reveal.example && <Tag tone="warn">Example</Tag>}
      <nav aria-label="Location" className="min-w-0 truncate">
        {reveal.crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="px-1 text-ink-3">/</span>}
            <span className={i === reveal.crumbs.length - 1 ? "font-semibold text-accent-ink" : "text-ink"}>{c}</span>
          </span>
        ))}
      </nav>
      <Mono className="hidden text-ink-3 sm:inline">{reveal.code}</Mono>
      <IconButton label="Close location" onClick={onClose} className="h-6 w-6">
        <IconX width={12} height={12} />
      </IconButton>
    </div>
  );
}

function EmptyState({
  remote,
  canEdit,
  onRetry,
  onInitialize,
}: {
  remote: RemoteState;
  canEdit: boolean;
  onRetry: () => void;
  onInitialize: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (remote.status === "loading" || remote.status === "ready") {
    return <div className="flex h-full items-center justify-center text-xs text-ink-3">Loading layout…</div>;
  }
  if (remote.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold">Couldn’t load the layout</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{remote.message}</p>
          <Button className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm border border-line bg-panel p-4">
        <h2 className="text-sm font-semibold">No saved layout</h2>
        {canEdit ? (
          <>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              This shop has no layout yet. Create one from the draft drawn from the walkthrough photos. It is labeled “Draft — not measured” and every object can be edited afterward.
            </p>
            <Button
              variant="primary"
              className="mt-3"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onInitialize();
                setBusy(false);
              }}
            >
              {busy ? "Creating…" : "Create draft layout"}
            </Button>
          </>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-ink-2">An admin hasn’t published a layout for this shop yet.</p>
        )}
      </div>
    </div>
  );
}
