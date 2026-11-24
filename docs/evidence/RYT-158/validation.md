| Email Routing | none | enabled on `rytta.app`: `contacto@rytta.app` to the project mailbox (verified destination); MX `route1-3.mx.cloudflare.net`, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` and the routing DKIM record added and locked by Cloudflare; catch-all off | browser session approved by the owner | 2026-11-24 || Brevo sending domain | none (single sender) | `rytta.app` authenticated (manual records: `brevo-code` TXT, `brevo1._domainkey` and `brevo2._domainkey` CNAME to `b1`/`b2.rytta-app.dkim.brevo.com`, DNS only); sender `Rytta <no-reply@rytta.app>` verified | browser session approved by the owner | 2026-11-24 || Auth email sender (Supabase SMTP through Brevo) | `Rytta <rytta.dnd@gmail.com>` | `Rytta <no-reply@rytta.app>`; host, port, user and stored password unchanged | browser session approved by the owner | 2026-11-24 || Redirect from `rytta.pages.dev` | none | Bulk Redirect list `rytta_pages_dev` and rule "rytta.pages.dev to rytta.app" in the personal account: 301, preserve query string, subpath matching, preserve path suffix | browser session approved by the owner | 2026-11-24 |
| DMARC | none | `_dmarc.rytta.app` TXT `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` | browser session approved by the owner | 2026-11-24 |
| Redirect from `www.rytta.app` | none | Redirect Rule in the `rytta.app` zone: `https://www.*` to `https://${1}`, 301, preserve query string | browser session approved by the owner | 2026-11-24 || Supabase Auth Site URL | `https://rytta.pages.dev` | `https://rytta.app` (the old origin stays in the redirect allowlist) | browser session approved by the owner | 2026-11-24 |# RYT-158 validation: own domain rytta.app

Decision: [ADR 055](../../decisions/055-own-domain.md). Status: in progress.

## Domain

- `rytta.app` registered on 2026-11-24 at Cloudflare Registrar by the owner, in the Cloudflare
  account of the project mailbox (the account that already held the Turnstile widget). Registry
  data checked over RDAP the same day: registrar Cloudflare, expiry 2027-11-24, status
  `client transfer prohibited`, nameservers `bristol.ns.cloudflare.com` and
  `sam.ns.cloudflare.com`.

## Hosting account

The Pages project `rytta` (https://rytta.pages.dev) lives in the owner's personal Cloudflare
account, not in the account that holds the domain. Pages serves an apex custom domain only from
a zone in its own account, and Cloudflare refuses to connect one GitHub repository to Pages
projects in two accounts ("This repository is being used for a Cloudflare Pages project on a
different Cloudflare account"). The owner chose on 2026-11-24 to move every Rytta setting from the
personal account to the project account.

## Inventory

| Place | Before | After | Changed by | Date |
| --- | --- | --- | --- | --- |
| Turnstile widget "Rytta" hostnames | `localhost`, `rytta.pages.dev` | + `rytta.app` | browser session approved by the owner | 2026-11-24 |
| Supabase Auth redirect allowlist (production) | 11 entries, `rytta.pages.dev` and localhost | + `https://rytta.app`, `https://rytta.app/`, `https://rytta.app/?sb_flow_id=*`, `https://rytta.app/?auth=*` (15 entries) | browser session approved by the owner | 2026-11-24 |
| Supabase Auth Site URL | `https://rytta.pages.dev` | pending: `https://rytta.app` at the switch | | |
| Google OAuth client "Cliente web 4" (production) | redirect URI: the Supabase callback; no JavaScript origins | unchanged: the redirect flow returns through Supabase and needs no origin | | 2026-11-24 |
| Cloudflare Pages project | `rytta` in the personal account, connected to the repository | `rytta-app` in the project account, same build command, output, production branch and the 7 build variables plus `NODE_VERSION=24`, `VITE_SITE_URL=https://rytta.app`; preview branch deployments None | browser session approved by the owner | 2026-11-24 |
| First Pages project `rytta` | connected to the repository | repository connection removed; still serves build `1b09c73` at rytta.pages.dev | browser session approved by the owner | 2026-11-24 |
| Custom domains of `rytta-app` | none | `rytta.app` and `www.rytta.app` (CNAME records to `rytta-app.pages.dev` created by Pages) | browser session approved by the owner | 2026-11-24 |
| Redirect from `rytta.pages.dev` | none | pending | | |
| Build variable `VITE_SITE_URL` | `https://rytta.pages.dev` | `https://rytta.app` (new project) | browser session approved by the owner | 2026-11-24 |
| Build variable `VITE_CONTACT_EMAIL` | the project mailbox on gmail | pending: `contacto@rytta.app` | | |
| Auth email sender (Supabase SMTP through Brevo) | `Rytta <rytta.dnd@gmail.com>` | pending: `Rytta <no-reply@rytta.app>` | | |
| Brevo sending domain | none (single sender) | pending: `rytta.app` authenticated | | |
| Email Routing | none | pending: `contacto@rytta.app` | | |
| Google branding and Search Console | `rytta.pages.dev` | pending | | |
| Repository docs and tests | `rytta.pages.dev` | `deployment.md`, ADR 047 and 048, `offline-shell.md`, `index.html` comment, service worker unit test; ADR 055 | this delivery | 2026-11-24 |

## Check A: the site on rytta.app (2026-11-24)

- `https://rytta.app/version.json` and `https://rytta-app.pages.dev/version.json` return build
  `1b09c73ac7a8` (the main release of PR 39) built by the new project; `www.rytta.app` answers 200
  once its certificate was issued.
- Response headers of `/` and of a hashed asset are identical on `rytta.pages.dev` and
  `rytta.app` (Content-Security-Policy, X-Frame-Options DENY, nosniff, Referrer-Policy,
  Permissions-Policy, HSTS, Cross-Origin-Opener-Policy; assets `public, max-age=31536000,
  immutable`).
- Google sign-in on `https://rytta.app` with the project mailbox account returned to
  `https://rytta.app/` signed in, with its campaigns listed; no console messages.
- Not exercised yet: email and password sign-in with the Turnstile widget on the new origin,
  confirmation and reset emails, invitations.

## Switch to rytta.app (2026-11-24)

The owner asked for the switch before the email work. Results checked right after:

- `https://rytta.pages.dev/` answers 301 to `https://rytta.app/`;
  `/privacy/?a=1&b=2` to `https://rytta.app/privacy/?a=1&b=2`; `/?auth=callback&code=x` to
  `https://rytta.app/?auth=callback&code=x`.
- `https://www.rytta.app/privacy/?x=1` answers 301 to `https://rytta.app/privacy/?x=1`.
- In a browser that had used the old address, opening `https://rytta.pages.dev/` lands on
  `https://rytta.app/` with the session started there.
- Deployment addresses of the old project (`<hash>.rytta.pages.dev`) are not redirected and keep
  serving their builds; they were never shared.

## Check B: email on the domain (2026-11-24)

- A password recovery sent from the Supabase dashboard to a test account arrived in the project
  mailbox inbox (before, the gmail sender landed in spam), from `"Rytta" <no-reply@rytta.app>`,
  delivered in one second.
- Gmail's original message: `spf=pass` (Brevo bounce domain), `dkim=pass header.i=@rytta.app
  header.s=brevo1`, `dmarc=pass (p=NONE) header.from=rytta.app`.
- Not exercised yet: a message to `contacto@rytta.app` arriving through Email Routing, and the
  public contact address on the site (`VITE_CONTACT_EMAIL` still names the gmail mailbox).
