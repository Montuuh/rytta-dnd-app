# ADR 018: One DM Command Center with the item storeroom, and a Party redesign

Status: accepted for `RYT-027`. Replaces the standalone `/items` page from ADR 017 and the
revelations queue tab from ADR 012/015 inside the DM Command Center. The remaining revelations data,
RPCs and campaign home list were removed by [ADR 019](019-remove-revelations-and-camp.md).

## Context

The user asked for these changes:

- Rename the campaign item page to an "item catalogue" or "storeroom".
- Unify the DM panels.
- Improve the item manager, which used large cards with three plain buttons each and did not
  scale.
- Allow creating an item for a specific character.
- Put the DM Command Center first in the navigation.
- Remove the unused revelations queue.
- Let the DM edit an item directly from a shop listing.
- Improve Party for both roles. On laptops the Player Party was narrower than the DM's: the
  layout used 1360px only for DMs and 1280px for everyone else.

## Decision

- **Navigation.** The DM Command Center is the DM's first destination. It now holds four tabs:
  Members, Active modules, Item storeroom and Audit. The active tab lives in `?panel=` so links
  and reloads keep it. `/items` redirects to `members?panel=items`. The page
  (`src/pages/dm-center-page.tsx`) composes the storeroom into `CampaignMembers` through an
  `itemsPanel` slot, so the campaigns feature does not import inventory or shops. "Leave
  campaign" only appears on the Members tab.
- **Revelations.** The revelations queue tab and its create dialog are removed from the
  Command Center. The data and RPCs stay untouched. The campaign home still lists existing
  revelations.
- **Item storeroom (`src/pages/item-store.tsx`).** Renamed "Almacén de objetos" / "Item
  storeroom". It has:
  - A toolbar with search (and a clear button), sort (name, category, rarity, value) and a
    list/grid view switch whose choice is remembered per device.
  - Category chips with counts.
  - List view: 64px rows with a rarity-tinted icon, name, meta line (category · rarity ·
    weight), origin and value. Give and Add to shop are icon buttons; on phones they fold into
    one ⋯ menu.
  - Grid view: compact 112–136px tiles, each with a ⋯ menu.
  - Give opens a drawer with roster chips for several characters at once and an amount stepper
    with +5/+10. Each character keeps its own idempotency key, so a retry after a partial
    failure never doubles a grant.
- **New item for a character.** `DefinitionEditor` accepts `allowGive` and `initialGive`. The
  forge shows "Give to" roster chips for new items. After the definition and its image are
  saved, one `grant_item` call runs per character, each with a stable request id. The partial
  outcome is reported by name. Party's card menu adds "New item for <name>", which opens the
  storeroom with `?create=<characterId>` preselected, and "Satchel".
- **Shops.** An expanded stock row offers "Edit item", which opens the same `DefinitionEditor`
  with the full catalogue definition. Changes apply everywhere and invalidate the campaign's
  private queries.
- **Satchel.** Adds the same list/grid switch, with compact list rows that show quantity and
  carried weight. Tiles are slightly smaller.
- **Party.**
  - All campaign routes share one width (`campaign-layout`, 1360px).
  - Each card has a header with a portrait medallion, name, class and level, and for DMs an
    inline owner chip. The separate owner bar is gone.
  - Vitals show as HP and AC chips with a toned bar, plus "Open sheet" and, for Players,
    "Satchel".
  - Resource tiles are compact (icon | label over value | steppers). Players' read-only
    exhaustion is a quiet meter instead of button-like boxes.
  - A single card fills the row, and a container query splits it into vitals and resources
    columns. The Player's own card is styled as a hero card.

## Consequences

- E2E selectors move to `.store-row`, `Editar: <name>`, roster chip buttons and the amount
  stepper. The revelation steps in the Command Center tests are replaced by storeroom tab, deep
  link and reload checks.
- Creating an item for characters is two transactions: the definition, then one grant per
  character. Each step is idempotent, and a grant failure leaves the definition in the
  storeroom with a visible notice.
- Not verified on real iOS Safari or Android, or against hosted Supabase.
