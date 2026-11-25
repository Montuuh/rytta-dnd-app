# RYT-181 audit: the bestiary and the storeroom before the redesign

Measured on 25 November 2026 on `next` (46ad8db3) against the e2e fixture backend on a development
server, Hearth theme, Spanish, reduced motion, with a throwaway Playwright script: the bestiary
(`?panel=bestiary`) and the item storeroom (`?panel=items`) at 390x844, 820x1180 and 1280x800, and
eight tasks performed on the phone from the open panel, one capture per step. Fixture: 330 SRD
creatures from one pack; a storeroom of 9 items, three characters (Arin, Bea, Cato) and one pending
Player proposal. A second storeroom with 129 items (the 9 plus 120 copies) was used only to see a
long catalogue. Raw numbers are in `before/metrics.json`, captures in `before/`.

A tap is one press on a control; typing a word counts once; a scroll is counted when the next
target is outside the screen or under a bar. Positions are pixels from the top of the screen.

## Measurements on arrival

| Bestiary                               | Phone 390             | Tablet 820 | Laptop 1280                 |
| -------------------------------------- | --------------------- | ---------- | --------------------------- |
| Page height                            | 37,229px              | 28,796px   | 1,229px (list: 35,235px)    |
| First control                          | 183px (New creature)  | 270px      | 212px                       |
| Search field                           | 328px                 | 362px      | 312px                       |
| First creature row                     | 595px                 | 630px      | 542px                       |
| Rows fully inside the first screen     | 1                     | 6          | 2                           |
| Height of one row                      | 84 to 147px           | 62 to 83px | 84 to 147px                 |
| Controls in the main area (rows shown) | 99 (23)               | 148 (37)   | 106 (23)                    |
| Filled buttons                         | 0                     | 0          | 0                           |
| Badges and pills                       | 47                    | 61         | 47                          |
| Help text over 40 characters           | 576 (licence, at end) | 576        | 646 (licence, keyboard tip) |
| Controls under 44px                    | 0                     | 0          | 0                           |
| Horizontal overflow                    | none                  | none       | none                        |
| Nodes in the main area                 | 755                   | 986        | 765                         |
| Tab stops before the search            | 11                    | 26         | 26                          |

| Storeroom (9 items)                | Phone 390          | Tablet 820 | Laptop 1280 |
| ---------------------------------- | ------------------ | ---------- | ----------- |
| Page height                        | 1,390px            | 1,180px    | 1,107px     |
| First control                      | 183px (New item)   | 198px      | 212px       |
| Search field                       | 239px              | 254px      | 268px       |
| First item row                     | 546px              | 459px      | 473px       |
| Rows fully inside the first screen | 2                  | 9 (all)    | 4           |
| Height of one row                  | 64 to 86px         | 66px       | 66px        |
| Controls in the main area          | 34                 | 41         | 41          |
| Filled buttons                     | 1 (Repartir botín) | 1          | 1           |
| Badges and pills                   | 18                 | 27         | 27          |
| Help text over 40 characters       | 0                  | 0          | 0           |
| Controls under 44px                | 0                  | 0          | 0           |
| Horizontal overflow                | none               | none       | none        |
| Nodes in the main area             | 429                | 447        | 447         |
| With 129 items: nodes and controls | 2,789 and 274      | 3,047, 281 | 3,047, 281  |
| With 129 items: page height        | 10,560px           | 9,046px    | 9,074px     |
| Tab stops before the search        | 10                 | 25         | 25          |

Badges in the bestiary are the challenge chip of each mounted row and the size of each of the 24
letter groups; in the storeroom, the item count, eight category chips with their counts, the
pending count and, from 768px, a source tag on every row. axe (WCAG 2.0 to 2.2, A and AA) reports
no violation on arrival on either screen at the three sizes.

Heading outline. Bestiary: h1 "Centro de mando DM" (visually hidden on the phone), h2 "Bestiario",
one h3 per letter group ("A (23 en este grupo)", 24 groups). The phone stat block is a sheet with
two h2 (the sheet title, then the creature) and h3 sections; in the laptop side pane the creature
is an h3. Storeroom: h1, h2 "Almacén de objetos", nothing below; on the phone no heading is visible
(the panel switcher carries the name).

