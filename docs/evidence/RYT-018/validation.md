# RYT-018 verification

Date: 2026-10-28. Scope: previous six header/account requests plus seven member/preview/navigation requests.
Existing unstaged doctrine edits were present at start and preserved. RYT-018 owns the UI,
assignment RPC, tests and new delivery evidence; prior doctrine edits remain independent.

## Results

- npm run check: PASS, 43 tests including 25 SQL actor/assignment tests; types, lint,
  architecture/docs/AI contracts and production build passed.
- npm run test:e2e: PASS, 99/99, no skipped, 44.3 seconds, mobile390/tablet820/desktop1440.
- Browser matrix covers ES/EN and dark/light at 150%, reduced motion and axe. Screenshots
  are preserved in final/. Settings drawer/modal, account menu, member metadata-only
  request, direct linking/unlinking, no resources in members, Player preview and restore,
  disabled unfinished modules, offline and session/role changes are exercised.
- Baseline party capture is carried from the prior RYT-003 reviewed source, which was the
  current interface at start; the baseline is not a newly executed browser test.
- The first implementation validation caught a missing await in the metadata adapter and
  TypeScript constraints on a conditional Mantine polymorphic component. Both corrected.
- First e2e run: 79 passed/17 failed. Failures included real header overflow on 820px at
  150%, stale tests matching duplicate emails/character names, and an offline test keeping
  a dialog open on same-route navigation. Added wrapping to the header, scoped selectors
  and explicit Escape; regression then passed. Initial failure contexts are retained.
- A static/dynamic feature-import build warning was resolved by lazy-loading assignments.

## Supabase

Applied additive member_character_assignment migration on the existing Rytta project
(ekscdsmniukuxqjixapu), after confirming history and function absence. Supabase assigned
20261028205805; local filename matches. Postflight: anon execute false, authenticated
execute true; existing character count stayed two. Migration changes no existing assignments
or resources. Authorization runs inside the RPC; direct resource writes remain revoked.

## Limits

Browser backend traffic uses the SDK HTTP fixture. SQL tests use PGlite and a JWT identity
shim. Hosted function existence/grants/counts were checked, but this delivery did not
exercise real multi-account Google login or hosted assignment through PostgREST. Real iOS
Safari and screen-reader testing were not performed. No frontend publication was requested.

Independent review and source fingerprint are recorded below after actual reviewer verdict.


## Independent-review corrections

Initial review CHANGES_REQUIRED found three P2 issues: at 390px/150% the account
and hamburger could wrap to separate rows; Mantine Menu's default focus placeholder
violated aria-required-children; a valid long email widened the dropdown beyond viewport.
Fixes group account/menu with nowrap, disable that initial focus placeholder while
retaining native keyboard focus, and constrain dropdown width with wrapping email text.
Initial report and captures are preserved under reviewer/. The complete 99-test suite
passed after the first layout correction. The affected character/shell suite was then
rerun against the final build, with menu axe and long-email keyboard regressions added.
Final npm run check remains PASS43; final focused test result and reviewer verdict follow.


## Closure

Final independent UI/UX verdict: PASS for digest
8df0ea17410043aed469712855bfb6cf9072501404a1413e4ca313fd53c47112.
32 final reviewer captures across390/820, ES/EN, light/dark at150% passed axe,
viewport containment, touch44px and page-error checks. Enter focuses first account
item, ArrowDown reaches logout, Escape restores trigger. Long email now wraps
inside viewport. Initial three P2 findings preserved and resolved. Nonblocking P3:
metadata loading can temporarily show no-character copy before its query completes.

Final check PASS43; preceding complete browser suite PASS99, followed by focused
final build suite PASS27 including added account axe and long-email regressions.
RYT-018 Done as verified source implementation; Supabase additive migration applied.
No Git commit, push or frontend publication performed in this delivery.
