# RYT-092 validation: content library endpoint

Date: 2026-11-13. Migration `supabase/migrations/20261116120000_content_library.sql` (ADR 040):
tables `content_packs` and `content_entries`, `private.content_editors`, `private.content_requests`,
13 RPCs (`get_content_library`, `get_content_entries`, `list_content_drafts`, `list_content_changes`,
`get_content_draft`, `save_content_pack`, `set_content_pack_visibility`, `delete_content_pack`,
`save_content_entry`, `delete_content_entry`, `revert_content_entry`, `import_content_entries`,
`publish_content_pack`) and 12 private helpers, mirrored into PRE.

| Layer | Result |
| --- | --- |
| PGlite (`npm run test:db`) | 163 passed. `content-library.test.ts` (8 tests): drafts stay with editors until a version is published, readers keep the previous version until the next publish and never receive editor fields; revert, pending delete, fixed kinds and keys, entries of another pack refused; import dry run, refusal reasons, replay and mismatch; pagination (500 per page, `next`) and the 5000 cap per pack and kind; complete pack updates, slug rules, deletion of unpublished packs only, visibility changed only through `set_content_pack_visibility`; denials for anon (all 13 RPCs in `public` and `pre`), signed-in readers (every editor RPC) and direct table access (select, insert, update, delete, including `private.*`); no helper executable by `anon` or `authenticated`; a former editor keeps only their published private packs; PRE mirror with its own editors, environment isolation, RLS on all eight tables and no production references. `pre.test.ts` counts 47 tables. |
| Security review | Approve with fixes. Applied before the production apply: visibility of a published pack only through a dedicated RPC and complete pack updates (finding 1); advisory lock per request id so a double tap replays (2); RLS on `private.content_editors` and `private.content_requests` (3); 16 KB limit and known keys on pack payloads, SHA-256 digests as idempotency keys (5, 8); pagination and the 5000 cap (6); dry runs without locks (9); the content library section in `docs/security.md` with the takedown note (10); the missing denial tests. Documented, not changed: a PRE refresh copies editors, packs and replies from production (4); a retried request replays before the editor check, as in RYT-089 (7). |
| Hosted PRE | The remapped DDL ran inside a block that raised at the end, so nothing stayed. With the owner as PRE editor: pack saved, entry saved, version 1 published; another account read 1 pack and 1 entry, was refused writes (`Forbidden`) and table access (`permission denied`). 25 PRE functions, no `public.`/`private.` references, RLS on, no `anon` execution, helpers not executable by `authenticated`, production untouched. |
| Production | Applied with `apply_migration` as `content_library`. Verified: 8 tables (production and PRE) with RLS, 25 functions per environment, no `anon` execution, helpers not executable by `authenticated`, `authenticated` cannot select the tables, nothing in realtime, PRE mirror without production references. The owner account was granted the editor role in `private.content_editors` and `pre_private.content_editors` (one row each; granted with SQL, not recorded in the repository). Advisors: the same categories as before (`rls_enabled_no_policy` INFO, now also for the four content tables per environment; security definer functions executable by `authenticated` WARN). |

Not verified: two concurrent calls with the same request id (needs two hosted connections; the
advisory lock is not exercised by PGlite); PostgREST request size and statement timeouts with real
SRD batches (checked when the SRD is uploaded from the manager, RYT-093).
