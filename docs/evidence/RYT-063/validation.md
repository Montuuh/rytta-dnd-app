# RYT-063 verification: map generator v2, map doctrine and a full-width DM tabletop

Delivery of 2026-11-05 on top of RYT-055–062 (uncommitted on `main`, base 8a862ac). ADR 032 addendum,
[map doctrine](../../map-doctrine.md), research follow-up in [research](../../research.md).

## What changed

- **Research.** D&D Sync's maps come from its own generator (`vtt/dungeon.js`, "Dynamic Dungeons", with
  `env-*` modules). Only module headers were read to name its public techniques; nothing was copied.
- **Generator v2** (`src/features/tabletop/domain/generator/`): `core.ts` (types, sub-streams, A*
  with a turn penalty, distances, partition, unpinch), `outline.ts` (contour tracing, relaxation,
  corner cutting), `dungeon.ts` (rooms by size wish list, snug packing, spanning tree plus loops,
  A* passages, exit to the edge, roles, doors, furniture by purpose, catacomb niches, the nave crypt),
  `outdoor.ts` (caverns and tunnels, mouth, pools or a lake, cavern reveal areas; forests with
  clearings, trail, spurs, stream and bridge, dart-thrown trees), `tavern.ts` (cellar door and note).
- **Painter v2** (`ui/painter.ts`): one traced wall outline, hatching clusters and a light band (ink),
  flagstones, slabs and cave plates with decals, a masonry rim and wall shadow (painted), water with
  shore and ripples, trails and streams along centre lines, layered tree crowns.
- **UI.** Generator: a Traps switch (dungeon, crypt, cave), note seals and locked doors in the
  preview, the rolled variant and the note count in the caption; DM notes written in the DM's
  language on create. Passages are numbered apart from rooms (`isPassage`, `roomNumbers`) on the
  board and in the event inspector. The DM tabletop library and editor span the window from 48em;
  the dock grows to 28rem on wide screens; the phone generator's sticky preview has a soft edge.

## Acceptance

| Criterion | Evidence |
| --- | --- |
| Dungeon layout with roles, loops and meaningful doors | `generator.test.ts` "dungeons follow the map doctrine" (5 seeds at 47 × 26) |
| Crypt variants, caves with one mouth and caverns, forests with clearings, trail and spaced trees | `generator.test.ts` "lays out the kind-specific features" |
| Passages as reveal areas, door rooms exist, notes and door states in the scene content | `generator.test.ts` connectivity loop and "writes the notes and door states"; e2e stores `pass-` rooms and notes Entrada, Objetivo, Trampa |
| Traced outlines fill the region; deterministic per seed; traps never move the layout | `generator.test.ts` outline and trap-stream assertions |
| Full width from 48em | e2e: library and editor wider than 1380 px at 1440 px; captures `docs/evidence/RYT-055/*-desktop.png` |
| Map doctrine | `docs/map-doctrine.md` |

## Checks

- `npm run check`: typecheck, lint, architecture, docs and AI contracts, 294 unit and SQL tests
  (41 files, 10 in `generator.test.ts`), build — passed.
- `RYT_EVIDENCE=1 RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts` on identity-desktop,
  identity-tablet and identity-mobile: 15 passed. New assertions: full width at 1440 px (library
  and editor wider than 1380 px), the Traps switch and preview seals, stored `pass-` rooms and the
  notes Entrada, Objetivo and Trampa.
- Map renders of every kind and look checked at 24 px per square (47 × 26) in a browser.
- No database change: rooms keep `{id, rects}`, notes and door states use the existing item
  contract (`tabletop_data_ok`), so no migration and no hosted change.

## Design flow

Phases 1–2 (brief and frontend refinement) were not rerun: this is a refinement inside the RYT-055
art direction (design-flow.md section 2) and the existing generator dialog. Phase 4 (Impeccable
critique and audit) and phase 5 (independent `ui-ux`) are recorded below.

### Impeccable critique and audit (2026-11-05)

Method: dual-agent (A design review, B detector and technical audit), isolated sub-agents. The
detector found nothing on the changed markup and styles (exit 0). A scored 27/40 on the Nielsen
heuristics; B scored 13/20 on the audit. Fixed:

| Finding | Fix |
| --- | --- |
| P1 Room numbers 1.4–2.1:1 on painted maps and under DM fog; passages only in the inspector | Room keys as parchment plates in the top layer; passage keys (P1, P2…) while Fog, a door or an event is in use; the reveal list grouped (Rooms, Passages) and searchable; a door names what it reveals |
| P1 Large taverns lost notes and props past 600 items; the preview showed what was not stored | `generateMap` keeps doors and notes and trims furniture to the save contract; big halls space their tables |
| P1 Forest preview painted in 0.7 s at 80 × 80 | Batched paths split every 400 shapes; no leaf litter below 16 px per square |
| P1 Low windows: sticky preview and footer left no room | Nothing sticks below 34em of height; focus clears the sticky parts (`scroll-padding`) |
| P2 Painted joints louder than the grid; crypt slabs drew a second grid; wall shadow turned passages into rails | Narrow stone tones, courses offset from the grid (crypt slabs offset half a square), a 0.34 shadow plus a faint 0.6 one |
| P2 Forest canopy covered 50–75% of the ground | Full crowns only in a three-square frame; smaller crowns inside |
| P2 Reroll buried and irreversible | "Otra semilla" and "Anterior" (last eight seeds) under the preview; seed field with help |
| P2 Double creation while painting | One creation at a time |
| P2 Caption churn, locked doors by colour only | `aria-atomic`; locked doors carry a keyhole and are counted; passages and "none is secret" in the caption |
| P2 Switches under 44 px; desktop sticky preview under the dialog header | 44 px switch rows; the preview sticks below the header |
| P3 Hidden options kept in the recipe; cave trap help spoke of rooms | Options that do not apply are dropped; cave help speaks of tunnels |

Left as P3 follow-ups: a dimmer "night" ink palette for dark rooms, tiles drawn to scale for size and
density, a shared door and pin glyph between board and preview, portrait boards that fit the map's
height, deduplicated fog operations when a door reopens, and header alignment on screens over 1440 px
(the header keeps the shell measure by decision).

Checks after the fixes: `npm run check` passed (295 tests, build); tabletop e2e 15 passed on
desktop, tablet and mobile (new: previous seed restores the rolled seed).

### Independent ui-ux review

[Report](../ui-review/ryt-063/review.md). Round 1 CHANGES_REQUIRED (room keys under centre notes,
focus lost when "Anterior" disabled itself, the emptied seed field typed a trailing 0); round 2
CHANGES_REQUIRED (corner keys under the ossuary, clearing and trap notes); round 3 **PASS** for
fingerprint `2cdf9f3c86d28068e27554515a913c2885fdd2a9591a6dd1ab17c4c8adc6715b`. Fixes between rounds:
keys search for a corner free of notes, events and tokens; "Anterior" stays focusable with
`aria-disabled`; the seed field keeps an empty state; the sticky preview follows the measured
dialog header; the reroll keys drop their glyphs under 30em; caption sentences name doors and drop
the door count when there are none; the door inspector agrees in number; reveal options are 44 px.
New e2e: previous seed, focus on the exhausted key, typed seed, no room key over a note pin.

Open P3s (not blocking): a passage key moved to a passage end can cover the next door while Fog or a
door is in use; a trap note can half cover a passage key; a key may hop corners while a token is
dragged; plus the Impeccable P3s above. Untested: real TV, iOS Safari, screen readers, 200% text,
non-default class themes, hosted Supabase.
