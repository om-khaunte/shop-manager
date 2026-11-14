# 114 / Shop

Map-first organization for the Team 114 robotics workshop. Milestone one is the editable shop floor plan: a top-down SVG map, an admin layout editor, storage front-elevation diagrams, and the location model that future inventory will hang off.

Stack: Next.js 15 (App Router, client-rendered map) · TypeScript · Tailwind 4 · Firebase Auth / Firestore · Vitest.

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
```

- `/` is the real app. Without Firebase env vars it shows **Firebase is not configured** and a link to the demo. It never falls back to local data on its own.
- `/demo` is the explicit **local demo**. You act as admin, edits persist in this browser's `localStorage` under `114shop:demo:v1`, and a "Local demo" tag stays visible. Reset it from the account menu.

## Using the map

| Action | Desktop | Touch |
| --- | --- | --- |
| Pan | Drag empty space (or anything in view mode); Alt+drag or middle-drag in edit mode | One-finger drag (edit mode: switch to Pan in the edit bar) |
| Zoom | Wheel / trackpad pinch (anchored at cursor), `+` `-` | Pinch |
| Fit map | `0` or **Fit map** | Fit button, bottom right |
| Select | Click; Tab to focus objects, Enter to select | Tap |
| Center selection | `F` or **Center on map** | **Center on map** |
| Theme | Sun/moon button in the top bar (System / Light / Dark in the account menu) | Same |
| Floor grid | `G`, the grid button above the zoom controls, or **Grid** in the layer panel | Grid button |
| Find | `/` focuses **Find on map** (searches map object names, short labels, codes, types, areas) | Search box |
| Cancel | `Esc` cancels a drag, then closes the reveal, then deselects | — |

**Edit layout** (admins only) adds a second toolbar. Drag to move, use the handles to resize, `R` / `Shift+R` rotates 90°, arrows nudge (Shift = 5×), `L` locks, `⌘D` duplicates, `Delete` deletes, `⌘Z` / `⇧⌘Z` undo/redo, `⌘S` saves. Snap is on by default; hold Alt to bypass it. View mode can never move objects.

Edits stay local until **Save**. **Discard** restores the last saved layout. Leaving the page with unsaved edits triggers the browser's warning.

## Firebase setup

The app currently runs in **open access** mode (`NEXT_PUBLIC_AUTH_MODE=open`): there's no sign-in, and anyone with the link can view and edit the map. An "Open access" tag stays visible in the top bar. `firestore.open.rules` (what `firebase.json` deploys) still limits writes to `shop-114`, validates every layout and location, requires each save to advance the revision by one, and denies all deletes.

1. Create a Firebase project and enable **Cloud Firestore** (production mode).
2. Register a web app, copy its config into `.env.local` using the names in `.env.example`.
3. Deploy rules: `npm run deploy:rules`.
4. Open the app and choose **Create draft layout** once. Every save after that goes to Firestore.

### Turning on sign-in (Google or email + password)

Once on, **anyone can view, search and locate without an account**. Signing in is optional and only needed to edit or move things: a signed-in person taps **Request edit access**, and an admin approves (or denies) it from **Account → Edit access…**. Approved people become **editors** (edit and move); admins can also approve requests and manage the list, and can promote editors to admin. Until you do these steps the live site stays in open-access mode, so nothing changes for the team.

1. Firebase console → **Authentication → Sign-in method**: enable **Google** and **Email/Password**.
2. **Authentication → Settings → Authorized domains**: add your Vercel domain(s).
3. Publish the rules: copy `firestore.rules` into Firestore → **Rules** and publish (or run `npm run deploy:rules`). **Do this before step 4**, or the app will show access errors.
4. Set `NEXT_PUBLIC_AUTH_MODE=accounts` locally and on Vercel, then redeploy.
5. Make yourself the first admin (there is intentionally no "make me admin" button):
   1. Open the site, **Sign in to edit**, and send an access request.
   2. Firebase console → Firestore → `shops/shop-114/members/` → **Add document** with the Document ID set to your UID (the ID of your document under `requests/`, or Authentication → Users) and a field `role` = `admin` (string). Optionally add `displayName` and `email`.
   3. Your page flips live: you now see **Edit layout** and **Edit access…**. If the shop has no layout yet, choose **Create draft layout** once. You can delete your leftover request doc.
6. **If Google sign-in bounces back to the map still signed out** (common on Safari, Chrome and phones): set `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` on Vercel to your site's own domain (e.g. `shop.team114.org`, no `https://`) and redeploy. The app proxies Firebase's sign-in helper through that domain. Then in Google Cloud console → APIs & Services → Credentials → the "Web client (auto created by Google Service)" OAuth client, add `https://<your domain>/__/auth/handler` to **Authorized redirect URIs** (and the domain to authorized JavaScript origins). Email + password sign-in never needs this.
7. Everyone else: they request access; you see a "waiting" badge on your account menu and approve them in **Edit access…**. You can also demote or remove people. Nobody can change their own role.

How it's enforced: the app hides editing for viewers, and `firestore.rules` independently refuses every layout and storage write unless the signed-in user has a member document with role `admin` or `editor` (covered by `npm run test:rules`).

### Deploying on Vercel

Import the repo, set the same `NEXT_PUBLIC_*` variables (including `NEXT_PUBLIC_AUTH_MODE`) for Production and Preview, and deploy. Once sign-in is on, add your Vercel domains under **Firebase Auth → Settings → Authorized domains** so sign-in works. `/demo` stays available on every deployment for review.

### Emulators (auth + rules)

Requires Java 11+.

