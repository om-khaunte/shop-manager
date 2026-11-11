import { breadcrumb, resolveChain } from "./model/locations";
import { KIND_LABEL, LOCATION_KIND_LABEL, type MapObject, type ShopDocument, type StorageLocation } from "./model/types";

export type SearchResult =
  | { type: "object"; id: string; object: MapObject; score: number }
  | { type: "location"; id: string; location: StorageLocation; path: string[]; score: number };

const norm = (s: string) => s.toLowerCase();

function scoreObject(o: MapObject, tokens: string[]): number {
  const name = norm(o.name);
  const short = norm(o.shortLabel ?? "");
  const code = norm(o.code);
  const rest = [KIND_LABEL[o.kind], o.zone ?? "", o.description ?? ""].map(norm);
  let total = 0;
  for (const t of tokens) {
    let s = 0;
    if (name.startsWith(t) || short.startsWith(t) || code === t) s = 3;
    else if (name.includes(t) || short.includes(t) || code.includes(t)) s = 2;
    else if (rest.some((f) => f.includes(t))) s = 1;
    if (!s) return 0;
    total += s;
  }
  return total / tokens.length;
}

function scoreLocation(l: StorageLocation, path: string[], tokens: string[]): number {
  const label = norm(l.label);
  const code = norm(l.code);
  const ancestors = norm(path.slice(0, -1).join(" "));
  const kind = norm(LOCATION_KIND_LABEL[l.kind]);
  let total = 0;
  for (const t of tokens) {
    let s = 0;
    if (label.startsWith(t) || code === t) s = 3.5;
    else if (label.includes(t) || code.includes(t)) s = 2.5;
    else if (ancestors.includes(t)) s = 1.5;
    else if (kind.includes(t)) s = 1;
    if (!s) return 0;
    total += s;
  }
  // Deeper compartments are more specific, so rank them just ahead of their parents.
  return total / tokens.length + path.length * 0.01;
}

/**
 * Searches map objects and every storage compartment. Each word must match
 * somewhere, so "cubby sandpaper" finds the "Sandpaper" drawer in a cubby.
 * Compartments return their full path (area / unit / cubby / drawer).
 */
export function searchShop(doc: ShopDocument, query: string, limit = 8): SearchResult[] {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const results: SearchResult[] = [];

  for (const o of Object.values(doc.layout.objects)) {
    if (o.kind === "wall") continue;
    const score = scoreObject(o, tokens);
    if (score > 0) results.push({ type: "object", id: o.id, object: o, score });
  }

  for (const l of Object.values(doc.locations)) {
    if (l.kind === "unit") continue;
    let chain: StorageLocation[];
    try {
      chain = resolveChain(doc.locations, l.id);
    } catch {
      continue;
    }
    if (chain.some((c) => c.archived)) continue;
    const unit = chain[0];
    if (!unit.mapObjectId || !doc.layout.objects[unit.mapObjectId]) continue;
    const path = breadcrumb(doc, l.id);
    const score = scoreLocation(l, path, tokens);
    if (score > 0) results.push({ type: "location", id: l.id, location: l, path, score });
  }

  return results
    .sort((a, b) => b.score - a.score || label(a).localeCompare(label(b)))
    .slice(0, limit);
}

const label = (r: SearchResult) => (r.type === "object" ? r.object.name : r.location.label);
