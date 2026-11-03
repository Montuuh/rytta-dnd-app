# RYT-008 verification: SRD glossary, term references and homebrew

Date: 2026-11-03. Branch `cl/gifted-bohr-6l74mn` on base `cdc7646`. Decision record:
[ADR 023](../../decisions/023-glossary.md).

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

Pending the independent `ui-ux` verdict; recorded below when available.
