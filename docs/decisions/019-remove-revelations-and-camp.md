# ADR 019: Remove campaign revelations and the Camp module

Status: accepted for `RYT-029`. Supersedes the revelations parts of ADR 012 and ADR 018 and the
Camp ("Campamento") home described in ADR 008 and ADR 012.

## Context

The user reviewed the product and asked to drop two things that no longer earn their place:

- Campaign discoveries ("revelations"). The DM queue tab was already removed in ADR 018 (`RYT-027`);
  only the read-only list on the campaign home, the table and the RPCs remained.
- The Camp module. It was a summary page with a module grid and a "Coming soon" fold. Players
  only ever had Party to open, and the DM already works from the DM Command Center.

## Decision

- **Database.** Migration `20261103120000_drop_campaign_revelations.sql` drops the
  `revelations_read` policy, `create_campaign_revelation`, `set_revelation_visibility` and
  `campaign_revelations`. No other object depended on them. PRE is a copy of public made by
  `pre_admin.refresh`, so the migration also removes the PRE mirror when it exists (guarded
  `pre.*` block); a later `pre:sync --replace-pre` copies the already clean public schema.
  Dropping the table deletes existing revelation rows. They were never shown to anyone after
  ADR 018 except in the Camp list.
- **Web.** The revelations query, mutations, schemas, repository methods, i18n keys, styles,
  generated types and e2e mocks are removed.
- **Navigation.** `modules.ts` no longer has a `/` entry. The campaign index
  (`src/pages/campaign-landing.tsx`) redirects: DM to the DM Command Center, Players (and a DM
  previewing the Player view) to Party. The hub link `/campaign/:id` keeps working. Demo mode
  redirects `/` to `/party`.
- **Where Camp content went.** The storeroom card lives in the DM Command Center tab. The module
  visibility controls and planned-module list already live in its "Active modules" tab. The
  campaign description stays on the hub card.
- **Removed UI.** `campaign-page.tsx`, `camp-page.tsx`, `module-card.tsx` and their styles.
  `common.back` now reads "Back" because a placeholder module's back link goes to the landing.

## Consequences

- Players with only Party enabled see a single navigation tab. That is deliberate until more
  modules ship.
- Planned modules are no longer advertised to Players. The DM still sees them under Active
  modules.
- Restoring revelations later needs a new migration and ticket; the old rows are gone.
