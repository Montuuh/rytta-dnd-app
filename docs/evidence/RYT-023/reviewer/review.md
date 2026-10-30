# RYT-023 Independent UI/UX Review

- **Ticket:** `RYT-023` — DM Command Center, active module visibility and quick revelations queue (including enriched audit log, responsive content scaling, and topbar-only Player POV switching)
- **Reviewer role:** `ui-ux` (`.codex/agents/ui-ux.toml`)
- **Verdict:** `PASS`
- **Reviewed at:** `2026-10-30T12:23:00Z`
- **Reviewed source digest:** `1432c65be710a349c4f6b8b799be479cb2dc1b291950b0b313117d7b4787689a`

## Summary

The `RYT-023` interface delivery and all user-requested UX/UI refinements satisfy all acceptance criteria, ADR 012 decisions, and design-system requirements across mobile (`390×844`), tablet (`820×1180`) and laptop/desktop (`1440×1000`) viewports, in both Spanish (`es`, default) and English (`en`), across both the warm hearth dark palette (default) and warm parchment light palette, at `100%` and `150%` text scaling, and under reduced motion:

1. **DM-only Command Center & Four Integrated Panels (`/campaign/:id/members`):**
   - Only campaign DMs in Manager mode (`campaign.role === 'dm' && !playerPreview`) see the `Centro de mando DM` / `DM Command Center` navigation pill (with `Shield` icon) and the four DM Command Center panels: **Members & invitations**, **Active module controls**, **Quick revelations queue**, and **Audit log**.
   - Quick panel filter buttons (`Todos los paneles`, `Miembros`, `Módulos activos`, `Cola de revelaciones`, `Auditoría` / `All panels`, `Members`, `Active modules`, `Revelations queue`, `Audit log`) expose `aria-pressed` state and allow focusing a single section or viewing all panels together.
   - Players and DMs in Player View mode do not fire management/revelation-draft/audit queries (`enabled: dm`) and see only the read-only notice (`Tu DM gestiona los miembros y las invitaciones.` / `Your DM manages members and invitations.`).
2. **Wrapping Pill Navigation, Reordered DM Command Center Tab & Topbar-Only Player POV Control (`src/app/layout.tsx`, `src/pages/campaign-page.tsx`, `src/app/styles.css`):**
   - `.nav-tabs` uses `flex-wrap: wrap` with `44px`-minimum rounded pill/medallion buttons (`border-radius: 999px`) that wrap cleanly onto additional rows instead of scrolling horizontally, with distinct visual treatments for active (`var(--app-accent)` fill), inactive DM Command Center (`.nav-item-dm:not(.active)` accent border + raised surface), and disabled planned modules (`.disabled-module` dashed border).
   - The DM tab is labeled `Centro de mando DM` / `DM Command Center` (`campaign.manage`) and positioned second, immediately after `Campamento` / `Camp` and before `Grupo` / `Party`.
   - Basecamp (`src/pages/campaign-page.tsx`) no longer renders a duplicate CTA button redirecting to the DM Command Center, and the redundant per-panel `DmPanelBanner` has been removed from `CampaignPage`, `CharacterParty`, and `CampaignMembers` so Player POV switching is controlled exclusively from the topbar `Vista Player` / `Volver a DM` controls.
3. **Active Module Visibility & Quick Revelations Queue (`src/features/campaigns/ui/members.tsx`):**
   - Each module card in `Control de módulos activos` pairs its icon and title with a semantic status badge (`Eye` + `Visible para jugadores` / `Visible to Players`, or `Lock` + `Oculto para jugadores` / `Hidden from Players`) and a `44px` toggle button (`aria-pressed={active}`).
   - Players and DMs in Player View mode see only `Campamento` / `Camp` plus modules enabled in `campaign.player_modules` in both the top navbar and `CampaignPage` module grid, and only discoveries with `visibility === 'party'`.
