# ADR 050: quest journal

Date: 2026-11-22. Status: accepted.

The quest journal (RYT-006) is a campaign module the DM switches on for Players like the others.
The owner chose it on an options page: objectives revealed one by one with a DM-only note, four
statuses (rumour, active, completed, failed), a journal grouped by status, a bottom sheet on
phones and a side panel on tablets, a quiet mark on what changed, the DM editing in place, and
Players who only read.

## Data and visibility

A quest, its objectives, the DM's note and each account's last-opened time are separate records.
No table has a client grant: `list_quests` returns every quest to the DM and, to a Player, only
published quests with their visible objectives and the Player's own read time. Drafts, hidden
objectives and the note never leave the server for a Player. The Player's payload carries no
update time and is ordered by the last Player-visible change, so editing a hidden part leaves no
trace in it.

`save_quest` replaces a quest and its objective list with a revision check; creation is
idempotent on the client-generated id. A campaign keeps up to 200 quests and a quest up to 20
objectives.

## Change marks and live updates

A published quest records when its Player-visible content last changed, and each objective when
it was revealed or changed while visible. A Player sees "Updated" on a quest and "new" on an
objective changed after their own last-opened time, which `mark_quest_seen` keeps on the server
so it follows them across devices. The Quests navigation item carries a dot while such a quest
exists.

Realtime follows `quest_signals`, one secret-free row per campaign whose revision moves only on
Player-visible changes. Polling covers a missing channel.

## Consequences

- Deleting an account removes its read times and clears it as a quest's author, through the Auth
  cascade and `delete_my_account`.
- Read times of a member who leaves stay until the quest is deleted; they name no content.
- Players cannot track or annotate quests; that can come later as its own decision.