The long list. The bestiary mounts letter groups near the screen only: 23 rows on arrival (37 on
the tablet), at most 87 (117) rows and 1,840 (2,347) nodes while scrolling the whole list. Group
heights are estimated until seen, so the phone page grows from 37,229px to
40,167px during the scroll. On the laptop the list is its own scroll area inside a page that also
scrolls 429px. Opening a stat block from the middle of the list and closing it leaves the row at
the same place (405px before and after on the phone) with focus on it, at the three sizes. The
storeroom mounts every row: 129 items are 129 rows; its scroll position and focus also survive
opening and closing an item. The first row is painted 1.4 to 1.7 seconds after navigation on both
screens (development server, so only comparable with later runs of the same kind). Typing in the
bestiary search updates the list in 35 to 350ms per key; the storeroom with 129 items in 20 to
70ms.

## Steps per task (phone, from the open panel)

| Task                                                 | Taps | Typing | Scrolls | Confirming button                                    | Feedback                                                        |
| ---------------------------------------------------- | ---- | ------ | ------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| a. Find a creature and read AC, HP and an attack     | 2    | 1      | 1       | none                                                 | AC and HP at 596px of the sheet; the first attack at 1,300px    |
| b. Send it to an encounter that exists               | 4    | 1      | 0       | "Añadir a Cripta" at 526px, full-screen dialog       | the dialog becomes "En el encuentro" with two more buttons      |
| b. Send it when no encounter is open                 | 4    | 2      | 0       | "Añadir a Emboscada" at 545px                        | the same result screen; the encounter is created with that name |
| b. From Combat (`&encounter=` in the address)        | 4    | 1      | 1       | "Añadir" at 737px, in the bar of the stat block      | a line above the bar, "En Cripta: Guerrero goblin."             |
| c. Filter by source                                  | 1    | 0      | 0       | none (segment at 407px)                              | count line                                                      |
| c. Filter by type                                    | 3    | 0      | 0       | "Ver 19 criaturas" at 787px                          | count, a chip at 491px                                          |
| c. Challenge band and sort by challenge              | 4    | 0      | 1       | "Ver 1 criatura" at 771px                            | count, three chips in two rows                                  |
| c. Remove one filter                                 | 1    | 0      | 0       | none (chip, 44px)                                    | the chip goes and the count changes                             |
| d. Create a quick creature (7 fields, name required) | 3    | 1      | 0       | "Guardar criatura" at 624px                          | notice, and the new stat block opens                            |
| d. Create one in the full editor, from an archetype  | 4    | 1      | 1       | "Crear borrador" at 1,495px, then "Guardar" at 731px | notice, and the new stat block opens                            |
| e. Find an item and give it to one character         | 7    | 1      | 0       | "Revisar" 560px, "Confirmar" 383px, "Cerrar" 323px   | "Botín entregado" in the drawer; nothing on the page afterwards |
| f. Distribute loot (2 items, 3 recipients)           | 11   | 0      | 1       | "Revisar" 822px, "Confirmar" 578px, "Cerrar" 518px   | "Botín entregado" by recipient; nothing on the page afterwards  |
| g. Accept a proposal                                 | 4    | 0      | 0       | "Crear y dar a Arin" at 795px, after the whole forge | the drawer lists it as accepted; the notice is under the drawer |
| g. Reject a proposal                                 | 4    | 0      | 0       | "Rechazar propuesta" at 633px                        | the drawer lists it as rejected; the notice is under the drawer |
| h. Create an item (name required)                    | 2    | 1      | 0       | "Forjar objeto" at 795px, sticky                     | notice on the page, focus on "Nuevo objeto"                     |

Every first target of these tasks is visible on arrival: creature search 328px, Filtros 332px,
Nueva criatura 183px, item search 239px, Repartir botín 293px, Propuestas de jugadores 333px, Nuevo
objeto 183px. Targets that needed a scroll: the attack in the stat block, the sort in the filters
sheet (1,082px of 1,172px), "Crear borrador" (1,495px of 1,614px), "Revisar reparto" once two
items are listed, and "Añadir desde el bestiario" on the encounter page (1,001px).

