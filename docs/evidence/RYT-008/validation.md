# RYT-008 verification: SRD glossary, term references and homebrew

Date: 2026-11-03. Branch `cl/gifted-bohr-6l74mn` on base `cdc7646`. Decision record:
[ADR 025](../../decisions/025-glossary.md).

## Scope delivered

- 550 bundled entries per language (English and official Spanish SRD 5.2.1): 115 rules,
  15 conditions, 12 actions, 6 areas of effect, 3 attitudes, 5 hazards, 6 abilities, 18 skills,
  13 damage types, 10 weapon properties, 8 masteries and 339 spells; SRD 5.1 blocks for the
  conditions and combat actions plus Two-Weapon Fighting (2014-only).
- Glossary page (`#/campaign/:id/glossary`, `#/glossary`), deep links per entry, search in both
  languages with aliases, category tabs, spell filters, quick facts, 2014 rules, house rules.
- Reference sheet for inline terms on the character sheet (abilities, skills, conditions, AC,
  initiative, speed, proficiency, passive Perception, HP, hit point dice, death saves, spell DC
  and attack, feature/spell/notes text), party conditions, item card (damage types, weapon
  properties, description), attack lines and shop descriptions.
- Campaign homebrew in `glossary_entries` with revision-checked RPCs; DM and Players share
  permissions, Players within the DM module switch.

## Content provenance

- Sources: `SRD_CC_v5.2.1.pdf`, `SP_SRD_CC_v5.2.1.pdf`, `SRD_CC_v5.1.pdf`,
  `SRD_CC_v5.1_ES.pdf` from https://www.dndbeyond.com/srd (downloaded 2026-11-03; not committed).
- Pipeline: `scripts/glossary/` (see its README). EN↔ES pairing: reviewed heading table for the
  155 rules entries; spells by stat signature with 19 reviewed overrides; build fails on any
  unpaired or doubly paired spell.
- Manual review: spot checks of conditions, actions, rest rules, Grappling, Unarmed Strike,
  Fireball, Confusion, Teleport, Control Weather, Scrying, Divine Word, Chill Touch; ten
  multi-column tables replaced by reviewed overrides; paragraph breaks at column/page edges
  merged automatically. Known residue: a few kerning splits inside Spanish words (for example
  "r ecuerdos") remain in the official text extraction.
- Attribution: official 5.2.1 statement (EN/ES) and a 5.1 statement on the glossary page; page
  numbers on every entry; quick facts and condition summaries are labelled as Rytta adaptations.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, architecture, docs, AI contracts, unit + SQL tests, build) | see final run below |
| `vitest` glossary domain (`content.test.ts`, `glossary.test.ts`) | 21 passed |
| `vitest tests/database` (includes `glossary.test.ts`, 6 tests) | 82 passed |
| `playwright test` full suite, all 6 projects | 325 passed, 0 failed (18.7 min) |
| `playwright test glossary` (demo + identity, desktop/tablet/mobile) | 18 passed |

Playwright ran with the container's preinstalled Chromium through a local, uncommitted config
override (`launchOptions.executablePath`), because the pinned Playwright browsers are not
installed here. The repository configuration is unchanged except for the new spec in the
identity project globs.

Existing 44px audits now skip `.glossary-term` inline buttons; the glossary spec instead asserts
that every visible inline term has a hit area of at least 44px (element plus its `::after`).

## SQL authorization (PGlite, `tests/database/glossary.test.ts`)

- DM and an enabled Player create, edit and delete any entry; aliases are trimmed and
  de-duplicated; updated_by follows the editor.
- Retried create with the same id/payload replays; different payload, stale revision, stale
  delete and duplicate (case-insensitive) names are rejected; a repeated delete succeeds.
- Server validation of name, category, summary, body, aliases, facts and `srd_ref`.
- anon (table and RPC: permission denied), outsider, inactive member and a cross-campaign DM
  (Forbidden, nothing readable, cannot move or delete through another campaign), no direct
  table writes for members.
- Player with the module off: no rows, Forbidden; enabling the module grants access.
- PRE copied before the migration receives the table, policy and 5 functions with no
  `public.`/`private.` references; PRE helpers authorize only against PRE membership.
- `tests/database/pre.test.ts` table count updated from 23 to 24.

## Hosted Supabase (project `ekscdsmniukuxqjixapu`)

1. Migration history matched the repository (18 migrations); no glossary objects existed.
2. Dry run of the full migration in a transaction aborted on purpose: public and PRE tables,
   1 policy each, 5 remapped PRE functions, 0 schema leaks; verified rolled back.
3. Applied `glossary_homebrew` (non-destructive: new table, functions, policies).
4. Probes in an aborted transaction, for `public` and `pre`, with the real campaign members:
   anon select/save denied; outsider save Forbidden; Player save Forbidden and 0 rows with the
   module off; DM create (revision 1) and read; direct insert denied; Player reads, edits
   (revision 2) and deletes with the module on; stale revision rejected; a PRE row is not
   visible in `public`. Afterwards: 0 rows in both schemas and unchanged `player_modules`.
5. Security advisors: only the expected `authenticated` SECURITY DEFINER notices for
   `save_glossary_entry` and `delete_glossary_entry`, like every existing RPC; no RLS finding
   for `glossary_entries`; anon cannot execute any glossary function.

