# RYT-157 — Sign in with email and password

Status: planned (2026-11-21).

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