4. **Enriched Audit Log (`src/features/campaigns/ui/members.tsx`):**
   - `Registro de auditoría` / `Audit log` provides category filter buttons (`Todos`, `Personajes`, `Recursos` / `All events`, `Characters`, `Resources` with `aria-pressed`) alongside a `44px` `Actualizar` / `Refresh` action.
   - Each `.audit-event-card` renders localized event badges (`RECURSOS ACTUALIZADOS`, `PERSONAJE CREADO`, `ASIGNACIÓN DE PERSONAJE ACTUALIZADA`, `RECURSOS INICIALES CREADOS` / `RESOURCES UPDATED`, `CHARACTER CREATED`, etc. using underscore-normalized keys `dm.auditEvent.*` that avoid `i18next`'s `:` namespace separator), character name attribution (`Arin`), player assignment attribution (`Vinculado a: ...` / `Jugador desvinculado`), visual before/after resource diff badges (`ORO: 15 → 25 (+10)`, `RACIONES DE COMIDA: 2 → 4 (+2)`), and actor attribution (`Por Table DM` / `By Table DM`).
5. **Unified Player Ownership Bar & Inline Quick Resource Steppers in Party (`src/features/characters/ui/party.tsx`):**
   - Each character card renders `.character-owner-bar` right below the character's name, grouping the assignment status badge (`Sin jugador` / `Asignado a un jugador` / `Tu personaje`), the linked player label (`Jugador: X` / `Player: X`), and the DM link/unlink button (`Vincular jugador` / `Desvincular jugador`) inside a cohesive bordered box (highlighted with `border-color: var(--app-accent)` when assigned).
   - Each resource tile (`Oro`, `Raciones de agua`, `Raciones de comida`, `Agotamiento`) includes inline `44×44px` `Minus` and `Plus` `ActionIcon` steppers (`.resource-inline-steppers`) for DMs to adjust resources in 1 tap via `useCharacterAction` with a fresh `requestId` (`crypto.randomUUID()`), character-disambiguated accessible names (`Aumentar Oro · Arin`, `Decrease Gold · Arin`), and `[0, maxVal]` / `isPending` disabling, while retaining `Editar recursos` below for manual bulk input.
6. **Responsive Content Scaling, Contrast & Accessibility (`src/app/styles.css`):**
   - On laptop/desktop (`>= 62em`, `1440×1000`), `.dm-command-grid` renders a balanced 2-column dashboard; on tablet (`<= 62em`, `820×1180`) and mobile (`<= 48em`, `390×844`), container/card paddings, stack gaps, and heading/body font sizes scale down proportionally while preserving `>= 44px` (`2.75rem`) minimum touch targets on buttons, action icons, inputs, selects, and navigation pills, with zero horizontal overflow at both `100%` and `150%` text scaling.
   - Automated axe (`wcag2a`, `wcag2aa`, `wcag21aa`) passes with zero violations across all tested viewports, themes, and languages.

## Findings

No blocking (`critical`, `high`, or `medium`) issues remain. The previous `medium` finding regarding `i18next`'s `:` namespace separator splitting `dm.auditEvent.character_resources:UPDATE` and `dm.auditEvent.characters:INSERT` into raw `UPDATE` / `INSERT` badge text was resolved by normalizing `event.kind.replace(':', '_')` (`dm.auditEvent.character_resources_UPDATE`, `dm.auditEvent.characters_INSERT`, etc.) and verified across desktop, tablet, and mobile screenshots (`RECURSOS ACTUALIZADOS`, `PERSONAJE CREADO`). Unused `.dm-panel-banner` CSS and translation keys were also cleaned up.

### Non-blocking observations (`low`)

1. **Summary count badge ellipsis in Spanish at `150%` text on `390px` mobile**
   - **Severity:** `low` (non-blocking polish)
   - **Location:** `src/features/campaigns/ui/members.tsx:390-392`, `src/pages/campaign-page.tsx:39-41`, `src/shared/i18n/identity-es.ts:107`
   - **Viewport / Theme / Language:** `390×844` mobile at `150%` text (`es` dark/light)
   - **Observation:** The summary `Badge` (`1 MÓDULOS ACTIVOS PARA JUGADORES`) in the `Control de módulos activos` header truncates its final letters with an ellipsis (`1 MÓDULOS ACTIVOS PARA JUGADO...`) at `150%` text on a `390px` viewport because Mantine `Badge` defaults to single-line `white-space: nowrap`. At `100%` text on mobile and at `150%` text in English or on tablet/desktop, the badge fits in full, and every module card immediately below explicitly shows its own `VISIBLE PARA JUGADORES` / `OCULTO PARA JUGADORES` state.

## Tested Scenarios & Inspected Evidence

### Code Inspection
- `docs/decisions/012-dm-command-center-and-module-visibility.md` and `docs/backlog/items.json` (`RYT-023`)
- `src/pages/campaign-page.tsx` (Basecamp module filtering and discoveries section; confirmed removal of duplicate DM Command Center button and `DmPanelBanner`)
- `src/app/layout.tsx` (wrapping pill `Navigation` with `Centro de mando DM` / `DM Command Center` placed second after `Campamento` / `Camp`, and topbar `Vista Player` / `Volver a DM` mode controls)
- `src/app/styles.css` (`.nav-tabs` wrapping flex layout, `.nav-item` rounded pill styling, `.nav-item-dm`, `.character-owner-bar`, `.resource-cell-body`, `.resource-inline-steppers`, `.dm-command-grid`, `.audit-event-card`, and `@media (max-width: 62em)` / `@media (max-width: 48em)` responsive scaling rules)
- `src/features/characters/ui/party.tsx` (`.character-owner-bar`, `SimpleGrid cols={{ base: 1, sm: 2 }}`, inline `44×44px` `Minus`/`Plus` quick resource steppers; confirmed removal of `DmPanelBanner`)
- `src/features/campaigns/ui/members.tsx` (enriched `Registro de auditoría` with category filters, `event.kind.replace(':', '_')` localized badges, character & actor attribution, player link/unlink summary, and resource diff badges)
- `src/shared/i18n/{identity-es,identity-en}.ts` (`dm.auditEvent.*` underscore-normalized keys, `dm.auditFilter*`, `dm.auditBy`, `dm.auditLinkedTo`, `dm.auditUnlinked`, `dm.auditNoChanges`)

### Inspected Screenshots
- Delivery evidence in `docs/evidence/RYT-023/`:
  - `dm-command-center-desktop.png` (`1440×1000`, `es` dark — wrapping pill navbar with `Centro de mando DM` second, 2-column DM Command Center without `DmPanelBanner`, enriched `Registro de auditoría` showing `RECURSOS ACTUALIZADOS` / `PERSONAJE CREADO` badges, `Arin`, `ORO: 15 → 25 (+10)`, `RACIONES DE COMIDA: 2 → 4 (+2)`, and `Por Table DM`)
  - `dm-command-center-tablet.png` (`820×1180`, `es` dark — tablet scaling, single-column DM Command Center stack, and localized `RECURSOS ACTUALIZADOS` / `PERSONAJE CREADO` audit cards)
  - `dm-command-center-mobile.png` (`390×844`, `es` dark — compact mobile scaling, `>= 44px` touch targets, and localized `RECURSOS ACTUALIZADOS` / `PERSONAJE CREADO` audit cards)
  - `dm-player-preview-desktop.png` and `dm-player-preview-mobile.png` (topbar-only `Vista Player` / `Volver a DM` banner without per-panel `DmPanelBanner`)
  - `party-inline-steppers-desktop.png` and `party-inline-steppers-mobile.png` (Party view without `DmPanelBanner`, compact mobile scaling, `.character-owner-bar`, and `44×44px` inline resource steppers)
  - `party-es-dark-100-desktop.png`, `party-es-dark-100-mobile.png`, `party-assigned-es-dark-150-desktop.png`, `party-assigned-es-dark-150-mobile.png`, `members-es-dark-150-mobile.png`, `members-en-light-100-desktop.png`

## Limitations
- Browser verification used Playwright Chromium desktop (`1440×1000`), tablet (`820×1180`) and mobile (`390×844`) profiles against deterministic local fixtures; real iOS Safari hardware and live multi-account hosted Supabase sessions remain covered under `RYT-015`.
