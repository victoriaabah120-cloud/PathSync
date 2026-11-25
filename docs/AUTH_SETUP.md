# Authentication setup

PathSync uses Supabase Auth. Confirmation emails must always return people to the
deployed site, never to `localhost`.

| Piece | Value |
| --- | --- |
| Frontend (deployed) | https://pathsync-frontend-ddee.onrender.com |
| Backend (deployed) | https://pathsync.onrender.com |
| Supabase project | https://xmhscjxirtaufafqzhll.supabase.co |
| Local frontend | http://localhost:5173 |

## How the redirect is chosen

`frontend/src/services/supabase.js` exports `siteUrl()`:

- on `localhost` / `127.0.0.1` / `*.local` it returns the current origin, so local
  development keeps working;
- everywhere else it returns `VITE_SITE_URL` if set, otherwise
  `https://pathsync-frontend-ddee.onrender.com`.

Sign-up and resend both pass that value as `emailRedirectTo`, so the link in the
email cannot fall back to a localhost default.

Confirmation links land on the **site root** on purpose. Render serves the root for
every visitor, while a deep link such as `/auth/callback` returns `Not Found` unless a
rewrite rule exists. The app handles the returned tokens wherever it is opened.
`/auth/callback` still exists and works if you add the rewrite.

## Supabase Dashboard settings (manual, one time)

Authentication → URL Configuration:

- **Site URL**: `https://pathsync-frontend-ddee.onrender.com`
- **Redirect URLs** (add all three):
  - `https://pathsync-frontend-ddee.onrender.com/**`
  - `http://localhost:5173/**`
  - `http://127.0.0.1:5173/**`

Authentication → Sign In / Providers → Email:

- **Confirm email**: on
- Email template "Confirm signup": keep `{{ .ConfirmationURL }}` as the link.

A redirect URL that is not on that list is silently replaced by the Site URL, which is
why the default `http://localhost:3000` used to open in the browser.

## Render settings

Frontend static site → Environment:

- `VITE_SUPABASE_URL=https://xmhscjxirtafafqzhll.supabase.co` (use the exact project URL)
- `VITE_SUPABASE_ANON_KEY=<anon public key>`
- `VITE_API_BASE_URL=https://pathsync.onrender.com`
- `VITE_SITE_URL` is optional; leave it unset unless you move to another domain.

Optional, only if you want `/auth/callback` to work directly: add a rewrite rule
`/*` → `/index.html` with action **Rewrite** (not Redirect).

Backend service → Environment:

- `FRONTEND_URL=https://pathsync-frontend-ddee.onrender.com`
- `ENVIRONMENT=production`

The backend allows the production frontend origin even when `FRONTEND_URL` is unset,
so a missing variable can no longer break CORS.

## How the flow works

1. **Sign up** (`Login.jsx`) sends `emailRedirectTo` and tells the user to check their
   inbox. If Supabase already knows the address, it says so instead of pretending.
2. **Click the link** in the email → Supabase verifies the token and redirects to the
   site root with the session attached.
3. **`AuthContext`** calls `completeAuthRedirect()` before reading the session. It
   handles the three shapes Supabase can return (`#access_token`, `?code`,
   `?token_hash`), turns expired-link errors into a readable message, and cleans the
   address bar.
4. **Routing** sends a signed-in user with a career to `/home`, and a new user to
   `/intent`. The session is persisted by supabase-js, so a refresh keeps them in.
5. **Signing in before confirming** shows `email_not_confirmed` as a plain explanation
   with a **Resend confirmation email** button (`supabase.auth.resend({ type: "signup" })`).
6. **`/verify-email`** catches the rare case of a session whose email is unconfirmed.

## Manual test checklist

1. Sign up with a real address you can open.
2. In Gmail, click the confirmation link: the address bar must show
   `pathsync-frontend-ddee.onrender.com`, never `localhost`.
3. Land signed in, then reload: you should stay signed in.
4. Sign out, sign in again with the same password: it should succeed.
5. Try signing in with an unconfirmed address: you should get the explanation plus the
   resend button.
