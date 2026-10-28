# Pending deliveries: release preflight

Date: 2026-10-28. User explicitly requested committing and pushing all pending work.
Target: Montuuh/rytta-dnd-app, main. Previous published source: 3ea9721.
Source revision: the commit containing this report; UI digest:
f8e33e3db42563f4a4bb0aa04b1a87c26af58c514671d0212a742c4eefce07ef.

## Contents

RYT-018 account shell, member character assignment, DM Player preview and disabled planned
modules; RYT-017 shared-project PRE routing, ETL, backup/restore and development doctrine;
RYT-019 campaign-home/invitation UX, compact global menu and accessible appearance icons.
Includes the local Google callback correction, supporting ADRs, tests and independent reviews.

## Checks

- Reinstalled from lockfile with npm ci: 123 packages, no reported vulnerabilities.
  The first attempt failed with Windows EPERM because Vite held the native rolldown binding.
  Stopped only this repository's two Vite processes, repeated installation successfully,
  and restarted the user's localhost at port 5174. No other application was stopped.
- npm run check: PASS, 55 unit/SQL tests, types/lint/contracts and production build.
- npm run test:e2e: 111/111 passed after restoring members confirmation focus on Escape
  via trigger ref + onExitTransitionEnd (identity-mobile previously failed).
- Format, whitespace and current independent UI review gates pass
  (docs/evidence/RYT-019/reviewer/review-focus.md).
- Public Supabase smoke passes Google/open-registration preflight, anonymous API denials
  and exact local/production callbacks including PKCE correlation queries. No completed
  Google login or two-account authenticated API test is claimed by this smoke.
- Pending text files were checked for secret SDK keys, GitHub tokens, private keys and
  literal JWT credentials; none found. Local .env files, runtime databases, dependencies
  and raw test output stay ignored. Captures and reports are intentional delivery evidence.

## Target and backend

Origin/main and the local parent revision match before committing. Repository production
variables specify Supabase mode, the expected Rytta project and a publishable browser key.
Pages uses /rytta-dnd-app/; hosted production selects public/private, localhost selects
pre/pre_private. Auth is shared. No PRE schema is baked into production configuration.

The three new migration files match already-applied hosted versions:
20261028205805_member_character_assignment, 20261028215647_pre_environment_tools and
20261028215831_expose_pre_api. Migration/isolation evidence is in RYT-017 and RYT-018.
Pages never applies database migrations. No additional production migration is needed here.

## Publication and rollback

Pushing main triggers Publish Pages automatically. GitHub Actions records the exact source
revision and repeats the release checks. Verify deployment completion and the public URL
after push; a successful Git push alone is not a verified Pages deployment.

Frontend recovery: redeploy last known-good 3ea9721 and verify public assets and backend
compatibility. Backend changes are additive; do not reset production or delete migration
history. Restore PRE only through its owner-only registered backup workflow when requested.
Real two-account Google/JWT/PostgREST and Safari remain separate integration boundaries.
