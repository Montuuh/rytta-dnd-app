# RYT-044 independent UI/UX review

- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`), independent of the implementer.
- Date: 2026-11-03.
- Source snapshot: branch `worktree-agent-a3efb2b3c019f0796`, commits `68fe5ff` and `d9da43a`,
  clean working tree.
- Fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `a789aa480f30c9f33a8fc6e0ca86b628e8b9e92ffdc28c738bf9a3f3285108fd`

## Verdict: CHANGES_REQUIRED

The foundation is solid. The active-character group is a native radio group: arrow keys switch
characters one at a time in order, a polite status announces each switch, and the focus ring is a
3px outline. Axe found 0 violations in every state tested. There is no horizontal overflow, and
every target is at least 44px. ES and EN are complete, and reduced motion is honored.

Two findings block approval: the onboarding dialog does not return focus to its trigger, and on
phones the blocked-switch explanation is cut off by the bottom bar. Three further findings miss the
user's design bar: actions sit detached under the cards, the onboarding ring looks tappable but is
not, and the DM view is padded with empty slots that do nothing. They should be fixed in the same
pass.

## Findings

### F1 — High (blocking): onboarding dialog loses focus on Escape, Cancel or ×

- Where: `src/features/characters/ui/roster.tsx:445-452` (`FirstCharacter`).
- Conditions: 390px and 820px, ES and EN, dark theme (the bug does not depend on the theme).
- Reproduction: as a Player with no characters, open Party, focus "Crear mi personaje", press
  Enter, then press Escape (or activate Cancelar or ×). `document.activeElement` is `BODY`.
  Measured in the browser on both viewports.
- Impact: keyboard and switch users are sent back to the top of the document. This breaks the
  "Escape and return focus for overlays" rule in AGENTS.md and the design system. The dialog is
  unmounted rather than closed, so Mantine never restores focus. The roster page already works
  around this for the new-slot button (`roster.tsx:224-227`, verified to return focus), but the
  onboarding path was missed. The e2e test checks that Escape closes the dialog, but not where
  focus goes.
- Fix: keep a ref to the CTA and refocus it on close, as `PlayerRoster` does. Alternatively, keep
  the Modal mounted and toggle `opened` so Mantine's `returnFocus` applies. Add a focus assertion
  to `roster.spec.ts`.

### F2 — Medium (blocking): on phones the blocked-switch explanation is hidden behind the bottom bar

- Where: `src/features/characters/ui/roster.tsx:189-216`, where the alert renders after the grid.
- Conditions: 390px, ES (EN is the same), dark, with 1–3 characters. Not an issue at 820px, where
  the alert sits at y 573–629 of a 1180px viewport.
- Reproduction: Player with Arin active and Bram in reserve. Make `set_active_character` fail with
  `Character in combat` or `Trade busy`, then tap Bram. Measured with the page at the top: the
  alert spans y 738–815, the fixed bottom bar starts at y 779, and the viewport is 844px. Only the
  first line shows ("Arin está en un combate en curso. Cambia…"), and the rest is behind the bar.
  Nothing scrolls it into view. Screenshot: `blocked-viewport-phone.png` (scratch, see
  Limitations).
- Impact: on a phone, which is the primary table device, the tapped card just snaps back to Arin
  and the reason is half-hidden. Screen readers do get it (`role="alert"`), but sighted touch users
  may not. This is the explanation the acceptance flow promises.
- Fix: show the explanation next to the choice, either above the grid between the lede and the
  cards or inline on the card that was tapped. Otherwise, scroll it into view while respecting the
  bottom-bar inset. Also label the alert's close button "Cerrar"/"Close" instead of
  `action.cancel` ("Cancelar"; `roster.tsx:207`): closing a message is not cancelling anything.

### F3 — Medium (design bar): plain, detached sheet actions under every card

- Where: `src/features/characters/ui/roster.tsx:400-410` and `roster.css:125-128`.
- Conditions: all viewports, themes and languages. In the 390px, 820px and 150%-text screenshots,
  "Terminar ficha" wraps to two lines at 150%.
- Observation: each card is followed by a subtle text button ("Ficha" or "Terminar ficha") that
  floats outside the card frame, repeated identically up to four times. On draft characters it
  also repeats the card's own meta line ("Ficha a medias" above, "Terminar ficha" below). This is
  the "plain default-looking button" the user asked to avoid. It reads as loose text under a card
  rather than an action that belongs to the character. Separately, the new-slot tile is taller
  than the character cards on the same row (light ES 820px: card bottom ≈504px, slot bottom
  ≈548px).
- Fix: keep the radio label and the link as separate interactive elements, since nesting is
  invalid, but draw them as one object. For example, use a footer band or 44px icon button inside
  the same bordered frame, below the radio area, with a divider. For drafts, let the footer carry
  the "finish" call to action and drop the duplicated meta line. Align slot heights per row.

### F4 — Medium (design bar): the onboarding "+" ring looks tappable but is not

- Where: `src/features/characters/ui/roster.tsx:421-427` and `roster.css:212-223`.
- Conditions: 390px and 820px, all themes.
- Reproduction: on the onboarding card, tap the large 84px solid ring with "+". No dialog opens
  (verified: 0 dialogs). Only the button below responds.
- Impact: the most prominent element in a touch-first onboarding is a false affordance. It looks
  more like the primary target than the real button does.
- Fix: make the first ring the action (a real button with the accessible name of the call to
  action), or drop the "+" glyph and the filled treatment so it reads as decoration.

### F5 — Medium (design bar): the DM roster is mostly empty placeholders

- Where: `src/features/characters/ui/roster.tsx:271-276` (`EmptySlots` in `DmRosters`) and
  `roster.css:140-147`.
- Conditions: DM, ES, dark, 820px and 390px.
- Reproduction: a DM with three Players holding 3, 1 and 1 characters sees 7 dashed placeholders.
  At 820px they are full card height, and the page is 1306px tall for 5 characters. At 390px it is
  1817px. Screenshots: `dm-rosters-tablet.png`, `dm-rosters-mobile.png`.
- Impact: the DM cannot act on empty slots, so they are filler that pushes the real information
  (who plays whom, who is in reserve) down the page. On a phone at the table, the DM scrolls past
  several screens of empty rings.
- Fix: give the DM a compact layout per Player: the active character plus reserve characters as
  smaller entries, with the limit shown as a small slot meter (for example, four 12–16px rings
  beside the Player's name) instead of full-size tiles. At minimum, keep empty DM slots compact on
  every row.

### F6 — Low: the DM entry point's count and faces are misleading

- Where: `src/features/characters/ui/party.tsx:133` (passes only reserve characters) and
  `roster.tsx:529-531` (`roster.manageCount`).
- Conditions: DM, ES, 820px and 390px.
- Reproduction: in the same fixture, the DM Party link is announced as "Personajes de los
  jugadores, 2 en total", but Players hold 5 characters; 2 is the reserve count. Its faces ("B",
  "C") are the initials of reserve characters, with no hint that they mean "in reserve".
- Fix: announce what is counted ("2 en reserva") or count every Player character. Consider
  whether the faces add anything for the DM.

### F7 — Low (copy): Party lede contradicts the onboarding

- Where: `src/shared/i18n/characters-es.ts:21` / `characters-en.ts`
  (`characters.playerIntro`), shown by `party.tsx` above `FirstCharacter`.
- Conditions: Player with no character, ES and EN.
- Observation: "Tu personaje y sus recursos. Pide a tu DM los cambios que necesites." sits directly
  above "¿Con quién vas a jugar? … Crea tu personaje". The Player has no character yet and is now
  invited to create one personally, so the lede is irrelevant and partly contradicts the
  onboarding.
- Fix: hide the lede in the onboarding state, or give it copy that fits that state.

### F8 — Low: create dialog actions wrap awkwardly at 390px

- Where: `src/features/characters/ui/roster.tsx:506-513`.
- Conditions: 390px, ES.
- Observation: "Cancelar" sits alone on a right-aligned row, with "Crear y hacer la ficha" on the
  row below (`create-dialog-phone.png`).
- Fix: on phones, stack both as full-width buttons (primary first) or keep them on one row.

## What works (verified in the browser)

- Native `radiogroup` "Personaje activo" with one Tab stop. ArrowRight switched to Bram, then to
  Cora, then wrapped to Arin. Exactly three `set_active_character` calls were sent, in that order,
  and the final checked state matched the server. The polite status read "Ahora juegas con Bram.",
  and Party then showed only the active character plus shared teammates.
- On keyboard focus the radio card shows a 3px `--app-focus` outline. The active state is
  conveyed by border, check badge and the word "Activo"/"Active", never by color alone. Reserve
  medallions are desaturated while their text keeps full contrast.
- The new-slot button opens the dialog, Escape returns focus to it, and its accessible name
  includes the slot count ("Crear un personaje (hueco 3 de 4)").
- Create dialog: the name field is focused on open. On a server error, focus moves to the alert,
  which says "No se pudo crear el personaje…".
- Blocked switch: the active character is kept, the correct trade and combat copy is shown
  (ES and EN catalogs), and focus stays on the radio that was tried.
- Full roster: 4 cards and no new slot. Long names wrap inside the card at 150% text without
  overflow.
- After navigating to the roster, focus moves to `main`.
- DM Player preview: no radios and no new slot; the cards state "Activo"/"En reserva" in words.
- Axe (wcag2a/2aa/21aa/22aa): 0 violations in every state below. `scrollWidth` never exceeded the
  viewport, and no visible control was under 44px.
- Reduced motion: card transitions are reduced to about 0s.

## Tested scenarios

Browser-tested with Playwright Chromium against my own build of this snapshot (identity fixture,
`tests/e2e/fixtures/identity.ts`) at 390×844 and 820×1180, both with touch enabled:

1. Player onboarding (ES dark): axe, overflow, tapping the ring, keyboard open, initial focus,
   Escape, Cancelar and focus return, and the create error (500) with focus on the alert.
2. Party with 3 characters and a complete sheet (ES dark): the roster link (44px, accessible name),
   the roster, Tab order, focus ring, an arrow switch, rapid arrows, the status message, and back
   to Party.
3. Full roster with 4 characters and a long name, at 150% root text with reduced motion.
4. Blocked switch on a Trade busy error and on a combat error: keyboard and tap, alert copy, alert
   position in the viewport, and the close-button label.
5. EN light roster with 2 characters; Escape from the new-slot dialog returns focus.
6. EN dark onboarding with the Wizard class theme.
7. ES light roster with complete sheets.
8. DM Party (roster link label), DM rosters per Player, and the DM Player preview of Arin
   (read-only).

Screenshots and code only (no separate browser run): the implementer's evidence PNGs in this
folder were inspected (onboarding, create-dialog, roster, roster-full, roster-switched,
roster-en-light, party-entry, dm-rosters), and the code review covered `roster.tsx`, `roster.css`,
`party.tsx`, `player-assignment.tsx`, the roster catalogs and `audit-timeline.tsx`.

## Limitations

- My screenshots were saved to a throwaway scratch folder outside the repository, as instructed.
  They are not committed evidence. Line and rectangle measurements above come from those runs.
- Fixture-backed only. Not checked: hosted Supabase Auth or PostgREST, Realtime, an iOS Safari
  device, and real screen-reader output (the accessibility tree and axe only).
- Not inspected: the audit timeline entry "Cambio de personaje activo" in the DM history (code
  only); the assignment dialog's new copy (code only); the inventory, shop and trade pickers'
  filtering to active characters (covered by implementer e2e and SQL tests, not re-run here);
  combat roster filtering.
- Only the Default and Wizard class themes were rendered. Other themes rely on shared tokens and
  `class-themes.test.ts`.
- 150% text was emulated through the root font size, not browser zoom settings.

## Round 2

- Date: 2026-11-03.
- Snapshot: `35d3fa2`. It contains `397dc0c`, `8e16b2b` (archive migration), `d3a4ea5` (fixes and
  archive UI) and the merge of `main` (RYT-040 and RYT-041).
- Fingerprint: `159a88a3747f2988c34ec3fd61d6bd1f801dbf2d2e92bf16ee7364fda1b44ad6`.
- Method: my own fixture build (`VITE_DATA_MODE=supabase`, identity fixture) served on
  127.0.0.1:4227, driven by throwaway Playwright Chromium scripts at 390×844 and 820×1180 with touch
  enabled. I stopped the server and deleted the build afterwards.

### Verdict: CHANGES_REQUIRED

F1–F8 are all resolved. The new archive scope adds two blocking regressions of the same class
reviewed in round 1:

- at 150% text on a 390px phone, the archived section scrolls the page sideways;
- archiving a character from Party drops keyboard focus to the document body.

### Round 1 findings

| Finding | Status | Browser evidence |
| --- | --- | --- |
| F1 focus return from onboarding | Resolved | Escape, Cancelar and × all return focus to "Crear mi personaje" (390 and 820) |
| F2 blocked-switch notice | Resolved | Alert renders above the grid, at y 248–325 on 390 (bottom bar at 779) and y 307–363 on 820; close label "Cerrar"; selection kept on the server's active character. See N3 for a residual issue |
| F3 detached sheet actions | Resolved | Sheet link is a footer band inside the card frame; ⋯ is a sibling of the radio label; all slots have equal height (242px / 243px) |
| F4 decorative ring | Resolved | No ring is interactive or has a pointer cursor; the button is the only action |
| F5 DM filler slots | Resolved | Compact rows per Player with a 4-ring meter and a spoken "N de 4 personajes"; 0 empty cards; page 1180px at 390 vs 1817px before |
| F6 DM link count | Resolved | "Personajes de los jugadores, 2 en reserva"; visible meta "2 en reserva"; icon instead of initials |
| F7 Party lede | Resolved | Lede hidden during onboarding; new lede "Tu personaje activo, sus recursos y tus compañeros de mesa." |
| F8 dialog actions on phones | Resolved | 390px: primary "Crear y hacer la ficha" full width at y 223, Cancelar full width below; 820px: one row |

### New findings

#### N1 — Medium (blocking): archived row scrolls the page sideways at 150% on phones

- Where: `src/features/characters/ui/roster.tsx:820-834` and `roster.css:273-325`
  (`.roster-row-actions` has `flex-shrink: 0`).
- Conditions: 390px, EN light (ES has the same structure), 150% root text.
- Reproduction: Player with four characters in the roster and one archived (Zed). Open
  "Archived": the row shows "No free slot" plus a disabled "Restore". At 150% the Restore button
  extends to x≈406, `scrollWidth` exceeds the viewport by 16px, and the page scrolls horizontally.
  At 100% and at 820px it fits. It also fits at 150% when restore is available, because there is no
  note.
- Impact: this breaks the no-horizontal-scroll rule at 150% text.
- Fix: let the actions wrap, or move the "No free slot" note under the name or meta line so the
  action group can shrink.

#### N2 — Medium (blocking): archiving from Party loses focus

- Where: `src/features/characters/ui/party.tsx:383-386` (`onArchived`).
- Conditions: DM, ES light, 390px and 820px.
- Reproduction: create an unassigned character (Grom), open ⋯, choose "Archivar personaje", then
  "Archivar". The card and its trigger disappear, the status "Grom está archivado." appears at the
  top, and `document.activeElement` is `BODY`. Cancel and Escape do return to the trigger. The
  roster page handles the same case by focusing its notice; Party does not.
- Fix: focus the archived notice (`tabIndex={-1}`), or a stable heading or next card, after a
  successful archive.

#### N3 — Low: closing an error notice drops focus

- Where: `src/features/characters/ui/roster.tsx:201-210` and `:119` (`onClose={() => setNotice(null)}`).
- Conditions: Player, ES dark, 390px and 820px.
- Reproduction: trigger a blocked switch, then activate "Cerrar" on the alert. Focus goes to
  `BODY`.
- Fix: return focus to the checked radio, or to the notice container.

#### N4 — Low: the disabled archive explanation is unreachable by keyboard

- Where: `src/features/characters/ui/roster.tsx:660-671`.
- Conditions: Player and DM, all viewports.
- Reproduction: focus ⋯ on the active character and press Enter. The menu opens, but focus stays
  on the trigger. ArrowDown does not move into the menu, because the only item is disabled. The
  hint "Activa otro personaje para poder archivar este." is a `Menu.Label` not linked to the item
  (`aria-describedby` is null).
- Impact: sighted pointer users see the reason; keyboard and screen-reader users get a menu with
  nothing reachable.
- Fix: link the hint with `aria-describedby`, or keep the item focusable with `aria-disabled` so
  arrow keys reach it.

#### N5 — Low: ⋯ overlaps the medallion at 150% on phones

- Where: `roster.css:130-134` (absolute at top 2px, right 2px).
- Conditions: 390px, 150% text.
- Observation: the 44px ⋯ button overlaps the portrait ring (`full-150` capture). It is still
  usable.
- Fix: reserve top padding or a corner inset for the menu.

#### N6 — Low: a Player with only archived characters gets the first-character onboarding

- Where: `src/features/characters/ui/party.tsx:128` and `:208`; `roster.tsx:243`.
- How it can happen: the DM unlinks the active character while the Player's others are archived.
- Observation: Party shows "¿Con quién vas a jugar?" with no roster link and no mention of the
  archived character. `party/roster` shows an empty radio group ("0 de 4 personajes") above the
  collapsed "Archivados 1".
- Fix: offer "Restaurar" or link to "Mis personajes" in the onboarding when archived characters
  exist.

#### Nit (non-blocking)

`ArchiveDialog` autofocuses the destructive "Archivar" button (`roster.tsx:738`). Archiving can be
undone, so this is acceptable, but initial focus on Cancel would be the safer default.

### Archive and restore flows (browser-verified)

- **Player, ES dark, 390 and 820.**
  - The ⋯ menu on the active character shows "Archivar personaje" disabled, with the reason.
  - On a reserve character the menu works by keyboard: Enter opens it with focus on the item.
  - The confirmation "¿Archivar a Cora?" says that archiving frees a slot and keeps the sheet and
    inventory. Escape returns focus to ⋯.
  - Confirming focuses the notice "Cora está archivado. Queda un hueco libre." The card leaves the
    grid, the slot count drops to 2 of 4, and a new slot appears.
  - "Archivados 1" is collapsed (`aria-expanded=false`). Restore focuses "Cora vuelve al plantel."
  - The fixture recorded exactly one `archive_character` and one `restore_character` call. Axe
    found 0 violations throughout.
- **Full roster, EN light.** "No free slot" is shown, "Restore Zed" is disabled, and the copy reads
  "All four slots are taken. Archive a character to free one."
- **DM, ES light.**
  - On a Player's active character the menu entry is disabled with the reason.
  - Archiving the unassigned Grom from Party uses the NPC copy ("Sale de Grupo y de las listas…").
  - Grom leaves Party.
  - DM "Archivados 2" lists Zed ("Arin, Ficha a medias") and Grom ("Sin jugador"). Restoring Grom
    works and focuses the notice.
- **Combat smoke test (RYT-041 × RYT-044).** DM fixture with Bram in reserve and Zed archived, in a
  new encounter: "Añadir combatientes" offers only "todo el grupo", Arin, Bea and Cato. Bram and Zed
  appear nowhere on the page.
- **DM Player preview.** "Personajes de Arin" shows 0 radios and 0 ⋯ menus (read-only), and axe
  found 0 violations.

### Round 2 coverage

- **Browser-tested:** onboarding (focus, ring, lede, dialog layout); roster with 3 characters (Tab
  order, arrow switch, blocked combat switch, notice position, close); archive and restore;
  full roster with an archived character in EN light at 150% with reduced motion (transition
  about 0s); a Player with only archived characters; DM Party and rosters, archive and restore;
  DM preview; combat add list.
- **Axe** (wcag2a/2aa/21aa/22aa): 0 violations in every state. No targets under 44px.
- **Themes and languages:** dark and light, ES and EN; Default theme only in this round.
- **Code only:** the archive SQL and RLS (`8e16b2b`), the RYT-040 and RYT-041 merged UI beyond the
  combat add list, and the audit wording.
- **Limitations:** same as round 1. Fixture only; no hosted Supabase, iOS Safari or real screen
  reader. Captures are in a scratch folder outside the repo.
