# RYT-043 independent UI/UX review

- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`), independent of the implementer.
- Date: 2026-11-03.
- Source snapshot: worktree `agent-a423959dcf42b15dc`, commit `fd8b445` (based on `main` `07ed4fb`).
- Fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `10f4d2b9c418200e4cc313aeedb17b0bf81f9b7dd40e751af15e37a16d99da8c`
- Applied: AGENTS.md, src/AGENTS.md, docs/ui-review.md, docs/design-system.md, docs/combat-design.md,
  ADR 027, ticket RYT-043, implementer report `docs/evidence/RYT-043/validation.md`, and the user's
  design bar for this ticket (no filler text, no default-looking controls, no pill overuse, real
  craft, legible at table distance).

## Verdict: CHANGES_REQUIRED

The direction is right and mostly well done. Side-shaped tokens with portraits and creature art make
the order much easier to read. The band seal plus word reads clearly as "not a bar". Near death is
the only filled seal and stands out. The bestiary token works as the upload control. The three
RYT-042 R2 fixes work in the browser. Axe is clean everywhere I tested.

Two Major issues remain. Both hurt the exact goals of this ticket:

- The DM's phone console now wraps the hit point line mid-phrase.
- A skull now means both "enemy" and "defeated" in the same row.

## Findings

### F1 — Major — the DM phone console breaks the hit point line and shortens the bar

- Where: `src/features/combat/ui/initiative-rail.tsx:218` adds the 44px token to every row. The
  phone rules in `src/features/combat/ui/combat.css:1361-1376` only rebalance `.combat-rail.is-large`
  (the table rail), not the console rail.
- Viewport/theme/language: 390px, dark, ES (any theme; worse at 150% text and with the multi-select
  checkbox column).
- Reproduction: DM, `#/campaign/<id>/combat/<encounter>?view=console`, active fight with damaged
  goblins.
- Measured in the browser: the `.combat-hp-text` column is 107px wide. "3/8 PG · Malherido",
  "2/8 PG · A punto de caer" and "0/8 PG · Derrotado" wrap to two lines. The band phrase splits as
  "A / punto de caer" (screenshot of row Goblin 3).
- Before (RYT-042 `docs/evidence/RYT-042/dm-console-mobile.png`), the same rows stayed on one line
  with a full-width bar.
- Impact:
  - This is a regression on the DM's main working surface at the table.
  - The proportional bar becomes a short stub.
  - The band word, the thing this ticket is about, is broken across lines.
- Fix direction (any one):
  - Use a smaller or hidden token in the console rail below 40em.
  - Move CA under the name.
  - Keep `combat-hp-status` together with `white-space: nowrap` and let the line wrap before the
    middle dot.
- Then re-capture 390px and 390px at 150%.

### F2 — Major — the skull means both "enemy" and "defeated" in the same row

- Where:
  - `src/features/combat/ui/parts.tsx:170-179`: `SideIcon` uses `Skull` for every enemy.
  - `src/features/combat/ui/token.tsx:155`: the defeated band seal uses `Skull`.
- Viewport/theme/language: all viewports and themes; ES and EN.
- Reproduction: Player table view with seeded goblins. Every living goblin has a red skull before
  its name. Goblin 4 has a skull before its name and a skull seal saying "Derrotado".
- Impact:
  - The user asked for enemy health to be easy to understand. A skull is the strongest "dead"
    symbol, and it now sits beside every healthy enemy, one row above or below a skull that really
    does mean dead.
  - Side is now shown three times: hexagon shape, red rim and skull icon. The skull adds nothing
    except the confusion.
  - Skull-for-defeated existed before as a small inline icon. This delivery made it a band glyph
    in the new health vocabulary, which is what makes the clash prominent.
- Fix direction: drop the side glyph wherever a token is present (keep the side in the row's
  accessible text, which already says "Enemigo"), or give enemies a non-mortal glyph (for example
  Swords). Keep Skull only for defeated or dead.

### F3 — Minor — "No compartido" is set in display type as if it were a real state

