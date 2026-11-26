# ADR 060: campaign content is read by pack

Date: 2026-11-26. Status: accepted for `RYT-184`. Changes the content panel of
[ADR 051](051-campaign-content-packs.md) (its addendum has the server side), the creation step
of RYT-167, the storeroom import of [ADR 058](058-bestiary-and-storeroom-at-the-table.md) and
the landing views of the bestiary and the glossary. First screens built with the kit of
[ADR 059](059-shadcn-kit-beside-mantine.md).

## Context

The [audit](../evidence/RYT-184/audit.md) of 26 November 2026 found 24 problems in how a DM sees
downloadable content: five packs were fifteen switches and three review chores, the update
button sat under the whole change list, importing items offered 198 at once, packs had no
picture, and the bestiary and the glossary opened on everything. The owner answered the options
page the same day with option A in each of its eight questions.

## Decision

1. **A pack is one card.** Cover, a short name (one rule for every screen: `shortPackName`),
   one line of what it brings in plain words, and one switch for the whole pack. Categories and
   hidden entries are behind "Personalizar". Packs not in use are folded. No version numbers.
2. **The whole pack switches at once.** On enables every category the pack has; off disables
   them. The base pack asks first, because the campaign loses its creatures, spells, classes and
   rules. A pack that is no longer offered can only be turned off, and says so.
3. **One update notice per pack.** It counts what is new, changed and withdrawn and says how many
   touch creatures the campaign edited. "Actualizar" moves every category in use. The review
   leads with what affects the campaign and what updating does to it (the campaign's versions
   are kept), and counts the rest.
4. **Entries are browsed in a sheet** that follows the finger (the kit's Drawer: from the bottom
   on phones, from the right on tablets), with a picture, the name and a kind line per row, one
   switch per entry, a search that stays in view and the views "Todas" and "Ocultas".
5. **Nothing reaches the storeroom in bulk by default.** The storeroom search also finds the
   items of the packs in use and adds them one at a time; the import dialog opens with nothing
   ticked.
6. **Creating a campaign is one step** with one content line and "Cambiar".
7. **A pack's cover is a reserved entry** of kind `pack` and key `cover`: drafted, versioned and
   published with the pack like any entry, with no schema change. Without one, the pack shows a
   picture of its content, and without that its initial. Covers are painted through the image
   queue.
8. **Lists open on what the campaign uses.** The bestiary opens on "De la campaña" (favourites,
   own and edited creatures, creatures used in encounters) when it has any; the glossary opens
   on its search, with recent entries, and hides empty tabs. Rows carry the pack's short name
   when more than one pack is in use, after the type, and it is the part that truncates.

## Consequences

- Turning a pack off and on again enables every category: a previous subset is not remembered.
- Favourites live on the device, so the bestiary's landing view can differ between a phone and a
  tablet.
- A version that changes only a cover reaches every campaign without a review.
- The per-category functions stay for "Personalizar"; the per-category review dialog is gone.
- The kit's sheet and Mantine's modals are separate overlays: a sheet is never opened from a
  modal, nor a modal from a sheet, except the base-pack confirmation, which opens from the panel.

## Alternatives

Kept from the options page: a shelf of covers (more visual, two taps to enable, needs a painted
cover for every pack), the per-category panel compacted (still fifteen switches), one digest
for every pack's updates (an extra step with one pack), search-only entry browsing (cannot
review a whole pack), a starter set of items (a second way to add in bulk).
