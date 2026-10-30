# RYT-023 Validation Evidence

## Summary

Delivered the DM Command Center, per-campaign active module visibility (`player_modules`), quick revelations queue (`campaign_revelations`), enriched campaign audit log (`character_events`), inline party resource steppers, unified character player-assignment bar, and responsive mobile/tablet content scaling:

1. **DM Command Center (`/campaign/:id/members` / `CampaignMembers`)**:
   - Accessible and visible only to campaign DMs in Manager mode, placed 2nd in the wrapping pill navigation bar right after `Campamento`.
   - Integrates four management panels with quick filter tabs (`All panels`, `Members`, `Active modules`, `Revelations queue`, `Audit log`) and a responsive 2-column laptop grid (`.dm-command-grid` at `>= 62em`) that stacks into a single column on mobile/tablet:
     - **Members & invitations**: Google email invitations, role handover (`dm`/`player`), and member removal.
     - **Active module controls**: Toggles which modules (`party`, `inventory`, `shops`, `quests`, `combat`, `atlas`, `glossary`, `memories`, `stronghold`, `workshop`) are visible to Players in their top navbar and Basecamp via `public.set_campaign_modules`.
     - **Quick revelations queue**: Creates and toggles campaign discoveries (`shop`, `quest`, `atlas`, `glossary`, `npc`) between `dm_only` draft and `party` public visibility via `public.create_campaign_revelation` and `public.set_revelation_visibility`.
     - **Enriched audit log**: Displays chronological `public.character_events` with category filter buttons (`All`, `Characters`, `Resources`), character name attribution, actor attribution (`By Table DM`), assignment status changes (`Linked to: ...` / `Player unlinked`), and before/after resource diff badges (`Gold: 15 → 25 (+10)`, `Food rations: 2 → 4 (+2)`).
2. **Single Authoritative Topbar `Vista Player` Control**:
   - Removed the redundant per-panel `DmPanelBanner` so Player POV switching is controlled exclusively from the topbar `Vista Player` menu (allowing the DM to select a specific player to preview or return via `Volver a DM`).
3. **Inline Party Resource Steppers & Unified Player Assignment Bar**:
   - DMs can adjust `gold`, `water_units`, `rations`, and `exhaustion` directly on `Party` character cards via `44px` `-` / `+` buttons without opening a modal, and manage player linking inside a unified `.character-owner-bar`.
4. **Responsive Content Scaling on Smaller Viewports**:
   - Scaled down container/card paddings, stack gaps, and typography on tablet (`<= 62em`) and mobile (`<= 48em`) so more content fits on phone/tablet screens while preserving `>= 44px` interactive touch targets and zero overflow at 150% text scale.
5. **Player Visibility Filtering & Database Authority**:
   - Players and DMs in `playerPreview` mode only see `Basecamp` and modules listed in `campaign.player_modules` in the Row 2 navbar (`Navigation`) and `CampaignPage`.
   - PostgreSQL RLS on `public.campaign_revelations` enforces that non-DM campaign members only read rows where `visibility = 'party'`, and only DMs can execute `set_campaign_modules`, `create_campaign_revelation`, and `set_revelation_visibility`.

## Verification Commands & Results

- `npm run check`: **PASS**
  - `typecheck` (`tsc -b --pretty false`): 0 errors
  - `lint` (`oxlint --deny-warnings`): 0 warnings, 0 errors across 98 files
  - `check:architecture`: passed
  - `check:docs`: passed (24 tickets)
  - `check:ai`: passed
  - `vitest run`: 10 test files passed (56 tests, including PGlite SQL actor-matrix denial tests for `anon`, `outsider`, `player`, `dm`, and cross-campaign `dm` on `set_campaign_modules` and `campaign_revelations`)
  - `vite build`: succeeded
- `npm run test:e2e`: **PASS (132 passed across desktop, tablet, mobile, identity-desktop, identity-tablet, identity-mobile)**
  - Verified DM Command Center module visibility toggles, revelation creation and visibility toggling, enriched audit log filtering and diff badges, and topbar Player POV switching.
  - Verified Player navigation only renders Basecamp and activated `player_modules`, hiding unactivated modules and the DM Command Center tab.
  - Verified `axe` WCAG 2.1 AA compliance and zero horizontal overflow at `100%` and `150%` text zoom across `es`/`en` and `dark`/`light`.
- Hosted Supabase (`ekscdsmniukuxqjixapu`): **PASS**
  - Applied migration `20261030153219_dm_command_center` to `public` and synchronized remapped DDL/RPCs (`campaigns.player_modules`, `campaign_revelations`, `list_my_campaigns_with_modules`, `set_campaign_modules`, `create_campaign_revelation`, `set_revelation_visibility`) to `pre`.
  - Verified `pre_admin.refresh(false, true)` dry-run plan (8 tables) and Supabase Security Advisors (`rls_enabled: true` and `revelations_read` policy active on both `public.campaign_revelations` and `pre.campaign_revelations`).

## Rendered Evidence

- Desktop DM Command Center (`1440x1000`, ES dark): `docs/evidence/RYT-023/dm-command-center-desktop.png`
- Tablet DM Command Center (`820x1180`, ES dark): `docs/evidence/RYT-023/dm-command-center-tablet.png`
- Mobile DM Command Center (`390x844`, ES dark): `docs/evidence/RYT-023/dm-command-center-mobile.png`
- Desktop Player View mode (`1440x1000`, ES dark): `docs/evidence/RYT-023/dm-player-preview-desktop.png`
- Mobile Player View mode (`390x844`, ES dark): `docs/evidence/RYT-023/dm-player-preview-mobile.png`
- Desktop Party Inline Steppers (`1440x1000`, ES dark 150%): `docs/evidence/RYT-023/party-inline-steppers-desktop.png`
- Mobile Party Inline Steppers (`390x844`, ES dark 150%): `docs/evidence/RYT-023/party-inline-steppers-mobile.png`
- Independent UI/UX review: `docs/evidence/RYT-023/reviewer/review.md` (`PASS`, digest `1432c65be710a349c4f6b8b799be479cb2dc1b291950b0b313117d7b4787689a`)
