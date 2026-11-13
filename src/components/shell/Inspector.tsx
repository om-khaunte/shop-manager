"use client";

import { rotateBy } from "@/lib/geometry/shapes";
import { updateObject } from "@/lib/model/layout";
import {
  KIND_LABEL,
  type DoorStyle,
  type LabelPosition,
  type MapObject,
  type ObjectKind,
  type ShopDocument,
  type VerificationStatus,
} from "@/lib/model/types";
import { StorageSection } from "../storage/StorageSection";
import { IconCopy, IconLock, IconRotateCcw, IconRotateCw, IconTarget, IconTrash, IconUnlock, IconX } from "../icons";
import { Button, CommitInput, FieldLabel, IconButton, Mono, NumberInput, SectionTitle, Segmented, Select, Tag } from "../ui";

interface Props {
  object: MapObject;
  doc: ShopDocument;
  editing: boolean;
  selectedLocationId: string | null;
  revealDepth: number | null;
  onClose: () => void;
  onCenter: () => void;
  onSelectLocation: (id: string | null) => void;
  apply: (doc: ShopDocument) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const KIND_OPTIONS = (Object.keys(KIND_LABEL) as ObjectKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }));
const DOOR_OPTIONS: { value: DoorStyle; label: string }[] = [
  { value: "swing-left", label: "Swing, hinge left" },
  { value: "swing-right", label: "Swing, hinge right" },
  { value: "double", label: "Double swing" },
  { value: "rollup", label: "Roll-up" },
  { value: "opening", label: "Open passage" },
];
const LABEL_OPTIONS: { value: LabelPosition; label: string; title: string }[] = [
  { value: "center", label: "Mid", title: "Centered" },
  { value: "above", label: "↑", title: "Above" },
  { value: "below", label: "↓", title: "Below" },
  { value: "left", label: "←", title: "Left" },
  { value: "right", label: "→", title: "Right" },
  { value: "hidden", label: "Off", title: "Hidden" },
];

