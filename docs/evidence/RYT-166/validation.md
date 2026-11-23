# RYT-166 and RYT-163: items come from packs, and private packs reach chosen campaigns

Date: 2026-11-23 (block J). The owner chose the recommended options on the block J options page.
The decision record is [ADR 051](../../decisions/051-campaign-content-packs.md), section "Items and
private packs".

## What changed

- **Migration** `supabase/migrations/20261221120000_pack_items_private_packs.sql`:
  - `get_campaign_item_packs` and `get_campaign_item_pack` return the campaign's item packs at their
    pinned versions, for its DM. Each read is capped at 8 MB.
  - `content_pack_offers`, `get_content_pack_offers` and `set_content_pack_offer` handle private
    packs. The pack's owner adds the campaigns they run as DM; a super admin can add any campaign.
  - Every campaign content reader now checks the campaign as well as the pack (12 functions are
    rewritten in place), and the one-argument check is dropped.
  - Publishing a version advances the categories it does not change.
  - The first items of the SRD and of the Rytta basics pack reach every campaign. Rytta basics
    counts only when the SRD's owner or a super admin owns it.
  - Deleting an account clears it from the offers.
- **Storeroom and shops**:
  - The import lists the items of every enabled pack, without the hidden ones, with a source filter.
  - Without packs, it sends the DM to Content.
  - "Update" lists the storeroom items that differ from their pack, with what differs, and changes
    only the ticked ones.
  - Shop presets stock from the same items.
  - Items already in campaigns keep their data. The SRD and the Rytta basics keep the old
    catalogue keys, so existing items stay linked.
- **Library**:
  - "Subir los objetos del SRD" adds the 197 SRD items to the existing SRD pack, and only them.
  - "Subir Rytta · Objetos básicos" creates the public pack with the 3 Rytta items.
  - Items have their own form: category, where it is worn, weight, price, weapon and armour values.
  - Private packs have a "Campañas" dialog.
- **Content**: the Items category is offered.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| RYT-166: the basic items import offers the same items as before, from the pack | `pack-items.test.ts` (unit): every bundled item converts to a pack entry and reads back to the same import payload in both languages. `campaign-items.spec.ts`: import from the packs | Met in tests. In production after the owner uploads and publishes (below) |
| RYT-166: items already in campaigns, inventories and shops are unchanged by the migration | The migration does not touch item tables. SRD and Rytta entries keep the old keys in `basic_key` | Met |
| RYT-166: economy writes keep their transactional RPCs and idempotency | The import still uses `import_basic_items` with request ids; no new write paths | Met |
| RYT-163: a private pack never appears to a campaign it is not offered to | `tests/database/pack-items.test.ts`: Content list, entries, set and item readers refuse it, and other campaigns never see it | Met |
| RYT-163: denial tests | anon, outsider, Player, other-campaign DM, an editor who does not own the pack, the DM of a campaign not offered | Met |
| UI: 390px and 820px, both themes and languages, keyboard and Escape, axe | `tests/e2e/pack-items.spec.ts`, `library.spec.ts`, `campaign-items.spec.ts` | Met; UI review below |

## Hosted rollout (2026-11-23)

The same LF file was applied in each environment: 18114 characters, md5
`8e07beaf8fc643915b842a8e138f87da`.

- **Staging and production (with PRE):**
  - The stored statement matches the file.
  - 12 readers in `public`, and 12 in `pre` in production, pass their campaign; none uses the
    one-argument check, which is gone.
  - anon cannot run the new RPCs, and `authenticated` cannot run the helpers.
- **Smoke test** (rolled back), as a real DM of an existing campaign:
  - 0 item packs, because the SRD has no items until the owner publishes them;
  - 1 pack in Content and 3 rule packs;
  - an outsider is refused in `public` and in `pre`.
- **Advisors:** no new kind of warning.

### Owner step pending

Production has no items in any pack yet. Until the owner does the following, the storeroom import
of the new app shows "La campaña no tiene paquetes de objetos activos":

1. Library: "Subir los objetos del SRD", then publish version 2.
2. "Subir Rytta · Objetos básicos", then publish version 1.

Publishing enables the items in every campaign. The production app keeps the bundled catalogue
until `next` is released, so publishing first avoids a gap. The account that uploads the Rytta
basics must be the SRD's owner or a super admin.

## Checks

- `npm run check`: 1213 tests pass, then the build.
- `npm run test:db`: 548 tests pass.
- `npm run test:e2e`, full suite: 1536 passed, 2 failed, 163 skipped.
  - The 2 failures (`identity.spec.ts:31` on desktop, `shops.spec.ts:646` on mobile) ran while
    database tests were loading the machine; both pass when run alone.
  - The new spec `pack-items.spec.ts` was added after that run and passes on its own: 10 passed.

## Security review

No High findings.

- **M1, a default pack chosen by its slug alone:** fixed. The Rytta basics must belong to the SRD's
  owner or a super admin. Editors remain a trusted role that can edit any pack, as documented.
- **M2, `added_by` survived account deletion:** fixed with a test.
- **Low findings fixed:** the one-argument check is dropped (L1); old offers can be removed in any
  visibility (L2); a missing campaign is refused like a campaign the owner does not run (L3); the
  offers read no longer locks the pack (L6).
- **Documented:** super admin offers are not in the admin audit log (L5), and a private pack's
  rules reach that campaign's Players (L8).

## Not tested

- The browser against hosted Supabase, and uploading and publishing the items in production.
- WebKit/iOS and screen readers.

## UI review

An independent UI review passed on fingerprint `42cb9087…` with one medium finding: focus was lost
when adding or removing a campaign failed. That and four copy findings were fixed, and a focused
re-review passed on `b9162130…`. Open minor notes: the update list has no "untick all", the pressed
button shows no spinner while a campaign is added or removed, and at 150% text the Campaigns title
sits close to the close button.

