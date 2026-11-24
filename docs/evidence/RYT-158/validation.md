# RYT-158 validation: own domain rytta.app

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

Every change below was made on 2026-11-24 in a browser session approved by the owner, unless the
row says otherwise.

| Place | Before | After |
| --- | --- | --- |
| Turnstile widget "Rytta" hostnames | `localhost`, `rytta.pages.dev` | + `rytta.app` |
| Supabase Auth redirect allowlist (production) | 11 entries, `rytta.pages.dev` and localhost | + `https://rytta.app`, `https://rytta.app/`, `https://rytta.app/?sb_flow_id=*`, `https://rytta.app/?auth=*` (15 entries) |
| Supabase Auth Site URL | `https://rytta.pages.dev` | `https://rytta.app`; the old origin stays in the redirect allowlist |
| Google OAuth client "Cliente web 4" (production) | redirect URI: the Supabase callback; no JavaScript origins | unchanged: the redirect flow returns through Supabase and needs no origin |
| Cloudflare Pages project | `rytta` in the personal account, connected to the repository | `rytta-app` in the project account: same build command, output and production branch, the 7 build variables plus `NODE_VERSION=24`; preview branch deployments None |
| First Pages project `rytta` | connected to the repository | repository connection removed; keeps serving build `1b09c73` as the redirect source |
| Custom domains of `rytta-app` | none | `rytta.app` and `www.rytta.app` (CNAME records to `rytta-app.pages.dev` created by Pages) |
| Redirect from `rytta.pages.dev` | none | Bulk Redirect list `rytta_pages_dev` and rule "rytta.pages.dev to rytta.app" in the personal account: 301, preserve query string, subpath matching, preserve path suffix |
| Redirect from `www.rytta.app` | none | Redirect Rule in the `rytta.app` zone from the "WWW to root" template: 301 to the apex, preserve query string |
| Build variable `VITE_SITE_URL` | `https://rytta.pages.dev` | `https://rytta.app` |
| Build variable `VITE_CONTACT_EMAIL` | the project mailbox on gmail | `contacto@rytta.app`; production redeployed from `1b09c73` |
| Auth email sender (Supabase SMTP through Brevo) | `Rytta <rytta.dnd@gmail.com>` | `Rytta <no-reply@rytta.app>`; host, port, user and stored password unchanged |
| Brevo sending domain | none (single sender) | `rytta.app` authenticated with manual records: `brevo-code` TXT, `brevo1._domainkey` and `brevo2._domainkey` CNAME to `b1` and `b2.rytta-app.dkim.brevo.com`, DNS only; sender `Rytta <no-reply@rytta.app>` verified |
| Email Routing | none | enabled on `rytta.app`: `contacto@rytta.app` to the project mailbox (verified destination); MX `route1` to `route3.mx.cloudflare.net`, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` and the routing DKIM record added and locked by Cloudflare; catch-all off |
| DMARC | none | `_dmarc.rytta.app` TXT `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |
| Google branding and Search Console | `rytta.pages.dev` | pending |
| Repository docs and tests | `rytta.pages.dev` | `deployment.md`, ADR 047 and 048, `offline-shell.md`, `index.html` comment, service worker unit test; ADR 055 (this delivery) |

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
  confirmation and reset links opened on the new origin, invitations.

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
- A message the owner sent from a personal address to `contacto@rytta.app` reached the project
  mailbox through Email Routing in 18 seconds: SPF pass (SRS return path on rytta.app), DKIM pass
  for gmail.com, rytta.app and cloudflare-email.net, DMARC pass, ARC pass. Gmail filed it as spam
  for its content (a one-word "test"), not for authentication. At the owner's request the project
  mailbox has a filter "to:(contacto@rytta.app): never send it to Spam" (2026-11-24); the test
  message itself stays in Spam.
