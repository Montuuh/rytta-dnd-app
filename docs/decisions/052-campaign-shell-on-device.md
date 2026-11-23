# ADR 052: the campaign shell kept on the device

Date: 2026-11-23. Status: accepted. Extends the offline shell (RYT-128, RYT-013;
[offline shell](../offline-shell.md)).

## Context

A reload without signal opens the app from the offline worker, but inside a campaign it showed
only the offline line and a placeholder: no campaign name, no navigation and no screen title,
because nothing of the campaign was stored on the device (RYT-160). The owner chose the
recommended options on the block O options page (2026-11-23).

## Decision

1. **What is kept (P1 A).** For the campaigns opened on this device only: the campaign id, its
   name, the account's role in it and the enabled modules. Nothing else from the campaign: no
   description, party level, characters, inventory, notes or anything about other members.
   Campaigns entered through the admin panel (temporary, audited access, RYT-153) are not kept.
2. **How long (P2 A).** In `localStorage`, under one key per account
   (`rytta-campaign-shell:<user id>`). Every successful campaign list refreshes the kept campaigns
   and drops those the account left, was removed from or that were deleted. Signing out, or the
   app opening signed out for any reason but a lost connection, removes every account's; signing
   in removes every other account's. A start without signal that cannot restore the session keeps
   them, as the session itself stays on the device. Unreadable content, and a record filed under
   another campaign's id, are discarded.
3. **What is shown (P3 A).** While the campaign list has never loaded on the page and cannot load
   now, the header names the campaign and the navigation is drawn from the kept modules. Each
   section shows its title and the offline notice; no screen runs on kept data, and nothing is
   requested or offered with it (members, rest requests, the admin banner, leaving). When the list
   loads, the screens load as usual.

## Consequences

- A campaign name stays on a device until the account signs out there. A shared device should be
  signed out, as for the session itself.
- The kept role and modules only draw navigation. Every read and write is still authorized by the
  server (RLS and RPCs), so a stale role or module list grants nothing.
- Offline campaign data and offline actions remain out of scope.
