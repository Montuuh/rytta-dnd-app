# Required UI/UX review

The user explicitly authorized a standing UI/UX review after every interface delivery.
Use `.codex/agents/ui-ux.toml` as the reviewer role. This includes theme, translations,
component states, navigation, responsive layout and interactions.

## Workflow

1. For new or redesigned UI, complete [UI design flow](ui-design-flow.md) phases 1–4 first.
   Implement the scoped change and run type/lint/unit/browser validation. Capture the real UI.
2. Invoke `ui-ux` with the ticket, owned paths, acceptance criteria, preview URL and evidence.
   If the host exposes only generic delegation, start an independent subagent and explicitly
   have it read/apply the TOML role. Never claim native custom-role discovery from a file alone.
3. Obtain PASS, CHANGES_REQUIRED or BLOCKED, with findings and tested scenarios. A report
   must distinguish browser testing from screenshot/code inspection and list untested states.
4. Fix blockers and ask for a focused re-review. Do not self-approve or erase earlier findings.
5. After an actual independent PASS, record it in the delivery report and
   `docs/evidence/ui-review-current.json` using the exact reviewed source fingerprint from
   `node scripts/check-ui-review.mjs --fingerprint`.
6. Run `npm run check:ui-review`. Pushes to `main` and Pages publishing require a current PASS.
   Pull request CI runs it last with `--allow-pending`: a stale or non-PASS verdict is a
   warning, not a failure, so commits awaiting re-review do not fail CI. Do not treat that
   warning as a CI failure to fix; do not merge until the PASS is recorded.

The manifest includes ticket, reviewer (`ui-ux`), verdict, reviewedAt, sourceDigest and report.
Fingerprinting covers UI components/styles, app composition, catalogs, index.html and the
dependency lockfile. Line endings are normalized for Windows/Linux. Source changes make the
review stale; docs/report-only edits do not. This checks evidence consistency, not whether an
agent really performed a review. Never fabricate the reviewer verdict.

The reviewer is invoked by the implementation workflow at delivery completion. Git/CI hooks
cannot independently launch a model review and do not pretend to. If delegation is unavailable,
leave the review pending and report the limitation rather than marking the UI delivery Done.
The SessionStart reminder and frontend/producer instructions keep the requirement visible.