- Where:
  - `src/features/combat/ui/combat.css:1433-1444`: `.combat-band.is-large .combat-band-word` is
    heading serif, 1.25rem/1.1rem.
  - `src/features/combat/ui/token.tsx:135`: the `unknown` band.
- Viewport/theme/language: table view, all viewports. ES "No compartido", EN "Not shared".
- Measured: at 820px the band word is 20px serif bold and the combatant name is 18.4px. "No
  compartido" is the loudest text in Cato's row.
- Impact:
  - The absence of information gets the same visual weight as "A punto de caer", which matters.
  - This goes against the user's "no filler text" bar.
  - The Player's own exact hit points (14px meta under the bar) also end up quieter than enemy band
    words in the same list.
- Fix direction: render `unknown` quietly (muted colour, meta size, no large style), or as just the
  eye-off seal with the word in a smaller muted line.

### F4 — Minor — "CA 15" and "CA 10" split across lines next to the new tokens

- Where:
  - `src/features/combat/ui/bestiary.tsx:84-90`: the stat line, with the text column at
    `flex: 1 1 8rem` (`combat.css:1517`).
  - `src/features/combat/ui/combatant-detail.tsx:86-92`: the detail meta line beside the 72px token.
- Viewport/theme/language: 390px, ES.
- Reproduction: Bestiary tab on a phone ("Enemigo · PG 7 · CA / 15 · Inic. +2"), and DM detail of
  Goblin 2 ("Enemigo · Iniciativa 16 · CA / 10").
- Impact: a label is separated from its value. This was introduced by the token taking width.
- Fix direction: non-breaking spaces inside each "label value" pair (`CA {{value}}`,
  `PG …`, `Inic. …`), or one nowrap span per segment.

### F5 — Minor — the bestiary picker's name is read twice

- Where: `src/features/combat/ui/bestiary.tsx:262`. The visually hidden `<span>{action}</span>`
  inside the `<label>` names the file input, and the span is also exposed as separate text.
- Viewport/theme/language: all; ES and EN.
- Reproduction: accessibility snapshot of the card shows `button "Añadir una imagen de Goblin"`
  followed by `text: Añadir una imagen de Goblin`.
- Impact: screen reader browse mode reads the action twice. This is a small verbosity issue, not a
  blocker.
- Fix direction: give the input `aria-label={action}` and hide the label's text from the
  accessibility tree, or keep the label text and drop the duplicate.

### F6 — Note — the lair token shows a letter

- Where: `src/features/combat/ui/token.tsx:93` (monogram for the lair). Shapes are at
  `combat.css` `.shape-ally` (28% radius) vs `.shape-lair` (10% radius).
- Viewport/theme/language: 390px and 820px, all themes.
- Observation:
  - "Guarida" shows a "G" letter on a muted rounded square. A place has no initials, so the letter
    reads like a mystery creature.
  - At 44px, the ally rounded square and the lair square are hard to tell apart by shape alone.
    Colour and the castle side icon do that work.
- Suggestion: draw the Castle glyph in the lair token face instead of a monogram.

### F7 — Note — at 150% on 390px the "Now" token sits alone on its own line

- Where: `combat.css:1460-1470` (`.combat-table-actor` wrap).
- Observation: at 150% text the 56px token stacks above "NOW / Your turn!" and leaves an empty row
  beside it. It is legible and does not overflow, but the large-banner composition is lost.
- Optional: put the token beside the label line at a smaller size when wrapping.

## What works (browser-verified)

- **Tokens:**
  - Round party, hexagon enemy, rounded-square ally and square lair, with side-coloured rims.
  - The accent rim and glow mark the active combatant in the order and the banner.
  - Defeated tokens are grey and desaturated.
  - The DM-only hidden ogre has a broken (dashed) rim plus the "Oculto" badge.
  - The monogram fallback is decorative (`aria-hidden`); the accessibility tree reads
    "15 Goblin 3 Enemigo A punto de caer".
  - A 404 creature image falls back to the monogram, with no broken-image icon (0 broken `img`).
- **Bands:**
  - Each band has its own glyph: heart, heart-minus, droplets, filled cracked heart, skull, eye-off.
  - The word is in `--app-text` and never relies on colour alone.
  - No `.combat-hp-bar` and no numbers for Players.
  - Exact HP keeps a bar for the own character and sharing teammates, and in the DM console.
