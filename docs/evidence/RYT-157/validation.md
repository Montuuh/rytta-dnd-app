# RYT-157 — Sign in with email and password

Status: in progress (2026-11-21). Frontend built and reviewed; hosted setup and checks wait for the
owner actions below.

## Owner decisions (2026-11-21)

Options page reviewed by the owner (kept locally); the recommended option was chosen in each case
except the sender.

1. Where the form lives: a second button, "Continuar con email", under Google on the landing opens
   a bottom sheet on the phone and a centred dialog on the tablet. The landing keeps its size and
   one primary action per view.
2. Switching modes: a link under the form ("¿No tienes cuenta? Crear una" / "¿Ya tienes cuenta?
   Entrar") changes the title and the action and keeps the typed email. No tabs.
3. Password policy: 10 characters or more, a single visible rule that turns green when met;
   paste and password managers allowed.
4. Email sender: a free provider with a verified single sender address and no own domain for now
   (owner choice, knowing more emails may land in spam). The move to an own domain for every
   system, the sender included, is RYT-158.

## Owner actions before hosted use

- Create the free email provider account and verify the sender address; give the SMTP host, port,
  user and the sender address (the password is entered by the owner in the Supabase dashboard).
- Create a Cloudflare Turnstile site for rytta.pages.dev and localhost; give the site key (the
  secret is entered by the owner in the Supabase dashboard).
- Supabase Auth settings: enable the email provider with confirmation, minimum password length
  10, CAPTCHA with Turnstile, redirect URLs for the reset and confirmation links, email templates
  in Spanish and English.

## Frontend (2026-11-21)

- Domain (`src/features/auth/domain/auth.ts`): the adapter gains password sign-in, sign-up,
  confirmation resend, reset request and password update; `PasswordFailure` carries one of a few
  issues (wrong credentials, unconfirmed, weak, same, rate, captcha, reauthentication,
  connection). The snapshot gains `recovery` after a reset link; `Identity.hasPassword` comes from
  `app_metadata.providers`. The one rule: 10 characters or more, counted as characters.
- Adapter (`data/supabase-auth.ts`): Supabase Auth calls with the Turnstile token when one is set,
  return links marked `?auth=confirmed` or `?auth=recovery` (removed from the address with the
  code), an existing address on sign-up answered like a new one, error codes mapped to the issues.
- UI (`features/auth/ui/`): "Continuar con email" under Google opens a bottom sheet on the phone
  and a centred dialog on the tablet (sign in, create account, check your email with a 60 s resend
  cooldown, forgot password, link sent); a new-password dialog after a reset link, mounted before
  the username prompt; "Añadir contraseña" / "Cambiar contraseña" in the account settings. Shared
  password field with a 44 px show/hide control in the tab order and the rule as its description.
- Bot check: Cloudflare Turnstile renders only with `VITE_TURNSTILE_SITE_KEY`; the CSP allows
  `https://challenges.cloudflare.com` for scripts, frames and connections.
- Copy: the landing note now says the account is created on first sign-in with Google; the
  expired-link message no longer names Google only.

### Verification

- Unit (`auth.test.ts`): the rule, the error mapping, trimming and captcha pass-through, offline
  refusal, recovery kept across a token refresh and dropped for another user, the link marker
  removed. `npm run check`: 1141 tests passed. `tests/unit/security-headers.test.ts` covers the
  Turnstile sources.
- Browser (`tests/e2e/email-auth.spec.ts`, 390 and 820 px, fixtures): sign in (wrong password,
  show/hide, Escape back to the opener, success), create account (rule refused then met, check
  your email, cooldown, change email), unconfirmed account resend, reset request with an invalid
  then a valid email and the same answer for any address, rate limit message, reset link to the
  new-password dialog (same-password refusal, saved, Continue), settings add/change with focus
  returns; axe, overflow and touch targets: 14 passed. Identity, account and username specs pass at
  390 and 820. Locally, `identity.spec.ts` at 1440 px and one `legal.spec.ts` test at 820 px fail
  with and without this work (pre-existing; CI is the gate).
- Design critique on the captures: the reset dialog actions stacked full width on the phone and the
  required asterisks removed.
- Independent UI review: changes required in round 1 (focus lost on every step change and in the
  settings, rule refusal shown by colour only, no saved confirmation after a reset, copy), PASS in
  round 2; its two minor findings (a failed bot-check script could leave the form waiting, the
  settings label after adding a password) were fixed and passed the round 3 re-review. Left as
  minor notes: the "wait for the bot check" line stays until the next submit once the token
  arrives; the settings remember a just-added password only while they stay open (after that the
  label follows `app_metadata.providers`, see below).

### Not tested yet

Real Supabase Auth with email confirmation, the free sender's delivery and spam placement, the
real Turnstile widget, password managers on real devices, iOS Safari, a reset link opened on
another device (PKCE needs the same browser; the expired-link message covers it), and whether
hosted Supabase adds `email` to `app_metadata.providers` after a Google account sets a password
(if not, the settings button says "Añadir" after a reload).

## Hosted setup (2026-11-21, in progress)

- Cloudflare Turnstile: widget "Rytta" (managed mode) in the Rytta Cloudflare account, hostnames
  `rytta.pages.dev` and `localhost`. Its public site key is the Pages build variable
  `VITE_TURNSTILE_SITE_KEY` (production, takes effect on the next deploy) and in the local
  `.env.local`; the secret key goes only into Supabase Auth, entered by the owner.
- Supabase Auth (production project): email provider settings saved with minimum password length
  10 and magic links / email OTP off; the email provider stays disabled until the custom SMTP and
  the CAPTCHA are in place. Redirect URLs added: `https://rytta.pages.dev/?auth=*`,
  `http://localhost:5173/?auth=*`, `http://localhost:5174/?auth=*`. Email templates can only be
  edited once custom SMTP is set.
- Brevo: free account created with Google sign-in as rytta.dnd@gmail.com (marketing opt-out); the
  owner completed the organization address and created the SMTP key. Sender "Rytta
  <rytta.dnd@gmail.com>" is verified (Brevo warns that a freemail domain is not recommended; the
  own domain is RYT-158).
- Supabase custom SMTP form prepared (host `smtp-relay.brevo.com`, port 587, the Brevo SMTP login,
  sender Rytta <rytta.dnd@gmail.com>) and CAPTCHA protection set to Turnstile; the owner pasted both
  secrets and saved (checked: custom SMTP on with a stored password, CAPTCHA on with Turnstile and a
  stored secret).
- Email templates "Confirm signup" and "Reset password" replaced with the Spanish-first, English
  below versions in `supabase/templates/confirmation.html` and `recovery.html`, with subjects
  "Confirma tu cuenta de Rytta · Confirm your Rytta account" and "Nueva contraseña para Rytta · New
  password for Rytta" (read back from the dashboard).
- Email provider enabled (2026-11-21). The deployed frontend shows no email sign-in until RYT-157 is
  released; the Auth API now accepts password sign-up with confirmation and the Turnstile check.
- First hosted check: on `http://localhost:5174` (this project's Auth) the real Turnstile widget
  renders in the sheet with the app theme. The sign-up stopped at its "verify you are human" box,
  which a person must tick; the confirmation and reset emails, the confirmed sign-in and the
  `app_metadata.providers` check remain to be done by the owner (test address
  rytta.dnd+prueba157@gmail.com, password kept only in the local `.env.local`).
