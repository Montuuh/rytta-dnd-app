# RYT-042 independent UI/UX review

- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`), independent of the implementer.
- Date: 2026-11-03.
- Source snapshot: branch `worktree-agent-ab70fd5aa90f9a870`, head `bda9674` (includes `main` at
  `75652dc`), clean tracked tree.
- Fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `8cc88fedc167aa7dfa8f1df546eb0a35b696cfe3502a606371c19e4247743f86`

## Verdict: CHANGES_REQUIRED

Most of the delivery holds up in the browser:

- The Player really has one screen. No console, no turn, HP or undo controls, and other rows have
  no controls at all.
- The d20 entry is well crafted. The keypad, typing, Enter, Escape-clears and Escape-cancels all
  work. Focus lands on the 44px pencil after a save and returns to it after a cancel.
- The DM switch is a proper radio group: 44px segments, arrow keys, a visible 3px ring, and
  `?view=` persists the choice. A draft opens the console even with `?view=table`. Console targets
  survive a round trip through the table view.
- Reduced motion removes the pulse.
- There is no horizontal scroll at 150% text on any viewport.
- No DM-private data reached the Player DOM or the Player `get_combat_state` responses.

Three findings block approval. One is functional (F1). One is a WCAG AA failure on the Player's
only combat screen (F2). One is the hierarchy of the core Player message (F3). F4 to F8 are polish
against the user's design bar and should land in the same pass.

## Findings

### F1 — Major (blocking): the DM console keeps a live target-selection bar after the fight ends

- Where: `src/features/combat/ui/dm-console.tsx:117-118` (`multi` / `multiMode` are never
  reset on status change), `:219` (the "Elegir objetivos / Dejar de elegir" toggle exists only
  in `active`/`initiative`), `:283-310` (the multi bar renders whenever `multi.size > 0`, whatever
  the status).
- Conditions: 390, 820 and 1440; ES; dark (not theme dependent).
- Reproduction: open an active encounter in the console (`?view=console`), tap "Elegir objetivos"
  and tick Goblin 2, then press "Terminar combate" and confirm. The new recap renders, and under it
  stays "1 objetivo elegido · Daño · Curar · Quitar selección", with checkboxes on every row.
  "Daño" opens the full damage dialog for an ended encounter, which the server will refuse
  (`Encounter closed`). "Quitar selección" empties the set, but the checkboxes stay. The toggle
  that leaves the mode is gone, so the DM cannot leave checkbox mode without leaving the page. The
  same thing happens when the fight ends while the console is hidden behind the table view, because
  RYT-042 keeps that state mounted. Screenshots of the 390 run: `after-end-console`,
  `after-end-damage`.
- Impact: the recap surface delivered here shows irrelevant, non-working actions. This is
  exactly the "no irrelevant actions" bar.
- Fix: clear `multi` and `multiMode` (and close any open amount dialog) when `status` leaves
  `active`/`initiative`, the same way the panel resets at `:125`. Add an e2e step: select targets,
  then end, then expect no checkbox and no `.combat-multi-bar`.

### F2 — Major (blocking, pre-existing component on the delivered screen): "Derrotado" badge fails contrast at 1.27:1

- Where: `src/features/combat/ui/parts.tsx:251-256` (`StateBadge`: `Badge color="gray"
  variant="filled"`) combined with `src/features/combat/ui/combat.css:181-183`
  (`.combat-row.is-defeated { opacity: 0.72 }`).
- Conditions: Player table view and DM table view/console at 390, 820 and 1440, in dark mode.
  Light mode was not measured with a defeated row.
- Reproduction: seed an active fight, deal 7 damage to Goblin 1, and open `/combat` as the Player.
  Axe (`wcag2aa`) reports `color-contrast` on `Derrotado`: foreground #bdbcbb on #a5a7a9, 1.27:1,
  12px text. The same violation appears in the DM console.
- Impact: this is now the Player's only combat screen and the shared table screen, and a defeated
  enemy is the most common mid-fight state. The pill is also redundant. The row already says
  "Caído", strikes the name through and greys the row, so it shows two status words in a
  low-contrast grey pill. The RYT-042 e2e audits never include a defeated combatant, which is why
  CI did not catch it.
- Fix: drop the pill on table rows and let the status word carry "Derrotado"/"Muerto" (icon + word,
  as the recap already does), or render it as text with the muted token outside the faded layer.
  Add a defeated combatant to an audited e2e step.

### F3 — Major (blocking, design): the Player's own-turn message is the smallest text in the banner

- Where: `src/features/combat/ui/table-display.tsx:353-368`; `combat.css:650-668`, `:897-906`.
- Conditions: every viewport, ES/EN, both themes.
- Reproduction (own turn): "¡Te toca!" / "Your turn!" is the 16px uppercase label, and the display
  line (36px at 390, 52px at 1440) repeats the Player's own name, "Arin". `.is-yours` also turns the
  "Después" label accent, so the two labels compete.
- Reproduction (waiting): "Te toca dentro de 3 turnos" is a 16px line under the right-hand
  "Después: Goblin 1" column. It reads as a property of Goblin 1, and at 1440 it sits about 850px
  from the left edge.
- Impact: "know it's my turn or that I'm up in N turns without asking" is the Player's main job on
  this screen (combat-design §2). The one message only this Player needs is the least prominent
  thing in the banner, and the most prominent is a name they already know. That fails the user's
  large-type legibility bar.
- Fix: on the own turn, make "¡Te toca!" the display line, with the name either dropped or demoted
  to a label. While waiting, give the countdown its own slot at heading size (for example a third
  cell, or a line under the "Ahora" name), not under "Después". Keep only the own-turn label in
  the accent colour.

### F4 — Minor: the total on the d20 crosses the face's edges

- Where: `combat.css:994-1013` (`.combat-d20-input input`: Georgia at 2.6rem).
- Conditions: 1440 and 390, both themes.
- Reproduction: enter 17. Georgia's old-style figures drop the "7" below the baseline, so it cuts
  through the triangle's bottom edge. A two-digit total also touches its sides (zoomed capture
  `zoom-d20-1440`). Typing "-12" or "150" overflows the face further.
- Impact: the one number the Player is confirming is drawn over a stroke.
- Fix: use lining figures (the body sans, or a font with `lnum`) for the total, enlarge the face or
  scale the type for 3 characters, and keep the number inside the triangle.

### F5 — Minor: typed out-of-range totals give no feedback

- Where: `src/features/combat/ui/initiative-entry.tsx:81-93`, `:109-117`.
- Reproduction: focus the die and type 150. The die shows "150" and Save is disabled with no
  reason. On blur the value silently becomes 99. The keypad caps at 99 itself.
- Fix: cap typing the way the keypad does, or show a short inline hint for −20 to 99.

### F6 — Minor: recap ledger repeats its column labels on every row; heavy and misaligned names

- Where: `src/features/combat/ui/combat-summary.tsx:216-240`; `combat.css:1120-1123`,
  `:1128-1135`, `:1143-1170`.
- Reproduction: four combatants print "Hecho / Recibido / Curado" four times. From 40em the
  rows are a ledger, so one header per side would do. Names use `font-weight: 800`, which renders
  as Segoe UI Black on Windows. That is heavier than every other name in the app (zoom
  `zoom-recap-names`), and the name sits a few pixels below the fate word's baseline. On
  wide screens the name and the stats are about 1000px apart with nothing between them.
- Impact: repeated labels are filler text, the user's first criterion, and the weight jump reads
  as unintentional.
- Fix: one aligned header per side from 40em (keep per-row labels on phones), weight 700, align
  the fate on the name's centre line, and cap the ledger width on wide screens.

### F7 — Minor: disabled "Save initiative" in the light theme is Mantine's default grey

- Where: `src/features/combat/ui/initiative-entry.tsx:109-117`.
- Reproduction: Player, EN, light, entry open with an empty die (`en-light-init`, 390). The
  disabled primary is a cool grey-blue fill that is off the parchment palette, so it reads as a
  default control.
- Fix: a tokenised disabled style (for example accent at low alpha with muted text), which the
  dark theme already approximates.

### F8 — Minor: the rolling banner wraps badly on phones

- Where: `table-display.tsx:338-351`; `combat.css:656-662`, `:881-896`.
- Reproduction: at 390 (dark, ES), "0 de 4 listos" at display size breaks into "0 de 4 /
  listos" beside the pips. At 150% the label "TIRAD / INICIATIVA" also wraps.
- Fix: below 40em, put the pips under the count or use the h1 size for the count.

### N1 — Note (test fidelity, not a product defect)

`tests/e2e/fixtures/combat.ts:224` returns `summary` unfiltered for the Player and table
projections. With a hidden combatant, the DM table-view recap in the fixture shows it ("Ogre
secreto"). Real SQL filters hidden rows out of the summary
(`supabase/migrations/20261104130000_combat_state_booleans.sql:40-44`, asserted in
`tests/database/combat.test.ts:333`). Mirror that filter in the fixture so the e2e suite can
catch a regression on the shared-screen recap.

## Observations (non-blocking, outside this delivery)

- At 390, opening the entry scrolls the page by 361px, so the title and the "Tirad iniciativa"
  banner start off screen. The entry's own heading keeps the context, so this is acceptable.
- Pre-existing chrome on the table view, which RYT-043 owns: "Se actualiza cada pocos segundos"
  next to the round, the 12px "Tú" pill, and 14px row meta text on a shared 1440 screen.
- The focus after saving reaches the pencil one or two frames later (it is briefly on `body`).
  This was verified over four saves per viewport and is acceptable.

## Tested scenarios

All browser-tested on my own build (`VITE_DATA_MODE=supabase` fixture mode, served at
127.0.0.1:4250) with Playwright Chromium, driven by the RYT-042 e2e fixtures
(`tests/e2e/fixtures/identity.ts` and `combat.ts`). Viewports: 390×844 with touch, 820×1180 with
touch, and 1440×1000.

| Scenario | Result |
| --- | --- |
| Player during initiative: only the own row has an entry; Bea and the goblins have no button or field; no console radio | pass |
| Keypad digits, Borrar, backspace; typing; Enter saves; Escape in the field and on a keypad key clears an unsaved total | pass |
| Tab order: die field, then keypad, then (disabled Save skipped) the bottom nav | pass |
| After save: focus on the 44px pencil; "1 de 4 listos"; live text | pass (settles after 1–2 frames) |
| Reopen with Enter on the pencil: focus moves to the "Tu iniciativa" heading; Escape keeps 17 and returns focus to the pencil | pass |
| Save and Cancel on the phone are clear of the bottom bar (save bottom 668 < nav top 779) | pass |
| Late joiner during the fight: the entry opens; after saving, focus goes to the order heading | pass |
| Turn banner: "Te toca dentro de 3 turnos" and "¡Te toca!"; pulse animation only with `no-preference` (`none` with reduce) | pass, see F3 |
| Recap for the Player (390/820/1440, 150%), for the DM table view and the DM console | renders, see F1 and F6 |
| End through the console with targets selected | F1 |
| Defeated enemy on the Player and DM screens (axe) | F2 |
| DM: table by default; Tab reaches the switch; ArrowRight goes to the console with focus kept; URL `view=console`; targets kept across switches; draft with `?view=table` opens the console without the switch | pass |
| 150% text: entry, banner, recap and DM viewbar at all viewports; `scrollWidth <= innerWidth` | pass |
| EN + light: entry, saved banner, "You act in" banner, recap, DM switch focus ring | pass, see F7 |
| Private data: a hidden "Ogre secreto" with `dm_notes`, plus Goblin `dm_notes`, are absent from the Player DOM and from every Player `get_combat_state` response; the DM table view also hides it during the fight | pass (see N1 for the recap in the fixture) |
| Axe (wcag2a/2aa/21aa/22aa) on the Player entry, the until banner, the recap, the EN light states and the DM table | 0 violations, except F2 when a combatant is defeated |
| Page errors and console errors during the Player flow | none |

## Limitations

- Fixture mode, not hosted Supabase, Auth or Realtime. The private-data check covers the fixture
  projection plus a read of the SQL projection code; I did not run SQL myself.
- Chromium only, and touch is emulated. iOS Safari and Android numeric keyboards, vibration and real
  screen readers were not tested (only accessible names and live-region text).
- DM "Vista jugador" preview: the switch opens the "Ver como jugador" menu. I did not complete a
  preview of the entry.
- Light theme with a defeated row and 150% text in light theme were not measured separately.
- Screenshots are in my scratch folder, outside the repository (not committed): every scenario
  above at 390/820/1440, plus the zoom crops `zoom-d20-1440`, `zoom-recap-names` and
  `p390-player-defeated`.

## Re-review scope

After fixes: F1 (end with targets selected, both views), F2 (axe with a defeated combatant,
both themes), F3 (own turn and waiting banners at 390/820/1440, ES/EN, 150%), and a visual
pass on F4 to F8. A source change invalidates this fingerprint.

## Round 2 (focused re-review)

- Date: 2026-11-03.
- Source snapshot: branch `worktree-agent-ab70fd5aa90f9a870`, head `1cc23a3` (fixes), after
  `f6c8e0b` (round 1 report). Tracked tree clean.
- Fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `6a616378bcdc86c34d5178e9397aa9db817f0e5ac9da52a13cbb63cc48e8692f`

### Verdict: PASS

All three blocking findings and the five minor findings from round 1 are resolved in the browser,
and N1 is resolved in the fixture. The regression pass found no blocking issue. Three new minor
findings (R2-1 to R2-3) remain. None blocks approval, but they should be tracked or fixed in a
follow-up.

### Round 1 findings

| Finding | Status | Evidence (browser, 390/820/1440) |
| --- | --- | --- |
| F1 target selection after end | Resolved | Path A: console with Goblin 2 chosen and the multi-target damage dialog open, then the fight ends: 0 dialogs, 0 checkboxes, no `.combat-multi-bar`. Path B (console hidden behind the table): clears once the console's projection refreshes (see R2-3). |
| F2 "Derrotado" contrast | Resolved | No pill. The status word reads "Derrotado"/"Defeated" with a skull at full contrast, on a dashed transparent row with the name struck through in the muted token. Axe is clean with a defeated goblin for the Player (dark ES, light EN), the DM table (dark ES, light EN) and the DM console. |
| F3 own-turn hierarchy | Resolved | Own turn: "Ahora" label, then "¡Te toca!"/"Your turn!" at display size (36/42.7/52px). Waiting: a full-width countdown band with an hourglass ("Te toca dentro de 1 turno", 20.8/23/26px), separate from "Después". The pulse appears only without reduced motion. |
| F4 d20 total | Resolved | Inter with `lining-nums tabular-nums`. "17" sits inside the larger triangle in both themes; "150" and "-12" switch to the smaller size and stay inside. |
| F5 out-of-range feedback | Resolved (see R2-1) | Typing 150 keeps 150 with `aria-invalid="true"`, shows the red hint "Escribe un total entre −20 y 99." (polite live region) and disables Save. There is no silent clamp on blur. "-12" is accepted. |
| F6 recap ledger | Resolved | From 40em there is one header per side ("Hecho / Recibido / Curado"); the labels per row are visually hidden. Phones keep the labels per row. Names are weight 700, the fate is centred, and the recap is at most 832px wide at 1440. |
| F7 disabled Save | Resolved | Warm tint in the palette: dark `color(srgb .23 .16 .09)` with #CBB699, light `color(srgb .92 .88 .85)` with #664F3A. |
| F8 rolling banner on phones | Resolved | At 390 the count is 28px, the pips sit under it, and it no longer wraps ("0 de 4 listos" fits on one line, also at 150%). |
| N1 fixture recap privacy | Resolved | "Ogro secreto" (hidden) is absent from the Player recap and the DM table recap, and present in the DM console recap. |

### New findings

#### R2-1 — Minor: the range hint is not linked to the field

- Where: `src/features/combat/ui/initiative-entry.tsx:89-90`.
- Reproduction: Player, ES, any viewport. Type 150. The input has `aria-invalid="true"` but no
  `aria-describedby`. Mantine drops the passed id when `error` is set, and the measured attribute
  is `null`.
- Impact: the live region announces the hint once, but returning focus to the field reads
  "invalid" without the reason.
- Fix: pass the id through `errorProps`/`describedBy`, or set `aria-describedby` with
  `wrapperProps`/`inputProps` so that it survives `error`. Then assert it in e2e.

#### R2-2 — Minor: focus drops to `body` when the end of the fight closes an open dialog

- Where: `src/features/combat/ui/dm-console.tsx:127-132`, the reset added for F1.
- Reproduction: DM console, choose a target, open "Daño", then end the fight from elsewhere
  (another device, or the fixture). The dialog closes and `document.activeElement` is `BODY` (390,
  820 and 1440).
- Impact: keyboard users lose their place. This case is rare: it needs an end from another
  device while the dialog is open.
- Fix: when the reset closes a dialog, move focus to the recap heading (`#combat-summary-title`).

