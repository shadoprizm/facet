# Auth hardening checklist

These are Supabase dashboard settings (not SQL/code) that must be turned on
before going live. None of them can be toggled via the migration files — they
live in the dashboard or require a support ticket.

Work through each before pointing `facet.social` at production.

---

## 1. Captcha on signup / magic-link (hCaptcha or Turnstile)

**Why:** stops automated account creation the moment the domain is public.
You will get bot signups within hours otherwise.

**Dashboard:** Authentication → Sign In / Providers → Email →
"Captcha protection" → enable, paste your hCaptcha or Cloudflare Turnstile
secret + site key.

**Code (already wired):** `signUp` and `sendMagicLink` in
`src/lib/actions.ts` forward `captchaToken` from the form when present, so the
app works whether or not captcha is enabled. To turn the UI on, render the
hCaptcha/Turnstile widget on `/login` and add a hidden input named
`captchaToken` to the signup/magic-link forms.

## 2. Leaked password protection

**Why:** blocks sign-in with credentials known to be in public breach dumps
(HaveIBeenPwned). Supabase checks the SHA-1 prefix against HIBP.

**Dashboard:** Authentication → Sign In / Providers → Email →
"Leaked password protection" → enable.

**Cannot be toggled via SQL** — confirmed.

## 3. Password strength policy

**Why:** a sane minimum bars the most trivial passwords. Supabase requires
≥8 by default; raise to "Medium" or "Strong" for production.

**Dashboard:** Authentication → Policies → "Password strength" → at least
Medium. Consider Maximum session length and MFA enforcement here too.

## 4. Confirm email before first session

**Why:** without it, a signup immediately gets a working session — anyone
can post with a disposable address they don't control.

**Dashboard:** Authentication → Sign In / Providers → Email →
"Confirm email" → ENABLED. The app already handles the unconfirmed state:
`signUp` redirects to `/login?notice=Check your email…` and the magic-link
flow confirms on click.

**Already correct in `seed.sql`** for the demo user (`email_confirmed_at` is
set), so the dev login still works.

## 5. Auth rate limits

**Why:** credential stuffing and OTP轰炸.

**Dashboard:** Authentication → Rate Limits. Defaults (per Supabase docs):
- Email OTP: 30 / hour, 100 / day
- Sign-up / sign-in: ~30 / hour per IP

Confirm these are at or below the defaults. For tighter limits, Project
Settings → Auth → "Rate Limits".

## 6. URL allow-list (open redirect prevention)

**Why:** Supabase will only redirect magic-link / OAuth callbacks to listed
URLs. Without an allow-list, attackers can craft links that bounce confirmed
sessions to attacker-controlled domains.

**Dashboard:** Authentication → URL Configuration.
- **Site URL:** `https://facet.social`
- **Redirect URLs:** `https://facet.social/**`, `https://www.facet.social/**`,
  `http://localhost:3000/**` (for local dev).

The app passes `emailRedirectTo: ${SITE}/auth/confirm` — `SITE` comes from
`NEXT_PUBLIC_SITE_URL`, which must be `https://facet.social` in prod (Vercel
env var, not the `.env.local` value).

## 7. Session cookie security (Supabase-managed)

Confirm in Authentication → Settings (or Project Settings → Auth):
- Cookie name: default (`sb-<ref>-auth-token`)
- SameSite: `lax` (default — correct for this app)
- Secure: automatic in production (HTTPS)

No code change needed; the per-request client in `src/lib/supabase/server.ts`
inherits these.

## 8. Disable email signup if you go OAuth-only later

If you eventually offer Google/GitHub login only, disable the Email provider
entirely to remove the password-attack surface. Not needed for launch.

---

## Verification

After flipping each setting, test:

1. Sign up with a fresh email → confirm you receive the confirmation email
   and **cannot** navigate the app until you click it.
2. Sign up with a password from a known breach (e.g. `password123`) →
   should be rejected by the leaked-password check.
3. Magic-link redirect should land on `https://facet.social/auth/confirm`
   then `/`, never on an arbitrary URL.
