# RYT-013 — Realtime and recovery

Date: 2026-11-21. Delivered with RYT-128 (block B); see that evidence for the design choice and
[docs/offline-shell.md](../../offline-shell.md) for the behaviour.

## What changed

- `src/app/use-connection.ts` and `src/app/connection.tsx`: an app-wide connection line under the
  header (offline, reconnecting, "connection back · up to date" for 3 s, "could not update" with
  Retry) and one polite live region that announces each change once. It replaces the in-campaign
  offline alert; combat keeps a quiet "updated N s ago" with its retry.
- When the network returns every query on screen is fetched again; the realtime channels
  re-subscribe and refetch on `SUBSCRIBED` (existing per feature). Foreground refetch is TanStack
  Query's focus refetch (30 s stale time).
- Changing identity clears the cache and removes every realtime channel
  (`src/features/auth/live-auth-provider.tsx`); screens are keyed by user and campaign.
- Mutations keep `networkMode: 'always'`: an action pressed offline fails at once; nothing is
  replayed.

- "Could not update" only when the backend does not answer (`src/shared/api/reachability.ts`, Auth
  health); "Reconnecting" lasts at most 6 s.
- A failed refetch keeps the data already on screen in the campaign list, the invitations and the
  campaign shell (`src/features/campaigns/ui/load-cause.ts`, `src/app/layout.tsx`); screens read
  the connection phase (`src/shared/lib/connection-context.ts`) so they do not repeat the line.
  This replaces the earlier behaviour that hid the cached campaign list after a failed manual
  refresh (`tests/e2e/identity.spec.ts` updated).

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Publish only approved tables and channels; RLS authoritative | `supabase_realtime` publishes `campaign_roll_signals`, `encounter_signals`, `rest_requests`, `tabletop_live`, `trades` in `public` and `pre` (hosted query, 2026-11-21); a real Player received only status and revision from `encounter_signals` and nothing from `encounters` (RYT-119 evidence, real sessions) | Met |
| Invalidate scoped query keys; remove channels on campaign or identity change | Channels are opened per campaign by each feature and closed by their effects; identity change clears the cache and calls `removeAllChannels` | Met (code); no dedicated identity-switch browser test |
| Offline, stale and reconnecting states visible; no automatic economic replay | `tests/e2e/offline-shell.spec.ts` (offline, failed with Retry, recovered) at 390 and 820 px, EN/ES and both themes; existing offline specs (account, identity, glossary) confirm actions fail at once and send nothing | Met |
| Refetch on reconnect and foreground without private-data leakage | "a refresh that fails after reconnecting offers Retry": the screen reloads after reconnecting and Retry; the offline worker stores no backend response (RYT-128) | Met |

## Validation as written in the ticket

- Two-client Supabase Realtime: run on hosted PRE with two real sessions (DM and Player, RYT-119
  "Real sessions", 2026-11-21).
- Network loss: browser tests above. Identity switch: covered by the existing identity specs
  (screens keyed by user) and the new channel removal; no new two-account browser test.

## UI review

Independent UI review: CHANGES_REQUIRED twice (Retry dropped focus; a screen's own error turned the
line red; a failed refresh erased the data on screen; inside a campaign the header and navigation
went with it), all fixed; PASS on 2026-11-21 for the current source (report kept locally under
`docs/evidence/ui-review/ryt-013/`).

## Checks

- `npm run check`: passed.
- `npm run test:e2e`: 1459 passed, 147 skipped, 1 failed: an intermittent touch-target measurement
  in `email-auth.spec.ts` taken during the sheet's opening transition. The spec now waits for the
  transition and passed 84 of 84 repeats. `offline-shell.spec.ts`: 26 of 26 with two repeats at
  390 and 820 px.

## Follow-ups

- RYT-160: a cold reload without signal inside a campaign shows the placeholder without the
  campaign's name and navigation (no campaign data is stored on the device). Owner decision.
- RYT-161: keep data after a failed refetch on the remaining screens, and say only "connection
  back" when the 6 s limit ends the refresh before every screen has loaded.

## Not verified

- Long background periods on a real phone (socket dropped by the OS) on the deployed site.