Not tested on hosted: a cross-campaign DM (the project has one campaign) and a two-account
browser session against the real Auth/PostgREST; both are covered by PGlite and the e2e
fixture only.

## Screenshots

Captured with `RYT_EVIDENCE=1` from `tests/e2e/glossary.spec.ts` at 390px and 820px:
see the PNG files in this folder.

## UI/UX review

Round 1 (`b1c3af5`): independent `ui-ux` verdict **CHANGES_REQUIRED**, report
[ui-review.md](ui-review.md). Fixes in the follow-up commit:

- F1 (blocker) search dropped keystrokes: the field owns its value and mirrors it to the URL
  after 300 ms; e2e now types with `pressSequentially` (40 ms per key) on the All tab.
- F2 (major) phone sheet pinned to the top: back to the standard Mantine Drawer (the compound
  API lost the bottom alignment wrapper); the sheet hugs its content up to 86dvh, with the
  headword as the dialog title and a CSS handle cue.
- F3 (major) focus lost when going back: every move through the sheet history focuses the
  headword (asserted in e2e).
- F4 back to the index on phones uses history and focuses the row it came from (asserted).
- F5 thumb index is one Tab stop with arrow keys (roving tabindex); ArrowDown/ArrowUp move
  through rows, ArrowUp from the first row or Escape returns to search (asserted).
- F6 Enter and saving focus the opened headword after the layout's route focus; the editor
  drawer does not return focus after a save (asserted).
- F8 slider thumbs 28 px with a 44 px hit area and distinct names ("mínimo"/"máximo").
- F9 duplicate help text removed under Save; a missing name has its own message and focuses
  the field; a failed delete says so and the error clears when the dialog closes.
- F10 tab counts follow the current search.
- F7 (not changed): inline terms keep a 44 px hit area; in dense text neighbouring areas can
  overlap, and the later element wins a tap between lines. This is the WCAG 2.5.8 inline
  exception traded for the 44 px rule; a smaller area would fail the repository rule.
- The checked condition chip contrast flagged by axe on the sheet predates RYT-008.

Round 2 (`0897a57`): **CHANGES_REQUIRED**; F1–F10 and the checked chip contrast confirmed
fixed. Follow-up fixes:

- R2-1 (major) Escape closed both the definition and the drawer it was opened from: the
  glossary layer registers the first window capture listener (a layout effect, before any
  Mantine drawer) and, while a definition is open, stops Escape after closing only the
  definition. e2e: first Escape keeps the item card open with focus on the term.
- R2-2 a `?q=` change the page did not write (nav item, link) resets the field; the URL
  mirror skips writing when a navigation is still rendering. e2e covers the nav reset.
- R2-3 the sheet headword has no focus ring as a programmatic focus target, like page
  headwords.
- Checked condition chips (outside RYT-008, fixed on request): on-accent text; e2e runs axe
  in dark/default, light/default, dark/warlock and light/druid; it failed before the fix.

Round 3 (`8b78b6f`): **PASS**. R2-1 fixed for the item card and the shop listing drawer
(including a direct load), R2-2 and R2-3 confirmed.

Round 4 (`c474ae8`, after merging `origin/main` with RYT-035): **PASS** on fingerprint
`ac6407a5…`. The glossary adopts RYT-035's `PageHead`, the single module catalogue
(`module-catalog.ts`, glossary `implemented: true`) and `usePhone`/`useWide`; the reviewer
compared the page head with Grupo and Tiendas, checked navigation and the module switch for
DM and Players, and sampled overlay first paint frame by frame. The ADR was renumbered to 024, and to 025 after merging RYT-007 (combat took 024).

Accepted minor items: F7 (overlapping 44 px inline hit areas in dense prose), F8 (slider
thumb hit area at 20 px off centre; taps on the track still move the nearest thumb), and a
Spanish quote that can wrap before "Romper objetos" in "Puntos de golpe".

Round 5 (`b236f37`): **PASS** on fingerprint `38782adf…`. CI on `b40ff92` showed the delayed
`?q=` write dropping `?cat=` while a tab change was still rendering (React Router's functional
`setSearchParams` updater uses the params of its own render). Both URL writers now start from
the live address bar; the reviewer re-tested quick tab switches at normal speed and 6× CPU
throttling, Escape, deep links, history, the nav reset and Enter, and re-ran the round 4 smoke.

Round 6 (`5fd1964`, after merging `origin/main` with RYT-007 combat): **PASS** on fingerprint
`a1b57e8c…`. Combat routes now render inside the campaign glossary layer; the reviewer checked
navigation and module switches for DM and Players at 390px and 820px, the combat list,
encounter and table pages (axe, overflow, route focus, Escape in combat drawers and dialogs),
copy key collisions across catalogues, and re-ran the glossary smoke. Not tested: real devices
and screen readers. Follow-up idea (not a finding): link combat condition chips to the glossary.
After the merge `npm run check` passed (204 tests; one earlier run hit a flaky leak regex in
`party-sharing.test.ts`, fixed in `5fd1964`) and `playwright test glossary combat
character-sheet` passed 60/60.

Manifest: `docs/evidence/ui-review-current.json` records the round 6 PASS.
