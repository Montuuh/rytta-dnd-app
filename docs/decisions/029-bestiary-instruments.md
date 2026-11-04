# ADR 029: Bestiary instruments instead of generic pills and selects

Status: accepted (RYT-051, 2026-11-04)

## Context

After RYT-050 the bestiary list read well, but every other surface still used the generic kit:
14 type pills and 6 size pills in Filters, segmented controls for hit points, side and sort, selects
for size, type, CR and hit die, plain number fields and checkboxes for abilities. The DM had to read
words where the table already has shapes: miniature bases, token shapes, dice and the CR ladder.

## Decision

One small set of bestiary instruments (`src/features/combat/ui/bestiary-widgets.tsx`), reused by
Filters, the quick creature, Add to an encounter, the archetype start and the full editor:

- **Tile groups**: native radios or checkboxes inside painted labels (keyboard, forms and screen
  readers behave as usual). A checked tile has an accent border, an inset ring and a check seal,
  never colour alone.
- **Type tiles**: each creature type carries a Lucide glyph (eye, paw, sun, cog, egg, tornado,
  sparkles, flame, mountain, user, bug, droplets, sprout, ghost). Skull stays reserved for defeat.
- **Size scale**: miniature bases drawn to scale on one baseline (11px per 5-foot square).
- **Side toggle**: the creature's own monogram in the token shape it takes at the table (hexagon
  for enemies, rounded square for allies).
- **Number dials**: the typed value in the stat block's serif face between 44px steppers; a short
  press steps one, holding steps five (`useLongPress`).
- **CR dial**: a spin button over the 34 official ratings (arrows, Page Up/Down by four, Home/End)
  with a ladder showing where the creature sits, and XP and PB below.
- **Choice cards** for hit points (average with Σ, roll with dice and its min–max range) and sort.
- **CR bands** under the Filters slider (minions, low, mid, high, epic): one tap sets a range, a
  second clears it; `aria-pressed` carries the state.
- **Count preview**: a stack of the creature's tokens for the number being added.
- **Saving throw seal**: a checkbox painted as a seal, its accessible name naming the ability.
- Favourites use a bookmark ribbon (marking a page in the field journal) instead of a star.
- The stat block's core numbers carry the same glyphs (shield, heart, spark, footprints).

## Consequences

- One visual vocabulary across the bestiary, tied to tabletop objects; fewer words to read.
- All widgets are native inputs or ARIA spin buttons: no new keyboard model to learn.
- Selects remain only where the list is long and textual (SRD creature, trait library, entry usage).
- The stepper names repeat the field label ("Increase Count"), so tests address the field by role.
