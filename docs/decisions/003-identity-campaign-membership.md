# ADR 003: Google identity and campaign membership

Date: 2026-10-27. Status: accepted for RYT-001 and RYT-002.

## Context

The user approved Google-only sign-in, a campaign hub, email-addressed in-app invitations,
multiple DMs and handing over a campaign. Registration must remain open: no email allowlist.
Gameplay permissions will be defined by each module. This delivery provisions no hosted services.

## Decisions

- Supabase Auth with Google OAuth/PKCE, persisted SDK session and exact base-path redirects.
  No password screen, anonymous login, application allowlist or custom identity service.
- After login, show My campaigns and pending invitations, including for existing members.
  Users may create campaigns; creation atomically makes the creator a DM. Campaign URLs
  carry the campaign ID; membership and role are checked before rendering campaign content.
- Roles are `dm` and `player` per campaign. DMs may invite, promote, demote and remove members.
  Any active member may leave. The last DM cannot leave or be demoted/removed.
  Promote a successor before stepping down. All membership writes serialize on the campaign row.
- `owner_id` remains immutable historical creator attribution and confers no authority.
  This supersedes any implication in the scaffold that the creator has permanent control.
- Invitations target a normalized email, last seven days, and are accepted/declined explicitly.
  Match against the current confirmed email in `auth.users`, never user-editable metadata.
  New membership always starts as Player. Reissue cancels the old invitation; acceptance
  and membership activation are one transaction. Replayed/expired/revoked invites fail.
- Invitations live inside Rytta. No automatic email is sent and no SMTP/Resend account is
  required. UI explains this to the DM. Email notifications are a separate future delivery.
- Revocation deactivates membership without deleting characters or resources. RLS checks active
  membership. Reinvitation may reactivate the same membership as Player. Pending invitations
  for a removed person are revoked in that campaign.
- Private query keys include user and campaign IDs. Identity changes cancel and remove
  queries; sign-out hides private views before network completion. No persisted private cache.
- Demo remains explicit and read-only, without OAuth/network calls or fake saved mutations.

## Verification boundary

SQL policy tests use PGlite with an Auth shim; browser fixtures simulate the public Auth/REST
contract. Neither verifies hosted Google, JWT issuance, PostgREST or concurrent PostgreSQL
connections. Hosted multi-account testing and real mobile Safari remain release gates.
