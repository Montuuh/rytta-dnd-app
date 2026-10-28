# RYT-020 independent UI/UX review

Date: 2026-10-29. Reviewer: ui-ux.

Verdict: PASS

Reviewed source digest: `518f19194bc0dd6b0b49edcb091da5f716a75dcb7dce73e26307f4d85713db79`.

## Resolution and scope

Member cards list linked characters with on-card link/unlink; Invite player opens a
membership-only email modal; unassigned characters sit in their own section; Player view
lists Players and shows that POV on party without DM create/edit. No unresolved blocking
finding remains. Approval applies only to the digest above.

## Independent verification

Isolated preview: `http://127.0.0.1:4180/rytta-dnd-app/` from `dist-ryt020-review` with the
SDK HTTP fixture. Harness: `review.mjs`. Matrix: phone 390 and tablet 820 with ES/dark,
EN/light, ES/light and EN/dark, `reducedMotion: reduce`, plus 150% root text on members.
Captures under `captures/`; structured results in `results.json`. OCR of key captures is in
`ocr.json` as a reading aid after direct capture inspection tooling failed in-session.

### Members

Each member card shows a Characters heading, empty or linked names, and card-local Link /
Unlink. Unassigned characters appear only while unlinked and disappear after link. Invite
player opens a dialog with Google email field and membership-only copy
(“Sin personaje asignado” / “No character assigned”); Escape restores focus to the trigger.
Link and unlink dialogs likewise close on Escape with focus return. Invite, link, unlink and
Player view controls measured ≥44px. Axe (wcag2a/aa/21aa) clean; no horizontal overflow;
no page errors. Resource fields do not appear on the members surface.

### Player view and party

Player view menu lists Players (Arin); empty state shows “no players” when absent. Selecting
Arin shows the preview label, hides Create character / Edit resources, and filters the
characters REST read with `user_id=eq.<player>`. Linked preview still shows that Player’s
character and resources; empty preview shows the player empty copy. Return to DM restores
DM actions. Membership RPCs are not invoked by preview. Header Player view menu item is 44px.

### Hub membership copy

With a pending invite that has no character, the join panel shows membership-only copy and
campaign name; character-targeted invites still use the character invitation string.

## Limits

Chromium + fixture only; not a real Google/JWT/PostgREST session or two live identities.
Safari/iOS and a full screen-reader session remain untested. Preview state is in-memory and
resets on reload. No implementation, database permission, deployment, backlog or manifest
change outside the requested PASS record. Parent `npm run check` / `test:e2e` are
implementation gates, distinct from this independent review.
