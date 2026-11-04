# RYT-046–049 verification: SRD bestiary, homebrew stat blocks, combat integration and templates

Date: 2026-11-04. Decision: [ADR 028](../../decisions/028-bestiary.md).

## Content (RYT-046)

- `scripts/bestiary/build_bestiary.py` on the official SRD 5.2.1 PDFs (EN 6.0 MB, ES 9.2 MB,
  downloaded outside the repo with the user's approval): 330 stat blocks per language, 48 library
  traits, 28 CR median rows. English and Spanish blocks pair one to one by numbers; entry keys,
  usages and per-day spell lists (glossary ids) agree in both languages.
- Bundle: `index` ≈68 kB (≈12 kB gzip); stat blocks EN ≈530 kB (≈83 kB gzip), ES ≈581 kB
  (≈90 kB gzip), lazy chunks loaded only on DM bestiary and combat screens.
- `src/features/bestiary/domain/content.test.ts`: schema of every block, paired keys/usages/abilities,
  index numbers (HP, AC, XP from the CR table), tracker keys equal in both languages, spell ids exist
  in the glossary, no PDF artefacts or unbalanced markup, CR medians and trait library.
- Errata handled and documented: Archmage printed XP 8,000 (index uses the CR table); Young White
  Dragon's Intelligence save lost its minus sign.

## Domain (RYT-047, RYT-049)

`src/features/bestiary/domain/bestiary.test.ts`: SRD tables (modifiers, PB, XP), dice parsing and
averages, CR estimate from medians, bilingual accent-insensitive search, filters and sorting,
favourites, trackers (recharge, daily uses, per-day spells), archetype drafts for every archetype at
CR 1/4, 3 and 10 (valid stat blocks), and the paste parser: every SRD stat block printed as text in
both languages (660 blocks) reads back with the same AC, HP, CR, type, six abilities, sections and
entry counts; a 2014-style book block reads correctly.

## Database (RYT-047, RYT-048)

`tests/database/bestiary.test.ts` (PGlite, full migration chain, PRE copied by ETL before the
migration):

- Templates store a validated stat block, SRD origin, dice, CR and type; quick edits keep them;
  explicit nulls clear them; invalid shapes, dice, CR, type and SRD ids are refused.
- `add_combatants`: server-rolled hit points within the dice range, aliases numbered like names and
  continued across adds, trackers created fresh; invalid modes, dice, ids and trackers refused.
- Players and the table see aliases in rows, log and summary, no DM fields (`public_name`, `srd_id`,
  `template_id`, `trackers`) and no rolled dice; revealing an alias logs a visible `reveal` with it.
- `set_combatant_tracker`: replay, bounds, unknown keys; recharges roll at the creature's turn start
  until they come back (DM-only `recharge` events, never in Player views).
- Denials: anon (permission denied on RPCs and direct updates), outsider, Player and cross-campaign
  DM (Forbidden / Combatant unavailable); the PRE mirror creates the same functions without
  `public.`/`private.` references.
- Combat suites `combat.test.ts` and `combat-media.test.ts` still pass (19 tests).

## Browser (all tickets)

`tests/e2e/bestiary.spec.ts` on 390px, 820px and 1440px (identity projects, in-memory Supabase
fixture): search in both languages, Enter to open, stat block with glossary links and SRD page, the
phone/tablet sheet with Escape, filters with live count, favourites; add two young red dragons with
an alias and rolled dice, tracker summary, the console alias, recharge toggle, collapsible stat block
and reveal; customise the SRD wolf (origin kept), an archetype leader and a pasted 2014 block; Players
never reach the tab or its query. axe (WCAG 2.1 AA) on the panel and every dialog; 44px targets in the
add dialog and list. Old `combat?tab=bestiary` links redirect (`combat.spec.ts`, RYT-043 image test).
Screenshots: `docs/evidence/RYT-046..049/*-{mobile,tablet}.png`.

`npm run check`: typecheck, lint, architecture, docs, AI checks, 35 unit/SQL files (252 tests), build.
`npm run test:e2e` (full suite, 489 tests): 439 passed, 49 skipped by project, 1 failed: `roster.spec.ts`
"the DM archives an unassigned character…" on the tablet project, a focus timing check outside the
bestiary that failed under full-suite load and passed 8/8 when repeated alone (desktop and tablet).
The bestiary and combat specs pass 80/80 on the three identity projects after the review fixes.

## UI/UX review

Independent `ui-ux` review in [ui-review.md](ui-review.md): first pass CHANGES_REQUIRED (F1–F14, six
major), re-review 1 CHANGES_REQUIRED (two regressions R1–R2 introduced by the fixes), re-review 2
**PASS** on digest `0eb562ba…cdf674` (recorded in `docs/evidence/ui-review-current.json`).
Deferred non-blocking items, accepted explicitly: R4 (CR slider thumbs have a ~36px invisible hit
area instead of 44px; `inset: -12px` would fix it), the "Desde el SRD" picker ranking nit, the axe
`aria-required-children` nit on an empty open Mantine listbox, and the phone sheet's ⋯ button sitting
in the bar's side padding at 150% text. Regression e2e checks were added for F1 (Escape keeps the
sheet), F3 (discard question) and R2 (tags and alignment from the type line).

## Supabase

- Hosted history before the change ended at `combat_player_death_saves`; no merged work overlapped.
- PRE first: the remapped DDL was applied to `pre`/`pre_private` alone and smoke-tested as a real PRE
  DM inside a rolled-back transaction (template with stat block, two rolled aliased creatures 26 and
  23 HP from 5d8+5, an SRD dragon with a recharge tracker spent; the table projection showed only
  aliases and no DM fields).
- Production: migration `bestiary` applied (hosted version 20261104020328, repository file
  `20261109120000_bestiary.sql`); columns and functions present, `anon` cannot execute the new RPC,
  existing rows unchanged (1 template, 3 combatants). Security advisors list no new category.

## Not covered

Hosted Supabase Auth/PostgREST with two real accounts, real iOS Safari/Android devices, and screen
readers other than the axe/role checks. The paste parser is best effort for third-party layouts.