#### R2-3 — Minor: the console is stale after switching to it once the fight has ended

- Where: `src/features/combat/ui/combat-page.tsx:210-217` (switching views does not refetch
  the now-visible projection).
- Reproduction: Realtime unavailable (polling fallback, as in the fixture). In the console,
  choose a target, switch to Mesa, and end the fight. The table shows the recap. Switch back to
  the console: for about 3 seconds (until the next poll) it shows "En curso", the turn bar with
  "Siguiente turno" and the "Daño/Curar" bar. It then turns into the recap and clears the
  selection.
- Impact: live controls on a closed fight for up to one poll interval; the server refuses them.
  With Realtime connected, invalidating the combat scope refetches both mounted projections, so
  this is limited to the fallback path.
- Fix: refetch (or invalidate) the target view's projection in `choose()`.

### Regression scope (browser-tested)

- Player initiative entry: keypad and typing; Escape clears; Enter saves; focus goes to the
  pencil. On reopen, focus goes to the heading, and Escape returns it to the pencil.
- Turn banners: initiative, waiting and own turn. The pulse is suppressed under reduced motion.
- Recap: Player at 390/820/1440, DM table view and DM console.
- DM view switch: arrows keep focus on the switch, and `?view=console` is set. A draft with
  `?view=table` opens the console without the switch.
- Privacy: no `NOTA-` and no hidden ogre in the Player DOM or in any Player `get_combat_state`
  response, and the table projection hides it.
- Themes and languages: ES dark and EN light.
- Text at 150%: no horizontal scroll for the entry, own turn, recap or DM views.
- Axe (`wcag2a/2aa/21aa/22aa`): 0 violations in every state above.
- Page errors: 0.

### Limitations (round 2)

- Same as round 1: fixture mode in Chromium only, emulated touch, no hosted Supabase or Realtime,
  no real devices or screen reader, and the DM "Vista jugador" preview not exercised.
- R2-3 was observed only with the polling fallback. The Realtime path was reasoned from
  `api.ts` (scope invalidation), not run.
- Screenshots and measurements are in my scratch folder outside the repository (not committed).
