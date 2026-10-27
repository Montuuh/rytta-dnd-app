# Database rules

Read docs/security.md before editing. Migrations are ordered and append-only after deployment.
Every public table needs explicit grants and RLS. Test SELECT and every granted mutation.
Use private helpers with fixed search_path and auth.uid(); revoke default PUBLIC execution.
Use composite foreign keys for campaign-scoped relationships.
Keep DM secrets in separate records with separate policies; do not rely on column hiding in React.
Production application is a separate deployment step; local verification never implies deployment.
