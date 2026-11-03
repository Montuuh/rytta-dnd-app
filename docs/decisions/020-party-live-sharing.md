# ADR 020: Party live sharing and per-character audit history

Status: proposed for `RYT-031`. Amends ADR 004 (Players only read their own character) and
ADR 009 (DM Player preview).

## Context

At the table, Players want to see how their teammates are doing (hit points, armor class,
exhaustion, conditions) without asking. Base table policies (`characters_read`,
`resources_read`, `sheets_read`, `vitals_read`) intentionally restrict Players to their own
character, and `character_resources` holds economic values (gold, water, rations) that must
stay private.

## Decision

- `characters.shares_live boolean not null default true`. Only an active campaign DM changes it,
  through `set_character_live_sharing(target_campaign, target_character, enabled)`. The existing
  `characters_audit` trigger records each real change as `characters:UPDATE`; repeated calls with
  the same value write nothing.
- `get_party_overview(target_campaign)` is a `security definer` read with a fixed search path,
  executable by `authenticated` only. Players receive their own character plus other *assigned*
  characters with `shares_live = true`, limited to: id, name, is_own, is_assigned, shares_live,
  sheet status, class key/label, level, current/max/temp HP, AC, exhaustion and conditions.
  It never returns gold, water, rations, user ids, the build, notes or other vitals. DMs receive
  every character of the campaign. Outsiders, inactive members and DMs of other campaigns get
  `Forbidden`. Base table policies are unchanged.
- The Party page polls the overview every 10 seconds while the tab is visible. Players see compact
  live cards of shared teammates; DMs get a per-card 44px toggle with a tooltip and a visible
  "Hidden from the party" note.
- The DM Player preview is editable (RYT-028 decision): the preview no longer disables sheet
  creation/editing; the server still authorizes as the DM.
- The DM sheet header opens a drawer with that character's audit timeline (`character_events`
  filtered by character). The timeline component is shared with the Command Center audit tab
  and lives in the campaigns feature (`AuditTimeline`).
- PRE: the migration mirrors the column and both RPCs into an existing PRE using
  `pre_admin.remap`, like the ETL clone.

## Consequences

Teammate portraits are shown as initials: storage policies for portraits still authorize only the
owner and DM. Sharing is per character, not per field; a finer split would need another column.