The paths for b in words. From the general bestiary the stat block has "Añadir a un encuentro"
(737px); it opens a dialog with the encounter (the live one or the first open one is chosen), the
count, average or rolled hit points and folded table options, and a result screen that asks
whether to open the encounter or stay. A new encounter can be named there only when none is open;
with one open, a new one has to be created in Combat first. From Combat, "Añadir desde el
bestiario" opens the same panel with the encounter in the address: the page head names the fight,
New creature and the packs link are gone, each row has Compare in place of the bookmark, and the
stat block bar has a count stepper and "Añadir", which adds without a dialog. Going back takes two
more taps (close the sheet, "Volver al encuentro").

Sizes of what opens (phone): add dialog, full screen, 10 controls; filters sheet, 776px of 844,
32 controls, 1,172px of content; quick creature, 19 controls in one screen; creature editor, 96
controls and 4,980px; give drawer, 11 controls; loot drawer, 18 controls with two items; item
forge, 62 controls and 2,390px (44 of them icons); proposal accepted through the forge, 65 controls
and 2,061px; item editor from a row, 63 controls and 2,268px.

Keyboard. Tab order follows the screen at the three sizes. "/" focuses the creature search from
the bestiary; ArrowDown enters the list and moves row by row, End reaches the last creature, Enter
opens.
In the storeroom "/" goes to the panel search of the page head, not to the item search. Escape
closed each of the ten overlays opened in the tasks and focus returned to its opener: stat block
sheet (the row), add dialog (the stat block's button, the sheet stays), filters (Filtros), new
creature (Nueva criatura), give drawer (the row's menu), loot (Repartir botín), proposals
(Propuestas de jugadores), manage catalogue, item editor (the row) and forge (Nuevo objeto). The
search text is still there after closing the stat block and the give drawer.

## Findings

1. High. Bestiary: on arrival the phone shows one creature and the laptop two. The list starts at
   595px of the 779px above the bottom navigation, after New creature across the full width, the
   packs link, the search, the source segments, the count, the jump strip and the letter rule.
   Rows are 84 to 147px (name, the English name, a meta line that wraps in two) where the design
   system says 60px. Once scrolled, the sticky search leaves 698px and five rows. On the laptop the
   list is 349px wide beside a 553px pane and begins at 542px of 800. `phone-bestiary-arrival.png`,
   `phone-bestiary-scrolled.png`, `laptop-bestiary-arrival.png`.
2. High. Storeroom: giving one item is seven taps and a search. The row itself, the largest target,
   opens the editor (63 controls); giving is the second entry of the row menu. Then a recipient,
   "Revisar reparto", "Confirmar entrega" and "Cerrar": one potion for one character goes through
   the same review and result screens as a whole loot, and the three buttons sit at 560, 383 and
   323px, so the thumb moves each time. `phone-store-row-menu.png`, `phone-store-give.png`,
   `phone-store-give-review.png`, `phone-store-give-done.png`.
3. High. Bestiary stat block on the phone: an attack is a screen away. The picture fills the first
   340px, armor class and hit points are at 596px, and "Acciones" starts at 1,260px of a 1,739px
   sheet. The action bar is two rows (117px) and the sheet header 56px, which leaves 601px to read;
   in a fight's context the bar is about 150px (count, add, compare). On the tablet and the laptop
   the actions are in view on opening (559px and 640px). `phone-bestiary-statblock.png`,
   `phone-bestiary-statblock-attack.png`, `phone-bestiary-encounter-context.png`,
   `tablet-bestiary-statblock.png`, `laptop-bestiary-statblock.png`.
4. Medium. Bestiary search: "goblin" and Enter opens the hobgoblin captain. Names that contain the
   word anywhere rank together and then by alphabet, so "Capitán hobgoblin" is first and "Guerrero
   goblin" (Goblin Warrior) second; a match at the start of a word or of the English name does not
   count. `phone-bestiary-search-goblin.png`, `phone-bestiary-enter-best-match.png`.
5. Medium. Bestiary: adding one creature with the defaults from the general bestiary passes a
   full-screen dialog (10 controls) and a result screen with two more buttons: four taps and the
   search, five to be reading again. The same action in the fight's context is one tap in the bar.
   With an encounter open there is no way to start another one from here.
   `phone-bestiary-add-dialog.png`, `phone-bestiary-add-done.png`.
6. Medium. Loot: two items for three characters are eleven taps and a scroll. Items are added from
   a text list of 34px options, not in alphabetical order, six and a half visible; each chosen
   item adds a 261px card (picture, remove, quantity, recipients), so "Revisar reparto" leaves the
   screen at the second item (822px), and it is not sticky. `phone-store-loot-list.png`,
   `phone-store-loot-two-items.png`.
7. Medium. Storeroom on the phone: 363px of controls before the list (New item, search, Distribute
   loot, proposals, Manage catalogue, Order and view, categories); two rows fit. The category rail
   holds 1,197px of chips in 343px, two and a half of eight visible. The proposals link box (333 to
   377px) overlaps the loot button (293 to 337px) by 4px. `phone-store-arrival.png`,
   `phone-store-full.png`.
8. Medium. Storeroom with a long catalogue: every row is mounted (129 items: 2,789 nodes, 274
   controls, a 10,560px page), the search and "Repartir botín" scroll away with nothing sticky,
   there is no grouping or jump, and "/" does not reach the item search.
   `phone-store-129-middle.png`.
9. Medium. Filters: one type costs three taps and the sheet covers the list (776px of 844, 32
   controls). Its content is 1,172px, with size and sort below the fold (sort at 1,082px). Applied
   filters stack as chips above the list: one moves the first row from 595 to 649px, three take two
   rows (92px).
   `phone-bestiary-filters.png`, `phone-bestiary-filters-applied.png`.
10. Medium. Proposals: accepting what the DM has just read opens the whole forge (65 controls,
    2,061px) before "Crear y dar a Arin". After accepting or rejecting, the confirmation notice is
    painted on the page under the drawer; the drawer needs one more tap to close.
    `phone-store-proposal.png`, `phone-store-proposal-accept.png`.
11. Low. Laptop storeroom: rows stretch to 936px, so the source tag, the price and the menu are
    about 700px from the name. `laptop-store-arrival.png`.
12. Low. Escape closes the quick creature dialog and the item forge with a typed name without
    asking; the full creature editor asks. `phone-bestiary-new-quick.png`, `phone-store-forge.png`.
13. Low. Options of the selects (loot item list, storeroom sort) are 34px tall, under the 44px
    target the rest of both screens keeps.
14. Low. Keyboard: each creature row is three tab stops (picture, row, bookmark), 990 for the list;
    the arrows are the practical way. On tablet and laptop 25 or 26 stops come before the search,
    because the skip link lands on a main area that begins with the nine links of the panel
    navigation.
15. Low. The new creature start asks to choose among four ways before any field
    (`phone-bestiary-new-start.png`); the archetype step ends in "Crear borrador" at 1,495px, not
    sticky. In the fight's context the sheet scrolls by itself after adding, to show the status
    line. On the tablet the stat block is a full-screen sheet with about 200px empty under its bar,
    so the list and a creature are never seen together at 820px.

Already right: no horizontal overflow, no control under 44px and no axe violation on arrival at
any size. The creature search finds both languages, stays sticky on phone and tablet and keeps its
text after every overlay. The creature list is windowed and returns to the same row. Every overlay
closes with Escape and gives focus back to its opener. One filled action per screen (none in the
bestiary list, "Repartir botín" in the storeroom, one per dialog). In a fight's context a creature
is added in one tap with a count stepper and a status line. The add dialog picks the live encounter
and names it on its button. The loot review lists what each character receives before anything is
sent. A quick creature (three taps) and a new item (two taps) need only a name, and their save
buttons stay in view.

## Not measured

Parchment theme, English, 150% text, real phones (the on-screen keyboard over the sheets and
drawers), screen readers, hosted data and a production build (timings come from a development
server). Several creature packs (the source becomes a select), campaign creatures, favourites and
the comparison tray; the storeroom grid view, shop, merge, import and delete actions; error and
retry states. Focus after rejecting a proposal was read on the page body in two task passes and on
the "0 por revisar" heading in seven sampled passes; the difference was not explained. The 129 item
storeroom is synthetic.
