# RYT-184 audit: downloadable content as the DM sees it

Date: 2026-11-26. Rendered with the e2e fixture backend at 390px and 820px, Hearth and
Parchment, Spanish with an English pass. Rows marked _synthetic_ come from a throwaway mock with
5 packs, 330 entries and 55 changes, because the stock fixture has 2 packs and 3 creatures: they
show how the layout scales, not real data. Severity: high, medium, low.

## Art

1. **High. A pack has no visual identity.** It is a bold title and a grey line in the content
   panel, the creation step and the library list (`content-panel.tsx:324-329`,
   `content-choice.tsx:54-66`). Nothing tells the base pack from a homebrew tome.
2. **Medium. The entries dialog is a list of names.** 330 creature names with an eye and no
   thumbnail, challenge rating or type (`content-panel.tsx:497-523`); the bestiary rows already
   have portraits and a meta line, so the DM hides creatures blind.
3. **Medium. Storeroom rows use line glyphs while the item sheet shows a painting.** The library
   item list uses paintings too.
4. **Low. Category headings are muted serif text with no glyph** (`content.css:14-20`).

## Interface

5. **High. The same long pack title repeats in every category.** "Documento de referencia del
   sistema 5.2.1" wraps to two lines at 390px and appears five times, plus up to three more under
   "Por revisar". `basePackLabel` already shortens it for the bestiary (`pack-origins.ts:59`).
6. **High. The review dialog buries its only action.** "Actualizar a la versión N" comes after the
   whole change list (`content-panel.tsx:608-625`); with 34 changed rows it is several screens
   down at 390px (_synthetic_).
7. **Medium. The review dialog title omits the category** (`content-panel.tsx:562`), although
   updates are per category: three dialogs of one pack look the same.
8. **Medium. Search in the entries dialog scrolls away.** After "Ver más" the field is off
   screen. There is no "only hidden" filter and no way to show everything again
   (`content-panel.tsx:402-437`).
9. **Medium. A pack that is no longer offered is unexplained.** The switch is on, there is no
   chevron and no reason (`content-panel.tsx:343-356`); turning it off cannot be undone and
   nothing says so.
10. **Low. An enabled row is two unlabelled targets** (the switch, and the text with a chevron);
    rows that are off differ only by muted text (`content.css:94`).
11. **Low. The turn-off confirm passes `centered` to a DOM node** and React warns in development
    (`content-panel.tsx:263`).
12. **Low. A light vertical strip shows at the right edge at 820px** in every tablet capture;
    possibly a scrollbar gutter in headless capture. Check on a device.

## Experience and information load

13. **High. The model is a pack by category matrix, flattened.** Five packs make 15 switch rows
    and 3 review rows, about 2,000px at 390px (_synthetic_). A DM thinks "I use the base pack and
    Northern Beasts".
14. **High. One pack update becomes one chore per category.** `pending` is flattened per category
    (`content-panel.tsx:120-122`), each row reading "Versión 2 → 3".
15. **High. The review list says what changed only by name.** The two rows that matter ("tienes
    tu versión") sit among 32 that do not (`content-panel.tsx:660-670`).
16. **High. Item import defaults to everything.** Source "Todos los paquetes" with "Todo lo que
    falta" ticked gives "Importar 198 objetos" for a storeroom of 9 (`basic-import.tsx:47,79-82`).
    This is the most direct cause of the complaint.
17. **High. One switch, two behaviours.** Turning creatures on puts 330 in the bestiary at once.
    Turning items on shows nothing until the import in Almacén, behind a menu (seen in the
    interface; the code path was not traced). The panel neither says so nor links there.
18. **Medium. The bestiary opens on all 330 pack creatures from A to Z.** Favourites is not the
    landing view even when it has creatures, and there is no "used in this campaign" view.
19. **Medium. The glossary lands on "Todo 842"**, mixing rules, spells and class features, with
    no pack filter and an empty "Homebrew 0" tab.
20. **Medium. The meta line shows the wrong numbers.** "Versión 2 · 330 registros · 12 ocultos"
    (`campaign-content-es.ts:23-28`): the version is plumbing and "registros" is database language.
21. **Medium. "Personajes" names the classes category** (`campaign-content-es.ts:16`), while the
    glossary calls the same data "Rasgos de clase". It reads as player characters.
22. **Medium. Creating a campaign asks five questions with one sensible answer**: five ticked
    checkboxes of the same pack plus one; at 390px the create button is below the fold.
23. **Low. List rows carry no pack mark.** The stat block and the glossary article compute an
    origin (`bestiary-detail.tsx:290`, `entry-article.tsx:241`); with several packs nothing in a
    list tells them apart.
24. **Low. The library manager lists item slugs under names and has no cover field** (needed for
    finding 1).

## Not rendered

Loading, error and stale states of the panel and its dialogs; the creation step's error and
empty states and a private pack in it; a bestiary with two or more creature packs or none; pack
pictures on creatures or items; 150% text; the library entry editor. Light-theme contrast was
judged by eye, without axe.

## Libraries and widgets considered

- **shadcn kit** (ADR 059), on Base UI: `Item` for pack and entry rows, `Empty`, `Skeleton`,
  `Drawer` (Base UI, follows the finger) for pack detail on phones, `Collapsible` for change
  groups, `Toggle Group` for category filters, `Input Group` for a search with clear and count.
  Controls arrive at 32-36px and are raised to 44px.
- **TanStack Virtual** for lists of thousands of entries; shadcn documents no virtualisation and
  `Command` (cmdk) renders everything it filters, so it needs `shouldFilter={false}` and paged
  results if used.
- **Not adopted**: vaul and sonner (inject style elements at import), the stock Chart, Sidebar
  (overlaps the application shell), Hover Card and Tooltip (hover on touch), Carousel (hides
  content), animated marketing registries (Magic UI, Aceternity), a third primitive layer (Ark
  UI), motion (CSS and `tw-animate-css` cover it).
- **Sources of patterns to adapt**: coss ui, ReUI (filters), Dice UI (sortable, tags).

## Patterns from comparable products

Search first and list second; installed, available and updates as separate scopes; recommended
defaults; a switch per source before a switch per entry; a "what you get" summary on the row;
detail in a sheet; one update digest with the entries that affect the campaign first; say what
disappears when a pack is turned off; undo instead of confirmation for reversible actions; a
"hidden" filter that restores in one tap. Seen in D&D Beyond source toggles, Foundry VTT modules,
Roll20 compendium sharing, Obsidian community plugins and the VS Code extensions view (from
product knowledge, not re-verified against the live products on this date).

## First five changes

1. Regroup the panel by pack: cover, short name, one summary line and one switch, with the
   categories behind "Personalizar" and unused packs folded.
2. One update row per pack with what it means for the campaign and a fixed "Actualizar".
3. Item import starts empty or from a small starter set, with search and add, linked from the
   pack's items.
4. Creating a campaign shows one summary line with "Cambiar".
5. Packs get a cover and a short name, carried into the entries browser (thumbnails, kind,
   fixed search, "solo ocultos") and onto bestiary, storeroom and glossary rows as an origin mark.
