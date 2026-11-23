# ADR 054: only super admins write the content library

Date: 2026-11-23. Status: accepted. Amends ADR 040 (content library) and ADR 051 (campaigns choose
content packs).

## Context

ADR 040 limited writing to content editors, a platform role granted outside the repository, and
RYT-153 gave super admins every editor right. Any editor could edit, publish or change the
visibility of any pack, the SRD included. A library audit (2026-11-23) found two editor grants in
production, one of them an account that is not a super admin and that owned both public packs.

The owner wants the downloadable base data set by super admins alone for now (2026-11-23): the SRD
pack will be changed by hand into Rytta's own base data, and a second writing role widens who can
change what every campaign downloads.

## Decision

1. **One writing role.** `private.is_content_editor()` answers only for super admins, in both
   environments. Every library write, draft read, private pack offer and picture upload follows it.
2. **The editor grant is retired, not deleted.** `private.content_editors` stays (migrations are
   append-only, and account deletion still clears it) and its rows grant nothing.
3. **Public packs belong to a super admin.** The SRD and the Rytta basics are owned by the super
   admin account in each environment, so ownership, offers and the default item packs follow the
   account that writes them. Ownership alone grants no write.
4. **Readers do not change.** Signed-in accounts read published public packs, an owner reads their
   own published private packs, and campaigns read what they pin.

## Consequences

- A private pack is offered to campaigns by super admins only; the rule that an owner offers only
  to campaigns they run no longer has a caller.
- An owner who is not a super admin keeps what owning gave for reading: their published private
  pack in the library and every picture of their pack, drafts included (ADR 053). They can no
  longer list or remove the campaigns it is offered to; a super admin does. No such pack existed
  in production or PRE when this was decided.
- An environment without a super admin has no writer. Staging has none, and no packs.
- Comments in earlier migrations that name content editors or the owner as writers describe the
  rule before this decision.
- A per-pack editor role, or packs authored by DMs, would be a new decision with its own
  ownership checks; this role was never scoped to a pack.
- An account that could write keeps replaying its own stored request results (ids and counts
  only), as before.
