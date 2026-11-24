# ADR 055: own domain rytta.app

Date: 2026-11-24. Status: accepted. Amends ADR 047 (hosting on Cloudflare Pages) and the hosting
and cost sections of ADR 048 (environments and staging). Delivered by RYT-158.

## Context

Since 2026-11-18 Rytta has lived at https://rytta.pages.dev and the owner had deferred buying a
domain. Two problems grew out of that: Auth email (RYT-157) leaves from a free-mail sender, which
providers file as spam and which cannot be authenticated with SPF, DKIM and DMARC; and Google
brand verification needs home, privacy and terms pages on a domain the owner can prove in Search
Console. On 2026-11-24 the owner bought `rytta.app`.

## Decision

- Domain: `rytta.app`, registered at Cloudflare Registrar in the same Cloudflare account as the
  Pages project, Turnstile widget and DNS. Registered 2026-11-24, auto-renew on, WHOIS privacy on.
  The `.app` zone is on the HSTS preload list, so the site is HTTPS only, as it already was.
- Hosting account: the Pages project `rytta-app` in the same account as the domain, connected to
  the repository with the build settings and variables of the first project. Pages serves an
  apex domain only from a zone in its own account, and Cloudflare connects a repository to Pages
  in one account only, so the first project `rytta` (personal account) had its repository
  connection removed on 2026-11-24. It keeps serving its last build and is the redirect source.
- Canonical address: `https://rytta.app` (apex). `www.rytta.app` and `rytta.pages.dev` answer with
  a permanent redirect to it that keeps path and query (Cloudflare Bulk Redirects, free).
  `rytta.pages.dev` stays attached to the project so the redirect has a source; it is never
  removed.
- Build variables: `VITE_SITE_URL=https://rytta.app`; `VITE_CONTACT_EMAIL` becomes an address on
  the domain.
- Email:
  - Receiving: Cloudflare Email Routing forwards the public contact address on the domain to the
    project mailbox. No mailbox is hosted on the domain.
  - Sending: Supabase Auth keeps Brevo as SMTP relay; the sender becomes `no-reply@rytta.app`
    with the domain authenticated in Brevo (the Brevo code TXT record and two DKIM CNAME records,
    `brevo1` and `brevo2`, DNS only). Brevo sends with its own bounce domain, so DMARC
    passes through the aligned DKIM signature and the domain's SPF record stays the one Email
    Routing needs: `v=spf1 include:_spf.mx.cloudflare.net ~all`.
  - DMARC starts at `p=none` with aggregate reports to Brevo's DMARC service and moves to
    `p=quarantine` after two weeks of clean reports.
- Auth: Supabase Site URL becomes the new origin; the old origin stays in the redirect allowlist
  for 30 days after the switch so links sent before it keep a way back. Google OAuth client
  origins and the Turnstile hostnames gain the new origin the same way.
- Search Console: a domain property for `rytta.app` verified by a DNS record. The meta tag and the
  verification file in the repository keep the old URL-prefix property alive and stay.
- Nothing in the build depends on the origin: the security headers, the service worker scope, the
  manifest and every asset path are relative, so the same build serves both addresses.

## Consequences

- Cost: the domain renewal, about 14 USD a year. Every other piece (Pages custom domains, Bulk
  Redirects, Email Routing, Brevo free plan, certificates) is free.
- Sessions, preferences and offline caches are stored per origin: everyone signs in once more on
  the new address, and an app installed from `rytta.pages.dev` keeps opening the old address and
  follows the redirect until it is reinstalled.
- A confirmation or reset link requested on the old origin and opened after the switch lands on
  the new origin without its PKCE verifier; the app shows the translated way to ask again
  (RYT-157). These links expire after an hour.
- With `rytta.app` verified in Search Console, Google verified the brand on 2026-11-24: the
  account chooser shows "Rytta" and its legal pages instead of the Supabase project host, even
  though the OAuth redirect still goes through that host. No Supabase custom domain is needed.
- An expired domain takes down the app and its email at once; renewal stays automatic.
