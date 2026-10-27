# Required UI/UX review

The user explicitly authorized a standing UI/UX review after every interface delivery.
Use `.codex/agents/ui-ux.toml` as the reviewer role. This includes theme, translations,
component states, navigation, responsive layout and interactions.

## Workflow

1. Implement the scoped change and run type/lint/unit/browser validation. Capture the real UI.
2. Invoke `ui-ux` with the ticket, owned paths, acceptance criteria, preview URL and evidence.
   If the host exposes only generic delegation, start an independent subagent and explicitly
   have it read/apply the TOML role. Never claim native custom-role discovery from a file alone.
3. Obtain PASS, CHANGES_REQUIRED or BLOCKED, with findings and tested scenarios. A report
   must distinguish browser testing from screenshot/code inspection and list untested states.
4. Fix blockers and ask for a focused re-review. Do not self-approve or erase earlier findings.
5. After an actual independent PASS, record it in the delivery report and
   `docs/evidence/ui-review-current.json` using the exact reviewed source fingerprint from
   `node scripts/check-ui-review.mjs --fingerprint`.
6. Run `npm run check:ui-review`. CI and release verification require a current PASS.

The manifest includes ticket, reviewer (`ui-ux`), verdict, reviewedAt, sourceDigest and report.
Fingerprinting covers UI components/styles, app composition, catalogs, index.html and the
dependency lockfile. Line endings are normalized for Windows/Linux. Source changes make the
review stale; docs/report-only edits do not. This checks evidence consistency, not whether an
agent really performed a review. Never fabricate the reviewer verdict.

The reviewer is invoked by the implementation workflow at delivery completion. Git/CI hooks
cannot independently launch a model review and do not pretend to. If delegation is unavailable,
leave the review pending and report the limitation rather than marking the UI delivery Done.
The SessionStart reminder and frontend/producer instructions keep the requirement visible.
