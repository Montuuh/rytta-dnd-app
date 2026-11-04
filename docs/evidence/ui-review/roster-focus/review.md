# ui-ux review: roster and Party focus once the outcome is on the page

- Reviewer role: `.codex/agents/ui-ux.toml` (independent, implementation read-only)
- Reviewed source: local commit `b5eeed5` ("Focus the archive outcome once it is on the page: Party
  and roster dialogs"), not pushed, in a clean detached worktree
- UI source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`, run in that worktree):
  `6a13dc7725a9005fa0bf8a0320aead6d0eab3e46ce71bfae309290d9013757a4`
- Date: 2026-11-04
- Scope: `src/features/characters/ui/party.tsx` and `src/features/characters/ui/roster.tsx` (RYT-044),
  where single-frame `requestAnimationFrame(() => x.focus())` calls became `focusWhenReady(() => x)`
  (`src/shared/ui/focus-when-ready.ts`, reviewed in `docs/evidence/ui-review/focus-return/review.md`).
  No visual change was intended; none was seen.
- **Current verdict: PASS** for local commit `f862d73` (fingerprint
  `34e2cdd1584328140b11511de9516719c1ac028e85edd807ccbb561cc6cfa461`); see Round 2 at the end.
  Round 1 below is kept as it was reported.

## Round 1 verdict (`b5eeed5`): CHANGES_REQUIRED

The happy paths work. On 390, 820 and 1440 px, at 1x and 6x CPU with 800 ms delayed responses,
focus lands on the outcome after archive (roster notice, Party status Alert) and restore. Cancel and
Escape return focus to the ⋯ trigger. Closing an error notice returns focus to its origin or to the
checked radio, and closing the create dialog returns focus to the create button or the welcome CTA.
A move made after the outcome has focus is kept. No axe or layout regressions.

The brief also requires that a user who moves elsewhere while the archive or restore is pending is
not pulled back. That fails for restore in every case tried (F1). For archive it fails in a narrower
case (F2). This is the same defect as F1 of the focus-return review, which was fixed for the
initiative save by passing `from`. These new call sites do not pass it. It is not a regression,
because the parent commit pulls focus back the same way (measured), but the change does not fix it
either.

## Findings

### F1 (Medium, blocking): restoring a character pulls focus back from a user who moved during the restore

- Where: `src/features/characters/ui/roster.tsx:825-827` (`onSuccess` → `focusWhenReady(() => noticeRef.current)`
  with no `from`), called from `:876` (`restore(entry, event.currentTarget)`). Mechanism:
  `src/shared/ui/focus-when-ready.ts:15` (`from = document.activeElement` read at call time) and `:25`
  (`active === from` counts as fallen).
- Cause: `focusWhenReady` runs in the mutation's `onSuccess`, after the RPC resolves. By then
  `document.activeElement` is the control the user moved to, so the helper takes it as `from`. It
  treats focus there as "fallen" and focuses the notice. The `origin` element that `restore`
  already receives (the Restore button) is not passed as `from`.
- Reproduction (identity fixtures, `player: true, reserve: ['Bram'], archived: ['Old']`, es/dark,
  `/#/campaign/<id>/party/roster`):
  1. Open "Archivados" and press "Restaurar a Old", with `restore_character` delayed 1500 ms.
  2. About 250 ms later, while the button shows its spinner, do one of the following: press Tab
     (lands on "Saltar al contenido" at 820/1440, bottom nav "Grupo" at 390), focus "Volver a Grupo",
     or click the refresh button.
  3. When the restore resolves, focus jumps to the `.roster-notice` ("Old vuelve al plantel.").
- Measured: 18 of 18 runs failed (3 moves × 3 viewports × 1x/6x CPU). Typical trace at 390 px, 1x:
  `30 Restaurar a Old | 62 blur->body | 290 a "Grupo" (user) | 1576 div.roster-notice`.
  The parent commit (`b5eeed5^`, built the same way) fails the same 18 runs, so this is not a regression.
- Impact: a keyboard or screen reader user, or a tablet user who has already tapped "Volver a Grupo"
  or the bottom nav, is pulled back to a notice on a page they are leaving. The window lasts as long
  as the restore RPC, which is longest on the slow devices and networks this change targets.
- Suggested direction (not applied, because implementation is read-only for this review): pass the
  control that started the action, `focusWhenReady(() => noticeRef.current, { from: origin })`.
  This is the same fix that resolved F1 for the initiative save. The Restore row leaves the
  Archivados list on success, and focus is on `body` while the button is loading, so an idle user
  still lands on the notice. Add an e2e that delays `restore_character`, moves focus to "Volver a
  Grupo" and asserts it stays.

### F2 (Low, not blocking): focus escapes the pending archive dialog, then gets pulled to the notice

- Where: `src/features/characters/ui/roster.tsx:778` (`loading={action.isPending}` on the confirm
  button disables it, so Chrome drops focus to `body`) and `:724` / `party.tsx:397`
  (`focusWhenReady` in `onArchived` without `from`).
- Reproduction (roster, `archive_character` delayed 1500 ms; same on Party, which uses the same
  `ArchiveDialog`): press "Archivar" in the dialog. Focus goes to `body` about 30 ms later. Press Tab
  and focus reaches "Saltar al contenido" behind the open modal, because the focus trap only acts on
  focus inside it. Escape is ignored while pending, which is correct. On success the dialog closes
  and focus moves from the skip link to the notice.
- Measured: every run at all three sizes, 1x and 6x. Same on the parent commit.
- Impact: low. While the dialog is pending, a keyboard user can tab into the page behind it, and on
  success they are moved to the outcome. Most users would expect that once the dialog closes. Two
  changes would remove both effects: keep focus inside the dialog while it is pending (for example,
  do not hand the focused button a real `disabled`), and capture `from` when the action starts, as
  for F1.

### F3 (Info): the roster notice can take focus before its text is rendered

`RosterNotice` (`roster.tsx:213`) focuses a generic `div tabIndex={-1}` that has no role or name. The
text sits in a nested `aria-live="polite"` region. Under the 6x throttle, 2 of about 60 traced focus
moves recorded the notice with empty text at the moment of `focusin`. The text arrived on the next
commit. The live region should still announce it, but this was not checked with a screen reader. The
Party notice is an `Alert role="status"` with its text, so it is not affected. No action is required
for this delivery.

### F4 (Info, outside the commit's scope)

Closing the Party "está archivado" notice still uses a single `requestAnimationFrame` to focus the
roster link (`party.tsx:187`), as do `party.tsx:115`, `:738` and `:1107`. These were not part of this
change and were not exercised here. They would be the next candidates if the same flakiness shows up
there.

## Scenarios tested (real Chromium via Playwright; evidence is console focus traces, no screenshots kept in the repo)

Build under test: production build of the worktree at `b5eeed5` in supabase mode with the e2e
fixture URL/key, served on 127.0.0.1:4274 (demo build on 4273, not needed in the end; parent-commit
build on 4275 for comparison). Viewports 390x844, 820x1180 (touch) and 1440x1000. CDP
`Emulation.setCPUThrottlingRate` 6. Route delays: 800 ms on every Supabase REST call after the page
loaded (refetches included), plus 800 ms or 1500 ms on the `archive_character` / `restore_character` RPC.
Each focus move was traced with `focusin`/`focusout` listeners.

Results at 1x and 6x on all three viewports, unless stated:

- Roster archive, confirm: the `.roster-notice` is focused 0.87 s after the click at 1x and 1.18-1.26 s
  at 6x (the delays included), stays for 1.5 s, and the card leaves (3 radios). Pass.
- Roster archive, Escape and Cancel: the ⋯ trigger "Más acciones para Bram" is focused after 8-160 ms
  and stays for 800 ms. Pass.
- Roster restore (one free slot): the notice is focused 0.88 s (1x) or 1.11-1.16 s (6x) after the
  click and stays. Pass.
- Restore with a move while pending (Tab, focus on the back link, click on refresh): **fails, 18/18 (F1)**.
- Archive with a Tab while pending: focus escapes the modal and is then moved to the notice (F2).
  A move to "Volver a Grupo" 100 ms after the notice is focused is kept. Pass.
- Error notice close: a mocked `restore_character` 400 "Character limit" shows the alert. Closing it
  by click or by Enter on "Cerrar" returns focus to "Restaurar a Old" (the origin) after 11-31 ms and
  it stays. A mocked blocked switch (`set_active_character` 400) returns focus to the checked radio
  "Arin" (no origin). Pass.
- Create dialog (roster create button "Crear un personaje (hueco 3 de 4)"): Escape and Cancel return
  focus to the button, and it stays. A Shift+Tab 100 ms later is kept. Welcome CTA "Crear mi
  personaje" (Party, no characters): Escape and Cancel return focus to the CTA. Pass, 2 repeats each.
  A harness note, not a finding: a plain Tab from the last focusable element at 820/1440 leaves the
  document (`activeElement` becomes `body`), so the helper re-focuses the button during its 300 ms
  settle. That is the documented fallback.
- Party (DM): ⋯ → "Archivar personaje". Escape and Cancel return focus to "Más acciones para Arin".
  Confirm focuses `role="status"` "Arin está archivado." after 0.88-0.90 s (1x) or 1.06-1.22 s (6x),
  it stays for 1.5 s, and the card heading is gone. A Tab 120 ms after the status gets focus (to its
  "Cerrar" button) is kept for 2.5 s. Pass.
- Axe (wcag2a, wcag2aa, wcag21aa) with the focused outcome at 150% root text: roster notice in es/dark
  and en/light, Party status Alert in es/dark, at 390, 820 and 1440: no violations and no horizontal
  scroll. I inspected the screenshots at 390 and 820. Layout matches the existing RYT-044 design, with
  no change from this commit.

Parent-commit comparison (`b5eeed5^`, same probe): the same 18 restore no-steal failures. All other
focus outcomes passed in this environment as well. One run was lost to a harness network error
(`ERR_NO_BUFFER_SPACE`).

Repository e2e `tests/e2e/roster.spec.ts`, run through a temporary config outside the repo with the
same `identity-*` projects pointed at port 4274, retries 0:
- Full spec with `--repeat-each 3`: 99/99 passed.
- `roster.spec.ts:266` (DM archives from Party) with `--repeat-each 40` on `identity-mobile` and 10
  workers: 40/40 passed. The parent build also passed 40/40 here, so I could not reproduce the
  original ~6/40 failure on this machine. The improvement is consistent with the code, but I did not
  confirm it independently.

## Limitations

- Mouse, touch and keyboard were driven by Playwright, with no real device and no screen reader.
  The announcement of the focused notice and of the live region (F3) was not heard.
- The throttle slows only this tab's CPU. Load beyond 6x CPU and 1500 ms RPC delays was not tried.
- Only Chromium was used. iOS Safari, where tapping does not focus buttons, was not tested.
- The Party notice close (F4) and the hosted Supabase refetch timing (as opposed to fixtures) were not exercised.

## Cleanup

Servers I started (4273, 4274, 4275) were stopped, and the build outputs and the parent-commit export
in my scratchpad were removed. No file in the worktree other than this report was written. The
implementation and `node_modules` were not modified.

---

# Round 2: focused re-review of `f862d73`

- Reviewed source: local commit `f862d73` ("Keep focus where the user moved it during a slow restore")
  on top of `b5eeed5`, not pushed, same clean detached worktree
- UI source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`, run in that worktree):
  `34e2cdd1584328140b11511de9516719c1ac028e85edd807ccbb561cc6cfa461`
- Date: 2026-11-04
- Change: in `roster.tsx`, the restore's `onSuccess` now calls
  `focusWhenReady(() => noticeRef.current, { from: origin })`, where `origin` is the Restore button.
  There is a new e2e, `a slow restore leaves focus where the user moved it`, in `tests/e2e/roster.spec.ts`.
- Build under test: production build of the worktree at `f862d73` in supabase mode with the e2e
  fixture URL and key, served on 127.0.0.1:4274. The method is the same as round 1: Playwright in
  Chromium at 390x844, 820x1180 (touch) and 1440x1000, CDP CPU throttle 6x, and the same route delays.

## Verdict: PASS

## Per-finding status

- **F1 (Medium): resolved.** I re-ran the round 1 matrix with `restore_character` delayed 1500 ms.
  About 250 ms after pressing "Restaurar a Old", one of three moves was made: Tab (to "Saltar al
  contenido" at 820/1440, bottom nav "Grupo" at 390), focus on "Volver a Grupo", or a click on the
  refresh button. Focus stayed on the moved-to control through the restore and for 2 s after it.
  This held in 36 of 36 runs (3 moves × 3 viewports × 1x/6x × 2 repeats). Round 1 failed 18/18.
  - An idle user (no move), with the restore delayed 800 ms plus 800 ms refetches, still lands on the
    `.roster-notice` "Old vuelve al plantel." after 0.87-0.93 s at 1x and 1.02-1.20 s at 6x, and the
    focus stays there for 1.5 s. 12 of 12 runs (3 viewports × 1x/6x × 2).
  - The error path is unchanged and still returns focus to the Restore button (origin) when the
    error notice is closed (12/12).
- **F2 (Low, pre-existing): unchanged, not blocking.** The confirm button in the archive dialog still
  drops focus to `body` while pending, so a Tab can leave the modal, and on success focus moves to the
  notice. It is not introduced by this delivery and only reachable while the RPC is in flight. Once
  the dialog closes, the outcome is a reasonable place for focus. Worth a follow-up ticket.
- **F3 (Info): unchanged.** One of 12 idle restore traces at 6x (390 px) again recorded the notice
  with empty text at `focusin`. The live region carries the announcement. No action needed.
- **F4 (Info, outside this change): unchanged, not blocking.** The other single-frame
  `requestAnimationFrame` focus calls in `party.tsx` (`:115`, `:187`, `:738`, `:1107`) were not part of
  this delivery and were not exercised. Treat them only if the same flakiness shows up there.

## Regression checks (whole round 1 probe, `--repeat-each 2`, 150 runs)

149 passed and 1 failed. The failure was the probe step "Escape is ignored while the archive is
pending" (mobile, 6x). The page snapshot showed that the 1500 ms archive had already succeeded when
my Escape arrived, so the dialog had closed normally. That is a timing issue in my harness, not app
behaviour: the same probe passed 8/8 on a focused re-run. All of these passed again:
- archive confirm, Cancel and Escape (roster and Party DM)
- error-notice close (to origin and to the checked radio)
- create dialog and welcome CTA close
- moves after the outcome are kept
- axe (wcag2a/2aa/21aa) with the focused notice at 150% text in es/dark and en/light, at 390, 820 and
  1440, with no violations and no horizontal scroll.

Repository e2e (`tests/e2e/roster.spec.ts`), run through a temporary config outside the repo with
the `identity-*` projects pointed at 4274 and retries 0:
- full spec with `--repeat-each 3`: 108/108 passed (12 tests × 3 projects × 3)
- the new `a slow restore leaves focus where the user moved it` together with `the DM archives an
  unassigned character from Party and restores it`, with `--repeat-each 20` on three projects and 10
  workers: 120/120 passed

I did not re-run the new test against `b5eeed5`. The coordinator reports that it fails 3/3 there. My
round 1 probe showed the same defect on `b5eeed5`, so I have no reason to think the test is vacuous.

## New findings

None.

## Limitations (round 2)

Same as round 1: Playwright-driven input, Chromium only, no real device and no screen reader, and a
throttle limited to 6x CPU with 1500 ms RPC delays.

## Cleanup (round 2)

The server on 4274 that I started for this round was stopped and the build output in my scratchpad
was removed. No file in the worktree other than this report was written.