```bash
npm run test:rules        # boots the Firestore emulator, runs tests/rules/*, shuts down
npm run emulators         # auth :9099, firestore :8080, storage :9199, UI :4000
npm run dev:emulators     # app pointed at the emulators (project demo-114-shop; no real config needed)
npm run seed:emulator -- <uid> admin   # make an emulator user an admin (demo-* projects only)
```

## Tests

```bash
npm test            # geometry, history, serialization, locations, compartments, revision conflicts
npm run test:rules  # Firestore viewer/editor/admin authorization and access requests against the emulator
```

## Code layout

```
src/lib/geometry/     camera (screen↔world, zoom at point, fit), footprints (rotation, bounds, resize)
src/lib/model/        types, layout ops + validation + serialization, location hierarchy, seed, history
src/lib/editor/       pure editor reducer: draft history, save/conflict states
src/lib/persistence/  repository interface, local demo repo, Firestore repo (transaction + revision)
src/components/map/   SVG renderer, gestures, labels with level of detail, camera controller
src/components/storage/  front-elevation diagram + storage configuration
src/components/shell/ top bar, edit bar, layer panel, inspector, search, dialogs
firestore.rules · storage.rules · tests/rules/
```

Rendering, geometry, and persistence are independent: geometry is pure functions, the renderer only reads a `Layout`, and repositories only see serialized documents.

## Data model

```
shops/{shopId}                  name, activeLayoutId
shops/{shopId}/members/{uid}    role: "admin" | "member"
shops/{shopId}/layouts/{id}     name, schemaVersion, revision, coordinateUnits: "arbitrary",
                                width, height, verificationStatus, objects{ [objectId]: MapObject },
                                updatedAt (server time), updatedBy
shops/{shopId}/locations/{id}   parentId, mapObjectId, kind, label, code, sortOrder,
                                diagramPosition{row,col}, archived, compartments{type,rows,cols}, updatedAt
shops/{shopId}/items/{id}       (future) name, aliases, category, homeLocationId, photoPath, notes, archived
```

- **Map objects** store center `x, y`, `w, h`, and `rotation` (0/90/180/270) in layout units. Camera zoom and window size never touch saved geometry. A storage unit's front is its local bottom edge (drawn heavier), so rotation tells you which way it opens.
- **Walls and doors are ordinary objects** (`wall`, `door`), so the room outline is data. Doors draw an opening, jambs, and a swing arc or roll-up line.
- **Locations** form a tree: `unit → drawer → bin`, `unit → cubby`, `unit → slot`. A unit points at its map object; everything below resolves through parents. Items will reference a leaf location ID, so moving a cabinet, renaming a drawer, or changing a display code never breaks an assignment.
- **Compartment edits never delete.** Shrinking a grid archives the cells that fall outside and resizing back restores the same IDs. Removing a drawer archives it. Deleting a map object archives its locations. Firestore rules deny location deletes.
- **revealLocation(locationId)** (in `ShopApp`, exposed via `useShopActions()`) resolves the chain, finds the map object, runs a short camera move, opens the elevation, and highlights each level down to the leaf, with a breadcrumb bar. Under reduced motion it shows everything at once. The demo button in the layer panel uses the clearly labeled **Example drawer cabinet** (placed outside the room) and is not a real item assignment.

### Saving and conflicts

Saves run in a Firestore transaction that reads the layout's `revision`, refuses if it isn't the revision the editor started from, then writes `revision + 1`, the layout, and only the changed location docs, all with server timestamps. Rules independently require `revision == previous + 1`, so even a hand-crafted write with a stale revision fails. If someone else saves while you're editing, you get a conflict banner: load their version, or explicitly overwrite after a confirmation. A failed save keeps your edits and offers Retry.

### Layout document size, and the migration path

The whole floor plan lives in one layout document so a save is a single atomic revision. Firestore caps documents at 1 MiB. Each object is roughly 250–400 bytes serialized, so the current ~45 objects use about 15 KB, and rules cap a layout at 1,500 objects (~0.5 MB). That is far beyond a single shop.

If the map grows substantially (many rooms, per-bin footprints), move to object documents:

1. Add `shops/{shopId}/layouts/{id}/objects/{objectId}` with the same `MapObject` fields. IDs are already stable and keyed, so this is a copy, not a re-key.
2. Keep `revision`, `updatedAt`, `updatedBy` on the layout doc as the lock. Saves stay a transaction: check revision, write changed objects, bump revision. Rules can use `getAfter()` to require that object writes bump the parent revision.
3. Bump `schemaVersion` to 2. Readers that see 2 load the subcollection, and a one-off script copies `objects` out and deletes the map field.

## The draft map: what's known vs. assumed

The seed (`src/lib/model/seed.ts`) comes from walkthrough photos and the hand sketch. It's labeled **Draft — not measured**, and every object starts as `draft`.

- **Orientation**: the classroom glass partition is at the top. That's a display convention, not north.
- **Units**: 1200 × 1800 arbitrary units. Nothing is in feet or meters, and sizes are only relative.
- **Grouped footprints** (hatched, dashed) stand in for clusters whose count isn't confirmed: tool storage along the partition, miter-saw stations, drill presses, assembly tables, blue tool-drawer cabinets, manual lathes, manual mills, parts & clamp storage.
- **Two Grizzly G0751 mills** are drawn individually near the partition-side mill area. Which mill area each one actually sits in isn't confirmed.
- **Approximate placements**: the pedestrian exit along the right wall, the flammables cabinet (between the roll-up doors), and the CAMaster bench.
- **Not inferred**: drawer counts, cubby grids, and shelf counts. Every real storage unit starts as "Storage layout not configured". Configure them from the unit itself.
- **No walking routes or clearance claims.** Aisles look open on the draft, but nothing here checks safe clearances or code compliance.
