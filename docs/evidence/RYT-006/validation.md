# RYT-006 — Quest journal

Date: 2026-11-22 (block G). Owner choices on 2026-11-22 from the options page, all the
recommended ones: objectives revealed one by one with a DM-only note (P1 B), four statuses (P2 A),
a journal grouped by status (P3 A), a bottom sheet on phones and a side panel on tablets (P4 A),
a quiet mark on what changed (P5 A), the DM editing in place (P6 A) and Players who only read
(P7 A). Decision record: [ADR 050](../../decisions/050-quest-journal.md).

## What changed

- `supabase/migrations/20261217120000_quest_journal.sql`: quests, objectives, the DM's note and
  read times with no client grants; `list_quests`, `save_quest`, `delete_quest` and
  `mark_quest_seen`; the secret-free `quest_signals` table followed by realtime; account deletion
  removes read times and authorship. Mirrored to PRE.
- `src/features/quests/`: the Quests page (journal by status, closed quests folded, ticks for
  progress, "Updated" and "new" marks), the Player's reader and the DM's in-place editor
  (status, title, Player text, objectives with done and visible switches, the DM note, Publish,
  Save, Withdraw and Delete with confirmation). The module joins the navigation and the DM's
  module switches; the navigation item carries a dot while a Player has an unopened change.
- `docs/security.md`: "Quest journal (RYT-006)".

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Hidden quest text never reaches the Player payload or cache | `tests/database/quests.test.ts` (drafts, hidden objectives, their ids and the note absent from the Player payload; a note-only and hidden-objective edit leaves the Player payload byte-identical; module off refuses reads); hosted check on staging, production and PRE (below) | Met |
| The DM can publish and advance quests and Players see authorized changes | `quests.test.ts` (publish, reveal, mark done, unpublish, delete; signal moves only on Player-visible changes; change marks after the Player's own read time); `tests/e2e/quests.spec.ts` (DM creates, reveals, publishes, ticks and saves; Player sees "Updated", reads, the mark clears) | Met |
| Statuses and journal navigation work with keyboard and touch | `quests.spec.ts` at 390 and 820 px (sections, folded closed quests, sheet and dialogs with Escape and Back, unsaved edits guarded when leaving by the list, the navigation, Back, Escape or the Player view, axe, overflow, 44 px targets including the done toggles); ES/EN × Hearth/Parchment at 390 px; UI review below | Met |

## Database results

- PGlite: `npm run test:db` 518 passed (43 files), including 9 quest tests (anon, outsider,
  other-campaign DM, Player with the module on and off, own DM; cross-campaign ids; revisions,
  replays, limits, whole payloads; unpublish and delete signals).
- Staging: migration stored with the file's md5 (`d2f4f983…`, 22 784 bytes); account deletion
  patched; realtime publication added; a rolled-back check created a published quest with a
  hidden objective and a note, confirmed the Player saw neither, marked it seen and was refused a
  write.
- Production: preconditions checked (the account deletion anchors in `public` and `pre`, the PRE
  helpers). Applied as `20261122171357_quest_journal` with the same md5. Five tables with RLS in
  each environment; no client grant except SELECT on `quest_signals`; anon cannot execute the
  RPCs; both `delete_my_account` copies patched; `quest_signals` in the realtime publication for
  `public` and `pre`. The same rolled-back check passed on `public` and on `pre`.
- Advisors after the apply: only the existing patterns (RLS enabled with no policy on closed
  tables, security definer RPCs callable by authenticated).
- Security review: no High findings. Two Medium findings (a Player-visible update time and
  account deletion) were fixed before the hosted apply and confirmed closed on re-review.

## Checks

- `npm run check`: typecheck, lint, architecture, docs, 1177 unit tests, build.
- `tests/e2e/quests.spec.ts`: 18 passed at 390 and 820 px; the two leaving tests 24/24 repeated in
  series at 390 px.
- Found while testing: the unsaved-changes guard of the character sheet and creation moved to
  `src/shared/ui/use-leave-guard.ts` so the journal shares it; the characters and character sheet
  specs pass (110).

## UI review

Design critique first (a duplicated title in the phone reader, a sheet taller than its content,
read-only objective marks that looked tappable, two primary actions on tablet), all fixed. Then the
independent UI review: CHANGES_REQUIRED three times (a 20 px done toggle; Escape in the delete
dialog closing the phone sheet; unsaved edits lost when leaving by the list, the navigation, Back,
Escape or the Player view switch; focus lost after saving; a key press racing the guard), all
fixed with browser tests; PASS on 2026-11-22 for the current source (report kept locally under
`docs/evidence/ui-review/ryt-006/`). Non-blocking notes: on phones the Visible/Hidden word next to
the eye hides below 30em (the icon and its full label stay), and the reader sheet keeps a header
band for its close button.

## Not verified

- Realtime delivery of `quest_signals` to a second signed-in device on hosted Supabase.
- Back on WebKit and iOS Safari, and a real screen reader.
- A concurrent delete and save of the same quest can deadlock and fail one call (no data loss).
