# RYT-158 validation: own domain rytta.app

Decision: [ADR 055](../../decisions/055-own-domain.md). Status: done.

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
| Google Search Console (account that owns the OAuth app) | URL-prefix property `https://rytta.pages.dev/` | + domain property `rytta.app`, verified by the TXT record `google-site-verification=fcmxpyMx-iS9e_sIN-wfNWFZGv0eMU6BKK-Pzijcm_s` (added by hand; the offered Cloudflare authorization was not used) |
| Google Auth Platform branding (project `rytta-dnd`) | home, privacy and terms on `rytta.pages.dev`; authorized domains `rytta.pages.dev` and both Supabase project hosts | home `https://rytta.app`, privacy `https://rytta.app/privacy/`, terms `https://rytta.app/terms/`; authorized domain `rytta.app` in place of `rytta.pages.dev`, Supabase hosts kept for the OAuth redirect |
| Google brand verification | failed earlier: "the home page https://rytta.pages.dev is not registered to you" | resubmitted at the owner's request the same day ("I fixed the problems"); verified within five minutes and published: "your brand information is verified and shown to users". The Google account chooser for Rytta now reads "Ir a Rytta" with Rytta's privacy policy and terms, where it named the Supabase project host before |
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
- The email sign-in dialog on `https://rytta.app` renders the Turnstile widget with the hostname
  accepted (no domain error; it asked for the interactive check in the test browser).
- Owner checks on `https://rytta.app` after the switch (see "Check C" below).

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

## Check C: sign-in flows on rytta.app (2026-11-24)

The owner ran the checks in a browser and reported "everything OK, it works". The production Auth
logs (read through the Supabase connector) show the email flow end to end on the new origin:

- 18:56:34 UTC `POST /recover` from `https://rytta.app/?auth=recovery`, status 200
  (`user_recovery_requested`); the message left from `no-reply@rytta.app`.
- 18:57:58 UTC the link in the email: `GET /verify`, status 303 back to `https://rytta.app`.
- 18:58:00 UTC `POST /token` with the PKCE grant, provider `recovery`, referer `https://rytta.app/`:
  the verifier stored on the new origin matched, so the session started there.
- 18:58:09 UTC `PUT /user`, status 200: the new password was saved.
- 18:42:39 UTC Google sign-in started on `https://rytta.app/` (`/authorize`, provider google).
- Invitations are in-app records with no email and no link (`campaign_invitations`); nothing in
  them names an origin. No invitation was created after the switch (the latest is from 10:19
  UTC); the owner's report covers the flow, the logs do not.
- An old tab still open on `rytta.pages.dev` refreshed its session at 18:15 UTC with the former
  build; reloading it follows the redirect.

## Follow-ups outside this ticket

- Move DMARC to `p=quarantine` after two weeks of clean aggregate reports (from 2026-12-08).
- After 30 days (from 2026-12-24) remove the `rytta.pages.dev` entries from the Supabase redirect
  allowlist and the Turnstile hostnames. Keep the Bulk Redirect and the first Pages project.
- The `next` commits of this ticket reach production with the next release.
