# RYT-045 independent UI/UX review

- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`), independent of the implementer.
- Date: 2026-11-04.
- Source snapshot: worktree `agent-ae5927fd60f8c7f7a`, commit `d7f98ba` (based on `main` `f6e5ea0`).
- Fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `691dfd94aab3988d41715b52410f038a21102762814e8d3462edb8c9feb5ec24`
- Applied: AGENTS.md, src/AGENTS.md, docs/ui-review.md, docs/design-system.md, docs/combat-design.md,
  ADR 024, ticket RYT-045, the implementer report `docs/evidence/RYT-045/validation.md`, and the
  user's design bar: no filler text, no default-looking buttons, no pill overuse, real craft, and
  legibility at table distance. I paid particular attention to accidental taps, to how clearly
  the controlling mark reads, and to whether each helper line is needed.

## Verdict: CHANGES_REQUIRED

The direction is strong.

- The hand-off works as a designed key, not a default button. It shows the next combatant's
  token, sinks when pressed and has a real disabled state when the data is stale.
- The death save tracks read like the boxes on a paper sheet. The control mark (solid ring with
  "+") is clearly different from the empty marks (dashed). The d20 at the end of each track is a
  contextual way to record the naturals.
- After a roll, focus moves to the hand-off.
- Outcomes are announced on every screen.
- Stable and Revived are an icon plus a word, not new pills.
- The DM console is unchanged apart from the shared death line in the rows.
- Axe is clean in every state I tested: 34 checks, WCAG 2.0/2.1/2.2 A and AA tags.

One Major issue remains, and it is exactly the accidental-tap risk this ticket had to manage. On
tablets and laptops, the one-tap "Terminar mi turno" key outranks the death save the Player has
not rolled yet. One Medium issue also remains: in the rows, successes and failures differ only by
colour.

## Findings

### F1 — Major — at 0 HP the end-turn key outranks the death save the Player has not rolled

- Where:
  - `src/features/combat/ui/combat.css:1658-1678`: the grid puts the hand-off in the `handoff`
    area beside the actor, above the `saves` row, from 46em of container width.
  - `src/features/combat/ui/table-display.tsx:152-174`: the hand-off always renders as the filled
    accent key, whether or not this round's roll has been made.
- Viewports and themes: tablet 820 and desktop 1440, every theme and both languages. Phone 390 and
  150% text order the elements correctly, but see the spacing note below.
- Steps:
  1. Seed Arin at 0 HP on his own turn (my script reused the `seedTurns` fixture; screenshots
     `tablet-ds-initial.png` and `desktop-ds-initial.png`).
  2. The filled amber "Terminar mi turno · Pasa a Bea" tile is the first and heaviest thing in the
     banner. The death save tracks sit below it in a lighter row.
  3. One tap on the tile ends the turn without confirmation.
  4. The roll for that round is then gone for the Player: the server refuses it with `Not your turn`.
     Only the DM can record it from the console.
- Keyboard: on tablet and desktop, Tab goes success mark → d20 20 → failure mark → d20 1 → hand-off.
  The hand-off is visually above the marks, so focus jumps back up the screen. This is the right
  logical order but it does not match the visual order.
- Phone spacing: the hand-off sits 22px below the failure mark and the "1" die, in both
  `phone-ds-initial.png` and the 150% capture. That meets the minimum target spacing, but it is
  tight next to a one-tap action with no confirmation.
- Impact:
  - At a real table the dying Player is anxious and often rushed by the group. The screen
    currently makes "pass the turn" the obvious next step, even though rolling is mandatory and is
    the only thing their turn is for.
  - The design system rule "prioritize the next useful action" is inverted until the roll is made.
  - Skipping the roll by accident cannot be undone by the Player and needs the DM to step in.
- Expected:
  - While a dying Player has not rolled this round (`canRollDeathSave && !rolled`), the death save
    is the primary element and the hand-off is secondary. For example, show the hand-off in its
    quiet outline treatment, the same palette as the existing `[aria-disabled]` style, but still
    enabled. Then promote it to the filled key once the roll is recorded. Focus already moves to it
    at that moment, so the hierarchy would follow the flow.
  - On tablets, either place the hand-off after the saves row while a roll is pending, or keep the
    side column but give it this secondary treatment so the reading order and the emphasis agree.
  - Optionally, add a little more space above the hand-off on phones while the tracker is live.
  - Do not add a confirmation dialog. The contextual hierarchy is the better fix.

### F2 — Medium — the row notches tell successes from failures by colour alone

- Where:
  - `src/features/combat/ui/parts.tsx:291-308` (`DeathLine`).
  - `src/features/combat/ui/combat.css:2008-2022`.
- Viewports: all. Themes: all.
- Steps: put a character at 0 HP with some successes and failures. Look at the row in any table
  view: Arin's own, Bea's teammate view, or the DM's table and console.
- What you see: two groups of three 12px circles, green and red, with no glyph, no label and no
  difference in shape. The accessible name covers screen readers. Sighted Players with
  red–green colour blindness can only infer the meaning from left/right position.
- Impact:
  - This breaks the design-system rule "never convey roles/status by color alone".
  - The banner tracker itself is fine: filled marks carry a check or an X.
- Expected: give the row notches a non-colour cue. Options:
  - a check or X glyph inside the filled notches (they are 12px, so make them slightly larger, or
    use a tiny "✓ ✓ ○ / ✕ ○ ○" in the meta font);
  - a short visible prefix;
  - a shape difference (for example square failure notches).

### F3 — Minor — the "stamp" animation replays on every mount

- Where: `src/features/combat/ui/combat.css:1960-1963`
  (`.combat-saves .combat-mark.is-filled { animation: combat-stamp … }`).
- Steps: with reduced motion off, record a success, then reload the page. The tracker also
  remounts on each later own turn. The check I ran reported `animationName: combat-stamp` both
  right after the roll and after the reload.
- Impact: every filled mark stamps again each time the tracker appears, as if it had just been
  recorded. This weakens the feedback for the mark that really is new. Reduced motion is respected
  (no animation with `reduce`), so this is cosmetic.
- Expected: animate only the mark added in this session. For example, set a class only when the
  count increases while the component is mounted.

### F4 — Minor — one helper line does not earn its place

- Where: `src/shared/i18n/combat-es.ts:327` and the English equivalent `combat.death.prompt`, shown
  every round in `death-saves.tsx:147`.
- "Tira un d20 y marca el resultado." repeats what the tracks already say: "Éxitos 10–19",
  "Fallos 2–9", the "+" mark and the d20 faces. Under the user's no-filler bar, I recommend
  dropping it, or showing it only on the first roll of the fight.
- The other lines are justified:
  - "Éxito marcado. El DM puede deshacer un error." confirms the roll and gives the recovery path
    for an action with no confirmation.
  - "Ya no tiras salvaciones de muerte." explains why the controls are gone.
  - "20 natural: vuelves con 1 punto de golpe." explains the change in hit points.

## Observations (no change required)

- Barbarian theme (dark): the accent is coral-red, so the filled "End my turn" key is close in
  colour to the failure track (`tablet-var-dark-en-barbarian.png`). This comes from the theme, not
  this delivery. Fixing F1 (a secondary hand-off while a roll is pending) also reduces it.
- A dead character's own turn still reads "¡Te toca!" with the hand-off, because the Player passes
  the turn they died on. This follows the documented behaviour; the skull and "Muerto" make the
  state clear.
- DM log text "Arin: salvación de muerte, Éxito" capitalises the outcome mid-sentence ("1 natural"
  does not). This predates this delivery (`eventText`).

## Tested scenarios

Browser-tested by me with throwaway Playwright scripts outside the repo. They used the repo's
`tests/e2e/fixtures/combat.ts` and `identity.ts` against my own supabase-mode build served on
`127.0.0.1:4270`. Chromium, with reduced motion unless stated.

| Scenario | 390 phone (touch) | 820 tablet (touch) | 1440 desktop |
| --- | --- | --- | --- |
| Own turn (not dying): hand-off "Terminar mi turno · Pasa a Bea" with token; layout, Tab order, axe | ✓ | ✓ | ✓ |
| Not own turn (Bea): no control, "Después" plus countdown | ✓ | ✓ | ✓ |
| Offline/stale: hand-off `aria-disabled`, outline style, a tap does nothing (0 turn events); re-enables when back online | ✓ | ✓ | ✓ |
| Double tap on the hand-off: exactly 1 turn event; focus on the "Orden de iniciativa" h2 | ✓ | ✓ | ✓ |
| Death saves at 0 HP: tracks, controls, axe, Tab order | ✓ | ✓ | ✓ |
| Success by tap or click: stamped, round locked, "Éxito marcado…", focus on the hand-off (polled; it settles within 150 ms), announcement on Arin's and Bea's screens | ✓ | ✓ | ✓ |
| Natural 1 → 2 failures, "1 natural marcado…" | ✓ | ✓ | ✓ |
| Natural 20 → gold "Reanimado" card, 1/24 PG; "Reanimado" in Cato's rows (not sharing) and in the DM's table rows | ✓ | ✓ | ✓ |
| DM console: undo "Arin: salvación de muerte, 20 natural" → Arin can roll again; third failure → "Muerto", "Arin ha muerto." announced | ✓ | ✓ | ✓ |
| Three successes by the Player (Cato preset to 2) → "Estable · Ya no tiras…", no control; Arin sees "Estable" without counts; "Cato está estable." announced | ✓ | ✓ | ✓ |
| Light ES (Hearth), dark EN Barbarian, light EN Druid, dark ES Rogue: dying own turn, axe | ✓ | ✓ | — |
| 150% root text: stacked banner, no horizontal scroll, axe | ✓ | ✓ | — |
| Keyboard: Space on the failure mark → recorded, focus on the hand-off (visible ring); Escape does nothing harmful | — | ✓ | — |
| Double activation of a mark within one frame: 1 death save event | ✓ | — | — |
| Reduced motion off: stamp animation present (see F3) | ✓ | — | — |

Results:

- Axe: 0 violations in all 34 runs.
- No horizontal scroll anywhere.
- No page or console errors.
- The touch targets I measured: marks 44×44, dice 56×56, hand-off ≥ 297×109.

Screenshots I inspected (scratchpad, not committed):
`C:\Users\dmont\AppData\Local\Temp\claude\C--Users-dmont--claude-spares-spare-4QdntX\77848685-adcc-4fea-bde2-0c6bcfb5bc65\scratchpad\ryt045-ui\shots\`.
They include `{phone,tablet,desktop}-endturn-own|other|stale|after`,
`*-ds-initial|marked|nat1|revived|after-undo|dead|cato-two|cato-stable`, `*-ds-bea-view`,
`*-ds-cato-revived`, `*-ds-dm-table`, `*-ds-dm-console`, `*-var-*`, `*-150-ds`,
`tablet-kbd-focus-*`. I also inspected the implementer's committed captures in this folder.

## Limitations

- Fixture-backed: the SDK fixture mirrors the RPCs. I did not test real Supabase Auth, PostgREST
  or Realtime, and I did not review the SQL authorization itself (the implementer's PGlite and PRE
  evidence covers it).
- Chromium emulation only: no iOS Safari or Android hardware, and no real screen reader. I checked
  live-region text and accessible names in the DOM only.
- 150% text was simulated with the root font size, not the OS or browser zoom setting.
- I checked class themes on 4 of 13. Desktop 1440 ran in the default theme only.
- I did not reach the in-flight (pending) state of the hand-off and marks with a slowed network.
  I verified the double-activation guard by event count instead.
