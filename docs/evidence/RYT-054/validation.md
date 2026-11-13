# RYT-054 verification: encounter builder

Date: 2026-11-05. Decision: [ADR 031](../../decisions/031-encounter-builder.md). Design flow:
the review report. Sources: D&D Sync reviewed in the browser with the user's account
(see [research](../../research.md)); SRD 5.2.1 "Combat Encounters", pages 201–202 (CC-BY-4.0),
read from the official PDF.

## Scope delivered

- `src/features/combat/domain/difficulty.ts`: SRD 5.2.1 XP Budget per Character (levels 1–20),
  party budget, bands, room, troubleshooting notes, most common enemy type, suggestion candidates
  and picks (deterministic with a seeded generator).
- `src/features/combat/ui/encounter-balance.tsx`, `encounter-suggest.tsx`, `builder-parts.ts`,
  `builder.css`: the difficulty card in the DM console of draft and initiative encounters and the
  suggestion dialog. Catalogs `src/shared/i18n/builder-{en,es}.ts`.
- No migration, RPC or policy. Reads `get_combat_state` (DM projection), `get_party_overview` and
  the bundled bestiary; writes only through the existing `add_combatants`.

## Acceptance

| Criterion | Evidence |
| --- | --- |
| Party budget as the sum of each character's SRD row; party from the draft, else everyone in play; no sheet counts as level 1 and is named | `difficulty.test.ts` (SRD examples 1–3, mixed levels, no sheet); e2e "measures a prepared fight" (2 × level 5: 1000/1500/2200, "Cuentan todos los personajes en juego" until the party joins) |
| Enemies spend XP (lair XP with a lair); allies and unrated creatures not counted | `difficulty.test.ts` (groups, allies, unrated, hidden); e2e: 8 typed bandits listed as "Sin valor de desafío: sus PX no cuentan" |
| Band in words with a glyph, spent XP against thresholds, what is left, polite announcement | e2e ES and EN light ("450 of 1,000 XP; 550 left."), over-High case (pointer pinned, notches keep the scale); one persistent live region |
| SRD notes | `difficulty.test.ts` (many, stat blocks, powerful, CR 0, swarm exception); e2e note "Más de dos criaturas por personaje" |
| Suggestions: within budget, one kind or one leader and two or more of its type, two per character, type, one tap, another set | `difficulty.test.ts` (limits, SRD example builds, leader rule, crowded draft, new ideas first); e2e: leader titles `1 × … y N × …`, "Otras ideas" announced, add by name, dialog keeps the kind, crowded message |
| 390px and tablet, keyboard, Escape and focus return, both themes and languages, axe, 44px | e2e on identity-mobile, -tablet and -desktop: axe on card and dialog, touch targets, Escape returns focus, add returns focus, 150% text without clipped tiles or ideas, EN light |

## Checks

- `npm run check`: typecheck, lint, architecture, docs (55 tickets), 269 unit tests in
  37 files, build — passed.
- `npm run test:e2e` (full suite): first run 471 passed, 56 skipped by design, 1 failed (focus return
  after an add on desktop while the save was still pending; fixed with an `aria-disabled` opener).
  After the UI review round 1 fixes: 482 passed, 55 skipped, 0 failed.
- `tests/e2e/encounter-builder.spec.ts` at 390, 820 and 1440px: 120/120 with `--repeat-each=6`
  under parallel load. It covers the flow above, EN light, a fight over the High budget, an add that
  spends High exactly (focus stays on the reading), unrated enemies, and bounding-box overlap checks
  at 100% and 150% text (gauge words and pointer, difficulty rows, party budget). The overlap check
  was shown to fail on the earlier gauge padding ("bld-pointer × Moderada").
- design review detector: clean on the builder components and stylesheet after the margin-note fix.

## Not covered

- Hosted Supabase and PRE: no schema change; the SDK contract fixture stands in for the RPCs.
- Real screen readers, WebKit/iOS Safari, Firefox and physical touch devices.
- The 13 class themes were checked by token contrast, not rendered one by one.
- Party members without a sheet end to end (the fixture has none); covered by unit tests.

## Independent review

UI review, applied by an independent reviewer:

- Round 1: CHANGES_REQUIRED (fingerprint `95a44a56…`): focus lost after an add that spends High
  exactly, overlaps at 150% text, the pointer over "Moderada", "no enemies" with unrated enemies, the
  add notice not announced, and copy. All fixed, with new e2e cases (see Checks).
- Round 2: **PASS** for fingerprint
  `7776f1f397100baa62121ff741813b087c4ecd1d575aab24933691520676437a`, recorded in
  `docs/evidence/ui-review-current.json`; the UI review check passes.
- Non-blocking follow-ups from round 2: the live region can be written twice on an add (band, then
  notice plus band); the English "none" copy should quote "All the same"; at 100% text on phones the
  party budget wraps "High" to a second row.

## Captures

Phone (390px) and tablet (820px), written by the spec with `RYT_EVIDENCE=1`: `gauge-*.png` (ES dark,
card expanded with the party and unrated bandits), `suggest-*.png` (dialog, leader and band),
`gauge-en-light-*.png`, `over-high-*.png` and `suggest-150-*.png` (150% text).
