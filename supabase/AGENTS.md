# Database rules

Read docs/security.md before editing. Migrations are ordered and append-only after deployment.
Every public table needs explicit grants and RLS. Test SELECT and every granted mutation.
Use private helpers with fixed search_path and auth.uid(); revoke default PUBLIC execution.
Use composite foreign keys for campaign-scoped relationships.
Keep DM secrets in separate records with separate policies; do not rely on column hiding in React.
Apply necessary non-destructive hosted changes and migrations within the requested delivery
without asking again. Verify target, migration history, data impact, access policies and recovery
options before applying; test and report hosted results separately from local verification.
Destructive resets, imports or data deletion require explicit authorization.

Local app traffic must use pre/pre_private; production app traffic uses public/private.
Do not copy functions/policies without remapping their schema references. The pre_admin
maintenance API is owner-only and must never be exposed through PostgREST or browser keys.
Use the fixed-target ETL; plan first, retain backup on replacement, verify counts/RLS and
cross-environment write isolation. Keep Auth shared; never duplicate sessions or secrets.
Schema changes are migrations, tested against PRE before PROD; ETL has no PRE-to-PROD path.
