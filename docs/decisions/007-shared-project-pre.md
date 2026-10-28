# ADR 007: shared-project PRE schemas

Date: 2026-10-28. Status: accepted for RYT-017.

## Context

The user selected a clone of public named pre in the existing Rytta project. Local
development needs live application tables and permissions, and a repeatable bulk copy
from production. Production must continue using public. A second paid project or a local
Docker stack is outside this delivery.

## Decision

Use public/private for production and pre/pre_private for development in project
ekscdsmniukuxqjixapu. The SDK selects pre during Vite development or a loopback preview;
the hosted production build selects public. There is no browser configuration override.
Explicit demo mode stays isolated. Auth remains shared, with the same identities, Google
provider and session service; a database schema does not bypass authentication.

An owner-only pre_admin schema provides a one-way transactional copier. It discovers the
current application tables and clones rows, functions, grants, policies, relationships and
triggers, remapping public/private references. Unsupported object kinds stop the operation.
The default command is a read-only plan. An explicit first sync creates PRE. An existing
PRE requires --replace-pre and is retained as full owner-only recovery schemas. Restore
keeps the displaced current PRE as another registered backup. No reverse data promotion.

The CLI uses a terminal-only Management API token, fixed project/schema registry and
bounded transactions without automatic retry. It can instead print SQL for the trusted
administrator connection. No maintenance credentials or functions enter the browser API.
Only pre is added to the existing Data API schema list; pre_private, pre_admin and backups
remain unexposed. See [the runbook](../pre-environment.md).

## Consequences

Local application writes and audit/idempotency operations stay in PRE. Production data
remains unchanged by ETL. Schema migrations still need rehearsal, review and explicit
target checks. An ETL refresh replaces PRE experiments with a new production snapshot;
the previous experiments remain recoverable through the retained backup.

Both environments share Auth, compute, storage quota and administrative access. PRE
contains real copied application data and must retain the source access rules. Auth,
Storage objects, Realtime and project configuration are not independent or cloned. Backup
retention requires separate maintenance. This is application-data isolation rather than
an independently isolated Supabase environment.

## Verification

See [RYT-017 evidence](../evidence/RYT-017/validation.md) for hosted row equality,
rolled-back actor probes, API denials, routing tests and untested integration layers.
