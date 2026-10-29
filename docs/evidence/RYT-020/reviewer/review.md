# RYT-020 independent UI/UX review

Date: 2026-10-29. Reviewer: ui-ux.

Verdict: PASS

Reviewed source digest: `1ff6e2de5dc3e011606d7e6c427268d970da6d548d103562fc2256200755dbb6`.

## Resolution and scope

Member cards list linked characters with on-card link/unlink; Invite player opens a
membership-only email modal; unassigned characters sit in their own section; Player view
lists Players and shows that POV on party without DM create/edit. No unresolved blocking
finding remains. Approval applies only to the digest above.

## Independent verification

Isolated preview: `http://127.0.0.1:4180/rytta-dnd-app/` from `dist-ryt020-review` with the
SDK HTTP fixture. Harness: `review.mjs` via `node --experimental-strip-types` (digest
matched at harness start and end). Matrix: phone 390 and tablet 820 with ES/dark,
EN/light, ES/light and EN/dark, `reducedMotion: reduce`, plus 150% root text on members.
Captures under `captures/`; structured results in `results.json` (`failure: null`, axe
clean, no horizontal overflow). Captures were inspected directly after the harness run.

### Members

Each member card shows a Characters heading, empty or linked names, and card-local Link /
Unlink. Unassigned characters appear only while unlinked and disappear after link. Invite
player opens a dialog with Google email field and membership-only copy
(“Sin personaje asignado” / “No character assigned”); Escape restores focus to the trigger.
Link and unlink dialogs likewise close on Escape with focus return. Invite, link, unlink and
Player view controls measured ≥44px. Axe (wcag2a/aa/21aa) clean; no horizontal overflow;
no page errors. Resource fields do not appear on the members surface. ES and EN copy are
complete on members, invite and link dialogs; dark and light palettes keep hierarchy and
contrast readable at 390 and 820, including 150% members text.

### Player view and party

Player view menu lists Players (Arin); empty state shows player-empty copy when unlinked.
Selecting Arin shows the preview label, hides Create character / Edit resources, and filters
the characters REST read with `user_id=eq.<player>`. Linked preview still shows that
Player’s character and resources without DM actions. Return to DM restores DM actions.
Membership RPCs are not invoked by preview. Header Player view control is 44px.

### Hub membership copy

With a pending invite that has no character, the join panel shows membership-only copy
(“Sin personaje asignado”) and campaign name.

## Limits

Chromium + fixture only; not a real Google/JWT/PostgREST session or two live identities.
Safari/iOS and a full screen-reader session remain untested. Preview state is in-memory and
resets on reload. No implementation source under `src/` was modified for this review.
