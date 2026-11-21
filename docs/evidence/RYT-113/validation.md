# Delivery RYT-113: security hardening for open sign-up

Status: review (2026-11-17). Implementation, checks, independent security reviews and the
hosted migrations are complete, and the hosted actor-level verification ran (RYT-119). Not
Done: hosted Auth settings are owner actions and the new frontend is not released.

## Outcome

Migrations `20261122120000_open_signup_hardening.sql` and
`20261124120000_quota_bytes_invitation_caps_combat_mask.sql` (hosted versions `20261117012750`
and `20261117013004`) were applied to production and mirrored to PRE on 2026-11-17; baseline
row counts were unchanged.

- Players can no longer read encounters directly or through realtime; `encounter_signals`
  carries only status and revision.
- `set_shop_modifier` is scoped to its campaign.
- Quotas live in `private.quota_limits` (14 limits).
- Invitations have rate limits, a decline lockout and a per-recipient cap.
- `combat_result` is masked for non-DM callers.
- The client deletes replaced images only inside the active environment and campaign.

## Acceptance

| Criterion | Result |
| --- | --- |
| Players cannot read hidden combat data directly or by realtime | Met in SQL tests and in hosted PRE actor checks (RYT-119: table policy and signal columns); what a subscribed client receives is not verified |
| `set_shop_modifier` refuses a shop of another campaign | Met in SQL tests and hosted PRE actor checks |
| Caps on campaigns, invitations, scenes and media bytes with translated errors | Met in SQL tests and hosted PRE actor checks for campaigns, scenes, members and invitations; the error strings were not rendered in the UI (no fixture produces them); a real Storage upload over the byte quota was not tried |
| Invitation caps and bounded `list_my_invitations` | Met in SQL tests; caps confirmed on hosted PRE |
| Denial tests for anon, outsider, Player and cross-campaign DM | Met on PGlite and as simulated actors on hosted PRE (RYT-119) |
| PRE and production migration verified; hosted Auth settings listed as owner actions | Met: applied, mirrored and verified by catalog checks; owner actions listed below |

## Verification

`npm run test:db` passed with 250 tests at the time of the migration and 292 or more on the
final tree. Two independent security reviews returned safe to apply. One blocking client finding
(a PRE screen could delete a production image) was fixed with `src/shared/api/storage-paths.ts`
and its tests. Final run on the current tree, 2026-11-17: `npm run check` passed (627 unit and
database tests, build), format check clean, `npm run test:e2e` 680 passed, 59 skipped, 0 failed.

## Not verified on hosted

Realtime delivery filtering, the rejection text of a real Storage upload over a quota and
seat-cap concurrency (still open in RYT-119).

## Owner actions still open

- Hosted Auth settings: email provider and confirm email, leaked-password protection, CAPTCHA.
- Release of the new frontend. Until then Players follow combat by polling.

Both are tracked in the launch checklist RYT-122.

## Hosted checks with real sessions (2026-11-21)

Run with the PRE test accounts (RYT-119 evidence, "Real sessions"):

- Realtime: a subscribed Player receives only status and revision from `encounter_signals` and no
  `encounters` events.
- Translated errors rendered in the UI with PRE limits lowered for the run and restored afterwards:
  - campaign cap (Create campaign): "Ya tienes el número máximo de campañas para una cuenta.
    Abandona una para crear otra."
  - seat cap (Invite player): "Esta campaña no tiene plazas libres: cuentan los miembros y las
    invitaciones pendientes. Cancela una invitación o retira a un miembro antes."
  - scene cap (New scene): "Esta campaña ya tiene todas las escenas que admite. Borra antes una
    escena que ya no uses."
  - byte budget (shop image upload): "El almacenamiento rechazó la subida. Puede que esta campaña
    haya llenado su espacio: …"
- Seat-cap concurrency: 5 and 8 parallel invitations with one free seat each admitted exactly one.

The new frontend is published (rytta.pages.dev) and the hosted Auth settings were handled in
RYT-157 (email provider with confirmation, CAPTCHA). Leaked-password protection needs a paid plan
and stays out of scope (RYT-157 non-goals).

## Status

Done (2026-11-21).