export function Inspector({
  object: o,
  doc,
  editing,
  selectedLocationId,
  revealDepth,
  onClose,
  onCenter,
  onSelectLocation,
  apply,
  onDuplicate,
  onDelete,
}: Props) {
  const patch = (p: Partial<MapObject>) => apply(updateObject(doc, o.id, p));
  const geometryDisabled = !!o.locked;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line pr-1 pl-3">
        <span className="text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">{KIND_LABEL[o.kind]}</span>
        <Mono className="text-ink-2">{o.code}</Mono>
        <div className="flex-1" />
        <IconButton label="Close inspector" onClick={onClose}>
          <IconX />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
        <section className="space-y-1.5">
          <h2 className="text-[15px] leading-tight font-semibold text-ink">{o.name}</h2>
          <div className="flex flex-wrap gap-1">
            <Tag tone={o.status === "verified" ? "ink" : "neutral"}>{o.status === "verified" ? "Verified" : "Draft"}</Tag>
            {o.grouped && <Tag tone="warn">Grouped · count unconfirmed</Tag>}
            {o.example && <Tag tone="warn">Example · not in shop</Tag>}
            {o.locked && <Tag>Locked</Tag>}
          </div>
          {o.description && <p className="text-xs leading-relaxed text-ink-2">{o.description}</p>}
        </section>

        <section>
          <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-2xs">
            {o.zone && (
              <>
                <dt className="text-ink-3">Area</dt>
                <dd className="text-ink">{o.zone}</dd>
              </>
            )}
            <dt className="text-ink-3">Code</dt>
            <dd><Mono>{o.code}</Mono></dd>
            <dt className="text-ink-3">ID</dt>
            <dd className="truncate"><Mono className="text-ink-2">{o.id}</Mono></dd>
            <dt className="text-ink-3">Footprint</dt>
            <dd>
              <Mono className="text-ink-2">
                {Math.round(o.w)}×{Math.round(o.h)} @ {Math.round(o.x)},{Math.round(o.y)} · {o.rotation}°
              </Mono>
            </dd>
          </dl>
          <div className="mt-2.5 flex gap-1.5">
            <Button size="sm" onClick={onCenter}>
              <IconTarget width={12} height={12} /> Center on map
            </Button>
          </div>
        </section>

        <section>
          <SectionTitle>Reference photo</SectionTitle>
          <p className="text-2xs text-ink-3">No reference photo. Photo upload is not enabled in this milestone.</p>
        </section>

        {o.kind === "storage" && (
          <StorageSection
            key={o.id}
            object={o}
            doc={doc}
            editing={editing}
            selectedLocationId={selectedLocationId}
            revealDepth={revealDepth}
            onSelectLocation={onSelectLocation}
            apply={apply}
          />
        )}

        {editing && (
          <section className="space-y-2.5 border-t border-line pt-3">
            <SectionTitle
              aside={
                <div className="flex">
                  <IconButton label={o.locked ? "Unlock position" : "Lock position"} active={o.locked} onClick={() => patch({ locked: !o.locked })}>
                    {o.locked ? <IconLock /> : <IconUnlock />}
                  </IconButton>
                  <IconButton label="Duplicate (⌘D)" onClick={onDuplicate}>
                    <IconCopy />
                  </IconButton>
                  <IconButton label="Delete" onClick={onDelete} className="hover:text-accent">
                    <IconTrash />
                  </IconButton>
                </div>
              }
            >
              Edit object
            </SectionTitle>

            <div>
              <FieldLabel htmlFor="obj-name">Name</FieldLabel>
              <CommitInput id="obj-name" value={o.name} onCommit={(v) => v.trim() && patch({ name: v.trim() })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel htmlFor="obj-short">Short label</FieldLabel>
                <CommitInput id="obj-short" value={o.shortLabel ?? ""} placeholder="Shown when zoomed out" maxLength={24} onCommit={(v) => patch({ shortLabel: v.trim() || undefined })} />
              </div>
              <div>
                <FieldLabel htmlFor="obj-code">Display code</FieldLabel>
                <CommitInput id="obj-code" mono value={o.code} maxLength={16} onCommit={(v) => v.trim() && patch({ code: v.trim() })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel htmlFor="obj-kind">Type</FieldLabel>
                <Select
                  id="obj-kind"
                  value={o.kind}
                  options={KIND_OPTIONS}
                  onChange={(kind) =>
                    patch({
                      kind,
                      door: kind === "door" ? (o.door ?? { style: "swing-left" }) : undefined,
                      wall: kind === "wall" ? (o.wall ?? { style: "solid" }) : undefined,
                    })
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="obj-status">Status</FieldLabel>
                <Select<VerificationStatus>
                  id="obj-status"
                  value={o.status}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "verified", label: "Verified" },
                  ]}
                  onChange={(status) => patch({ status })}
                />
              </div>
            </div>
            {o.kind === "door" && (
              <div>
                <FieldLabel htmlFor="obj-door">Door style</FieldLabel>
                <Select id="obj-door" value={o.door?.style ?? "opening"} options={DOOR_OPTIONS} onChange={(style) => patch({ door: { style } })} />
              </div>
            )}
            {o.kind === "wall" && (
              <div>
                <FieldLabel>Wall style</FieldLabel>
                <Segmented
                  ariaLabel="Wall style"
                  value={o.wall?.style ?? "solid"}
                  options={[
                    { value: "solid", label: "Solid" },
                    { value: "glass", label: "Glass" },
                  ]}
                  onChange={(style) => patch({ wall: { style } })}
                />
              </div>
            )}
            <div>
              <FieldLabel htmlFor="obj-zone">Area</FieldLabel>
              <CommitInput id="obj-zone" value={o.zone ?? ""} placeholder="e.g. Left wall" onCommit={(v) => patch({ zone: v.trim() || undefined })} />
            </div>
            <div>
              <FieldLabel htmlFor="obj-desc">Description</FieldLabel>
              <CommitInput id="obj-desc" multiline maxLength={280} value={o.description ?? ""} onCommit={(v) => patch({ description: v.trim() || undefined })} />
            </div>
            <div>
              <FieldLabel>Label position</FieldLabel>
              <Segmented ariaLabel="Label position" value={o.labelPosition} options={LABEL_OPTIONS} onChange={(labelPosition) => patch({ labelPosition })} />
            </div>
            <div>
              <FieldLabel>Geometry {o.locked && <span className="text-ink-3">· locked</span>}</FieldLabel>
              <div className="grid grid-cols-2 gap-1.5">
                <NumberInput label="X" value={o.x} disabled={geometryDisabled} onCommit={(x) => patch({ x })} />
                <NumberInput label="Y" value={o.y} disabled={geometryDisabled} onCommit={(y) => patch({ y })} />
                <NumberInput label="W" value={o.w} min={1} disabled={geometryDisabled} onCommit={(w) => patch({ w })} />
                <NumberInput label="H" value={o.h} min={1} disabled={geometryDisabled} onCommit={(h) => patch({ h })} />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="flex h-7 flex-1 items-center border border-line bg-white">
                  <span className="w-6 text-center font-mono text-[10px] text-ink-3">R</span>
                  <span className="font-mono text-[11px]">{o.rotation}°</span>
                </div>
                <Button size="md" disabled={geometryDisabled} onClick={() => patch({ rotation: rotateBy(o.rotation, -1) })} aria-label="Rotate 90° counter-clockwise">
                  <IconRotateCcw />
                </Button>
                <Button size="md" disabled={geometryDisabled} onClick={() => patch({ rotation: rotateBy(o.rotation, 1) })} aria-label="Rotate 90° clockwise">
                  <IconRotateCw />
                </Button>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-ink-3">X/Y is the footprint center in layout units (not feet or meters). Storage fronts face the heavy edge.</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
