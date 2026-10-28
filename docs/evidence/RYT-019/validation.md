# RYT-019: campaign home and compact settings

Date: 2026-10-28. Scope: the four user browser comments on account home, invitations,
hamburger menu size and appearance icons.

## Baseline and ownership

Reproduced the reported home at http://localhost:5174/ with its duplicate account/logout
block, unstructured invitation copy and the existing full-height settings drawer. The
user's marker captures and before-home.png preserve the initial rendering. Inspected
the current shared-tree status before editing and preserved earlier RYT-018, RYT-017 and
doctrine work. This delivery owns the home, global settings menu, preference labels/icons,
their styles/catalogs, focused browser regressions and documentation. No SQL, backend
permission, live application-data mutation, commit, push or deployment was performed.

## Result

- Campaign home starts with My campaigns; the duplicated account block is removed.
  Header account menu retains campaign navigation and sign-out.
- Join a campaign is a distinct panel with a heading/icon, explanation, refresh action,
  pending count, invitation cards or a useful empty state, and recipient email.
  Loading/error/retry remain distinct; acceptance/decline and global refresh are preserved.
- Hamburger opens a compact bottom-end Mantine Menu with one Settings item. No full-height
  drawer or page overlay remains for that menu. Menu closes before the centered settings
  modal opens; keyboard, outside click, Escape and return focus remain supported.
- Appearance shows moon/sun icons. Native radio labels remain localized for assistive
  technology, the selected state remains visible and the label targets are at least 44px.
  Language selection and stored preferences continue to work.

## Observed validation

- npm run check: PASS, 55 tests plus strict typing, lint, architecture/docs/AI contracts
  and production build.
- npm run test:e2e: PASS, 111/111 (58.9 seconds), no skips or retries. Includes 390px,
  820px and 1440px projects, Spanish/English, dark/light, 150% text, reduced motion, axe,
  existing account/invitation actions and Pages subpath navigation.
- New focused tests verify content-sized menu geometry, single Settings action, keyboard
  opening, initial focus, Escape, outside click, dialog return focus, accessible theme
  labels/selection/target sizes, duplicate-block removal and invitation loading/empty/error
  recovery. Logout tests now use the intended header account menu.
- The reviewer found an inherited non-blocking close-button name (Close navigation inside
  Settings). Corrected it to localized Close settings / Cerrar ajustes. Re-ran npm run check
  successfully (55 tests) and nine focused browser cases across desktop/tablet/mobile,
  including the new accessible-name assertion and theme/language persistence. Output is
  isolated in .tmp/ryt019-label-tests. The initial full 111-case pass predates only this label fix.
- Direct live localhost inspection confirmed all four visible changes. Captures:
  after-compact-menu.png and after-preferences.png. Curated fixture captures avoid personal
  account data and show mobile/tablet layouts in captures/.

The half-outside spinner in captures/home-empty-390.png was captured during a loader exit
transition, immediately after the deferred query resolved. Independent stable loading
captures show the spinner centered; this was not a persistent application defect.

The full suite passed on its first run after updating selectors for the intentionally
changed menu semantics and logout location. No initial failed application check was hidden.
Independent ui-ux review is recorded separately; implementation checks do not self-approve UX.

Independent final verdict: PASS in reviewer/review.md for source
621bb1876b44181b3a68041e524c3731e0f74be5712992cac6a8bcf43ae89064.
The initial report is preserved as reviewer/review-initial.md. The focused re-review
confirmed the corrected close label in both languages, phone/tablet at 150%, click closure,
44px targets, focus restoration and clean axe results. npm run check:ui-review passed
with the final manifest, and documentation/format gates passed. RYT-019 is Done.

## Limits

Browser fixtures validate SDK/UI contracts, not two real Google identities or hosted JWT
authorization. No backend change was needed. Chromium phone/tablet emulation does not prove
Safari/iOS or a full screen-reader session. Source fingerprint and reviewer verdict must
match before marking this delivery Done. See ADR 008.