- **Bestiary:**
  - The token is the picker.
  - It is reachable with Tab, has a 3px focus ring around the token and a 68×68 target.
  - The camera or image-plus seal shows the action.
  - An unreadable file and a failed upload (storage 500) show a clear message under the card.
  - Upload succeeds after retry, and the success status is announced.
- **R2-1:** `aria-describedby` points at "Escribe un total entre −20 y 99.", and `aria-invalid` is
  true for 150.
- **R2-2:** after a remote end with the multi-target damage dialog open, focus lands on
  `.combat-recap-title` "Resumen del combate".
- **R2-3:** switching Mesa → Consola after a remote end shows "Terminado" in about 85 ms.
- **Recap:** tokens beside names, in EN light at 390px.
- **Axe** (wcag2a/2aa/21aa/22aa): 0 violations in all 20 runs listed below. No horizontal overflow
  in any run.
- **Reduced motion:** no running animations (`document.getAnimations()` is empty). The glow is a
  static drop shadow.

## Tested scenarios

All of these were driven in a real Chromium browser (Playwright 1.x from the worktree). The build
was `vite build --base=/rytta-dnd-app/` in supabase mode with the e2e fixture environment, served
on `127.0.0.1:4260`. Data came from `tests/e2e/fixtures/combat.ts` and `identity.ts`; the fight is
seeded like the RYT-043 tests, plus an ally NPC (long name variant), a lair and the hidden ogre.

| Scenario | Viewports | Theme / language | Axe |
| --- | --- | --- | --- |
| Player table view, bands, tokens, banner | 390, 820, 1440 | dark Hearth, ES | 0 |
| Player table view | 390, 820 | light Barbarian, EN | 0 |
| Player table view, 150% text | 390, 820 | light Barbarian, EN | 0 |
| Player table view | 390 | dark Druid, ES | 0 |
| Broken goblin image (404) → monogram; accessibility snapshots; reduced motion | 820 | dark, ES | n/a |
| DM table view, console order (exact HP, hidden ogre), turn bar, Goblin 2 detail | 390, 820, 1440 | dark, ES | 0 (×9) |
| DM console after the fight ended (recap with tokens) | 390 | light, EN | 0 |
| Bestiary: empty monograms, Tab to picker, failed upload, successful upload, 150% | 390, 820, 1440 | dark, ES | 0 |
| R2-1 initiative out-of-range hint | 390 | dark, ES | 0 |
| R2-2 focus to recap (multi-target damage dialog), R2-3 refetch on view switch | 820 | dark, ES | n/a |
| DM console phone row measurement (F1) | 390 @2x | dark, ES | n/a |

**Screenshot or code only (not driven by me in the browser):**

- The implementer's `docs/evidence/RYT-043/*.png`.
- The DM "Vista jugador" preview of tokens.
- A teammate in the `down` band ("Caído" with heart-off).
- R2-2 through the single-target detail damage button. My locator did not find the button, so only
  the multi-target path was verified.
- Real touch long-press.

## Limitations

- Images are fixture SVGs served through mocked signed URLs. Real Supabase Storage, real signed URL
  expiry and real photo crops (faces, non-square photos through `toSquareWebp`) were not seen.
- iOS Safari `clip-path` rendering and real screen readers (NVDA/VoiceOver) were not tested.
  Accessibility checks used Playwright accessibility snapshots plus axe.
- Only two class themes were checked (Barbarian light, Druid dark) out of 13.
- Throwaway scripts and captures are outside the repository, in the reviewer's scratchpad
  (`.../scratchpad/rv/`), and are not committed evidence.
- I built and served `dist-review` on port 4260 myself; both have been stopped and deleted.

## Re-review scope

After fixes, re-check:

- F1: console rows at 390px, at 150%, and with multi-select on.
- F2: the side glyph against the defeated seal in the table and console.
- F3: the weight of the unknown band.
- F4: stat lines in the bestiary and the detail.
- F5: the picker's accessibility snapshot.

Then run axe again in ES dark and EN light.
