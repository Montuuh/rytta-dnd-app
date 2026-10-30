# ADR 012: DM Command Center, active module visibility and quick revelations queue

## Status

Accepted for `RYT-023`.

## Context

In-person homebrew D&D sessions have asymmetric device and information requirements:

- The **Dungeon Master (DM)** typically works from a laptop (`1280px+`) or tablet and needs a centralized control room to manage campaign members, toggle which modules are unlocked for the party, queue discoveries (`dm_only` drafts vs `party` public entries), and audit recent character/resource events—plus a contextual 1-click switch on every panel to inspect or edit in DM Manager mode vs Player View mode.
- **Players** typically use mobile phones (`390px`) and should only see Basecamp, the modules their DM has explicitly activated (`campaign.player_modules`), and revelations marked `visibility = 'party'`.

## Decision

1. **DM Command Center (`/campaign/:id/members`) & Wrapping Pill Navigation**:
   - Accessible and visible only to campaign DMs in Manager mode.
   - Its navigation pill is labeled `Centro de mando DM` / `DM Command Center` and placed **second** in the main navigation bar (right after `Campamento` / `Camp`, before `Grupo` / `Party`).
   - `.nav-tabs` uses wrapping rounded pill buttons (`flex-wrap: wrap`, `border-radius: 999px`) that stack onto rows below when they do not fit on one line, avoiding horizontal scrolling.
   - Basecamp (`CampaignPage`) does not render a redundant redirect button to the DM Command Center.
   - Integrates four panels with quick filter tabs (`All panels`, `Members`, `Active modules`, `Revelations queue`, `Audit`) and a responsive 2-column laptop grid (`.dm-command-grid` at `>= 62em`) that stacks cleanly into a single column on mobile/tablet:
     - **Members & invitations**: Google email invitations, role handover (`dm`/`player`), and member removal.
     - **Active module controls**: Toggles which modules (`party`, `inventory`, `shops`, `quests`, `combat`, `atlas`, `glossary`, `memories`, `stronghold`, `workshop`) are visible to Players in their top navbar and Basecamp via `public.set_campaign_modules`.
     - **Quick revelations queue**: Creates and toggles campaign discoveries (`shop`, `quest`, `atlas`, `glossary`, `npc`) between `dm_only` draft and `party` public visibility via `public.create_campaign_revelation` and `public.set_revelation_visibility`.
     - **Audit log**: Displays recent `public.character_events`.
2. **Party Character Card Ergonomics (`CharacterParty`)**:
   - **Unified Player Ownership Bar (`.character-owner-bar`)**: Groups the ownership badge (`Sin jugador` / `Asignado a un jugador`), the assigned player label (`Jugador: X`), and the link/unlink action button (`Vincular jugador` / `Desvincular jugador`) inside one dedicated container directly below the character name.
   - **Inline Quick Resource Steppers**: Each resource tile (`Oro`, `Raciones de agua`, `Raciones de comida`, `Agotamiento`) includes inline `44×44px` `-` / `+` buttons for the DM to adjust resources in 1 tap directly from the Party card, while retaining `Editar recursos` for manual bulk numeric input.
3. **Single Authoritative Topbar `Vista Player` Switcher & Responsive Content Scaling**:
   - Player POV preview is controlled exclusively via the topbar `Vista Player` menu (where the DM selects which Player's POV to inspect or returns via `Volver a DM`), avoiding redundant per-panel mode banners.
   - Container/card paddings, stack gaps, and typography scale down on tablet (`<= 62em`) and mobile (`<= 48em`) so more information fits comfortably on mobile screens while preserving `>= 44px` interactive touch targets.
4. **Player Visibility Filtering & Database Authority**:
   - Players (and DMs in `playerPreview` mode) only see `Basecamp` and modules listed in `campaign.player_modules` in the Row 2 navbar (`Navigation`) and `CampaignPage`.
   - PostgreSQL RLS on `public.campaign_revelations` enforces that non-DM campaign members can only read rows where `visibility = 'party'`, and only DMs can invoke `set_campaign_modules`, `create_campaign_revelation`, and `set_revelation_visibility`. Campaigns with active module lists are queried via the additive `list_my_campaigns_with_modules` RPC.

## Consequences

- DMs get a dedicated laptop-ready command center and contextual mode switching without leaking private drafts or unactivated modules to Players.
- Both SQL actor-matrix tests (`tests/database/characters.test.ts`) and Playwright E2E tests (`tests/e2e/identity.spec.ts`) verify the visibility boundaries and responsive layouts.
